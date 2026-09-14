create table public.drive_ingestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  drive_file_id text not null,
  drive_modified_time timestamptz not null,
  drive_size_bytes bigint not null check (drive_size_bytes > 0),
  source_filename text not null check (length(source_filename) between 1 and 240),
  course_code text not null check (course_code in ('HRM-391', 'PSE-390', 'STRAT-392', 'PHIL-201')),
  lecture_date date not null,
  source_part smallint,
  job_id uuid not null unique references public.transcription_jobs(id) on delete cascade,
  status text not null default 'uploading' check (
    status in ('uploading', 'queued', 'processing', 'completed', 'exported', 'needs_review', 'failed')
  ),
  github_repository text,
  github_path text,
  github_sha text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (drive_file_id, drive_modified_time)
);

create index drive_ingestions_pending_export_idx
on public.drive_ingestions (created_at)
where status in ('queued', 'processing', 'completed');

create trigger drive_ingestions_set_updated_at
before update on public.drive_ingestions
for each row execute function public.set_updated_at();

alter table public.drive_ingestions enable row level security;

create policy "Users read their Drive ingestions"
on public.drive_ingestions for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Worker reads Drive ingestions"
on public.drive_ingestions for select
to authenticated
using ((select public.is_worker()));

create policy "Worker inserts Drive ingestions"
on public.drive_ingestions for insert
to authenticated
with check ((select public.is_worker()));

create policy "Worker updates Drive ingestions"
on public.drive_ingestions for update
to authenticated
using ((select public.is_worker()))
with check ((select public.is_worker()));

revoke all on public.drive_ingestions from anon, authenticated;
grant select, insert, update on public.drive_ingestions to authenticated;

create policy "Worker uploads imported recordings"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'recordings'
  and (select public.is_worker())
);

create policy "Worker updates imported recordings"
on storage.objects for update
to authenticated
using (
  bucket_id = 'recordings'
  and (select public.is_worker())
)
with check (
  bucket_id = 'recordings'
  and (select public.is_worker())
);

create function public.begin_drive_ingestion(
  p_owner_email text,
  p_drive_file_id text,
  p_drive_modified_time timestamptz,
  p_drive_size_bytes bigint,
  p_source_filename text,
  p_course_code text,
  p_lecture_date date,
  p_source_part smallint,
  p_job_id uuid,
  p_transcription_tier text default 'high'
)
returns setof public.drive_ingestions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_batch_id uuid := gen_random_uuid();
  v_ingestion_id uuid;
  v_existing public.drive_ingestions%rowtype;
begin
  if not public.is_worker() then
    raise exception 'Worker authorization required';
  end if;
  if length(coalesce(trim(p_drive_file_id), '')) < 1 then
    raise exception 'Drive file ID is required';
  end if;
  if p_drive_modified_time is null or p_drive_size_bytes < 1 then
    raise exception 'Drive file metadata is invalid';
  end if;
  if length(coalesce(trim(p_source_filename), '')) not between 1 and 240 then
    raise exception 'Source filename is invalid';
  end if;
  if p_course_code not in ('HRM-391', 'PSE-390', 'STRAT-392', 'PHIL-201') then
    raise exception 'Course code is invalid';
  end if;
  if p_lecture_date is null then
    raise exception 'Lecture date is required';
  end if;
  if p_source_part is not null and p_source_part not between 1 and 99 then
    raise exception 'Source part is invalid';
  end if;
  if lower(coalesce(p_transcription_tier, '')) not in ('fast', 'balanced', 'high') then
    raise exception 'Transcription tier is invalid';
  end if;

  select * into v_existing
  from public.drive_ingestions
  where drive_file_id = trim(p_drive_file_id)
    and drive_modified_time = p_drive_modified_time;

  if found then
    return next v_existing;
    return;
  end if;

  select id into v_owner_id
  from auth.users
  where lower(email) = lower(trim(p_owner_email))
    and email_confirmed_at is not null;

  if v_owner_id is null then
    raise exception 'Confirmed owner account was not found';
  end if;

  insert into public.upload_batches (id, user_id, label, file_count)
  values (
    v_batch_id,
    v_owner_id,
    'Drive import ' || p_course_code || ' ' || p_lecture_date::text,
    1
  );

  insert into public.transcription_jobs (
    id, batch_id, user_id, storage_path, original_filename, mime_type,
    size_bytes, status, progress, stage, transcription_tier
  ) values (
    p_job_id, v_batch_id, v_owner_id, null, trim(p_source_filename), null,
    null, 'uploading', 0, 'Preparing Drive recording', lower(p_transcription_tier)
  );

  insert into public.drive_ingestions (
    user_id, drive_file_id, drive_modified_time, drive_size_bytes,
    source_filename, course_code, lecture_date, source_part, job_id
  ) values (
    v_owner_id, trim(p_drive_file_id), p_drive_modified_time, p_drive_size_bytes,
    trim(p_source_filename), p_course_code, p_lecture_date, p_source_part, p_job_id
  )
  returning id into v_ingestion_id;

  return query
  select * from public.drive_ingestions where id = v_ingestion_id;
end;
$$;

create function public.queue_drive_ingestion(
  p_ingestion_id uuid,
  p_parts jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ingestion public.drive_ingestions%rowtype;
  v_job_status public.job_status;
  v_part jsonb;
  v_part_count integer;
  v_part_number integer;
  v_storage_path text;
  v_expected_path text;
  v_extension text;
  v_mime_type text;
  v_size bigint;
  v_total_size bigint := 0;
  v_first_storage_path text;
  v_first_mime_type text;
begin
  if not public.is_worker() then
    raise exception 'Worker authorization required';
  end if;

  select * into v_ingestion
  from public.drive_ingestions
  where id = p_ingestion_id
  for update;

  if not found then
    raise exception 'Drive ingestion was not found';
  end if;

  select status into v_job_status
  from public.transcription_jobs
  where id = v_ingestion.job_id
  for update;

  if v_job_status in ('queued', 'transcribing', 'summarizing', 'completed') then
    return v_ingestion.job_id;
  end if;
  if v_job_status <> 'uploading' then
    raise exception 'Drive ingestion is not waiting for media';
  end if;
  if jsonb_typeof(p_parts) <> 'array' then
    raise exception 'Audio parts must be an array';
  end if;

  v_part_count := jsonb_array_length(p_parts);
  if v_part_count < 1 or v_part_count > 32 then
    raise exception 'A recording must contain between one and 32 audio parts';
  end if;

  for v_part, v_part_number in
    select value, ordinality::integer
    from jsonb_array_elements(p_parts) with ordinality
  loop
    v_extension := lower(coalesce(v_part->>'extension', ''));
    v_mime_type := lower(coalesce(v_part->>'mime_type', ''));
    v_size := (v_part->>'size_bytes')::bigint;
    v_expected_path := v_ingestion.user_id::text || '/' || v_ingestion.job_id::text || '/part-'
      || lpad(v_part_number::text, 4, '0') || '.' || v_extension;
    v_storage_path := v_part->>'storage_path';

    if v_extension <> 'm4a' or v_mime_type not in ('audio/mp4', 'audio/x-m4a') then
      raise exception 'Drive imports must use prepared M4A parts';
    end if;
    if v_size < 1 or v_size > 52428800 then
      raise exception 'An audio part exceeds the 50 MB limit';
    end if;
    if v_storage_path <> v_expected_path then
      raise exception 'Invalid audio part path';
    end if;
    if not exists (
      select 1 from storage.objects
      where bucket_id = 'recordings'
        and name = v_storage_path
    ) then
      raise exception 'An uploaded audio part is missing';
    end if;

    v_total_size := v_total_size + v_size;
    if v_total_size > 1073741824 then
      raise exception 'Prepared recording exceeds the 1 GB safety limit';
    end if;
    if v_part_number = 1 then
      v_first_storage_path := v_storage_path;
      v_first_mime_type := v_mime_type;
    end if;
  end loop;

  delete from public.transcription_job_parts where job_id = v_ingestion.job_id;
  v_part_number := 0;
  for v_part in select value from jsonb_array_elements(p_parts)
  loop
    insert into public.transcription_job_parts (
      job_id, user_id, part_index, storage_path, mime_type, size_bytes
    ) values (
      v_ingestion.job_id,
      v_ingestion.user_id,
      v_part_number,
      v_part->>'storage_path',
      lower(v_part->>'mime_type'),
      (v_part->>'size_bytes')::bigint
    );
    v_part_number := v_part_number + 1;
  end loop;

  update public.transcription_jobs
  set storage_path = v_first_storage_path,
      mime_type = v_first_mime_type,
      size_bytes = v_total_size,
      status = 'queued',
      progress = 0,
      stage = 'Waiting to start',
      error_code = null,
      error_message = null,
      updated_at = now()
  where id = v_ingestion.job_id;

  update public.drive_ingestions
  set status = 'queued', error_message = null
  where id = v_ingestion.id;

  return v_ingestion.job_id;
end;
$$;

revoke execute on function public.begin_drive_ingestion(
  text, text, timestamptz, bigint, text, text, date, smallint, uuid, text
) from public, anon;
revoke execute on function public.queue_drive_ingestion(uuid, jsonb) from public, anon;
grant execute on function public.begin_drive_ingestion(
  text, text, timestamptz, bigint, text, text, date, smallint, uuid, text
) to authenticated;
grant execute on function public.queue_drive_ingestion(uuid, jsonb) to authenticated;
