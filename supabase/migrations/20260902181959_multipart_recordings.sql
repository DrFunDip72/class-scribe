alter table public.transcription_jobs
drop constraint if exists transcription_jobs_check;

alter table public.transcription_jobs
drop constraint if exists transcription_jobs_size_bytes_check;

alter table public.transcription_jobs
add constraint transcription_jobs_storage_path_check
check (storage_path like user_id::text || '/' || id::text || '/%')
not valid;

alter table public.transcription_jobs
validate constraint transcription_jobs_storage_path_check;

alter table public.transcription_jobs
add constraint transcription_jobs_total_size_check
check (size_bytes > 0 and size_bytes <= 1073741824)
not valid;

alter table public.transcription_jobs
validate constraint transcription_jobs_total_size_check;

create table public.transcription_job_parts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.transcription_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  part_index smallint not null check (part_index between 0 and 31),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  created_at timestamptz not null default now(),
  unique (job_id, part_index),
  check (storage_path like user_id::text || '/' || job_id::text || '/%')
);

alter table public.transcription_job_parts enable row level security;

create policy "Users read their recording parts"
on public.transcription_job_parts for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Worker reads all recording parts"
on public.transcription_job_parts for select
to authenticated
using ((select public.is_worker()));

revoke all on public.transcription_job_parts from anon, authenticated;
grant select on public.transcription_job_parts to authenticated;

create or replace function public.create_upload_batch(p_label text, p_files jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_batch_id uuid := gen_random_uuid();
  v_file jsonb;
  v_file_count integer;
  v_job_id uuid;
  v_filename text;
  v_parts jsonb;
  v_part jsonb;
  v_part_count integer;
  v_part_number integer;
  v_storage_path text;
  v_expected_path text;
  v_extension text;
  v_mime_type text;
  v_size bigint;
  v_total_size bigint;
  v_first_storage_path text;
  v_first_mime_type text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(p_files) <> 'array' then
    raise exception 'Files must be an array';
  end if;

  v_file_count := jsonb_array_length(p_files);
  if v_file_count < 1 or v_file_count > 20 then
    raise exception 'A batch must contain between one and 20 recordings';
  end if;

  insert into public.upload_batches (id, user_id, label, file_count)
  values (v_batch_id, v_user_id, nullif(trim(p_label), ''), v_file_count);

  for v_file in select value from jsonb_array_elements(p_files)
  loop
    v_job_id := (v_file->>'job_id')::uuid;
    v_filename := v_file->>'original_filename';
    v_parts := v_file->'parts';

    if v_filename is null or length(v_filename) < 1 or length(v_filename) > 240 then
      raise exception 'Invalid filename';
    end if;

    if jsonb_typeof(v_parts) = 'array' then
      v_part_count := jsonb_array_length(v_parts);
      if v_part_count < 1 or v_part_count > 32 then
        raise exception 'A recording must contain between one and 32 audio parts';
      end if;

      v_total_size := 0;
      v_first_storage_path := null;
      v_first_mime_type := null;

      for v_part, v_part_number in
        select value, ordinality::integer
        from jsonb_array_elements(v_parts) with ordinality
      loop
        v_extension := lower(coalesce(v_part->>'extension', ''));
        v_mime_type := lower(coalesce(v_part->>'mime_type', ''));
        v_size := (v_part->>'size_bytes')::bigint;
        v_expected_path := v_user_id::text || '/' || v_job_id::text || '/part-'
          || lpad(v_part_number::text, 4, '0') || '.' || v_extension;
        v_storage_path := v_part->>'storage_path';

        if v_extension not in ('mp3', 'm4a', 'wav', 'flac', 'ogg', 'webm', 'mp4') then
          raise exception 'Unsupported audio part extension';
        end if;
        if v_mime_type not in (
          'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a',
          'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/ogg',
          'audio/webm', 'application/ogg'
        ) then
          raise exception 'Unsupported audio part type';
        end if;
        if v_size < 1 or v_size > 52428800 then
          raise exception 'An audio part exceeds the 50 MB limit';
        end if;
        if v_storage_path <> v_expected_path then
          raise exception 'Invalid audio part path';
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

      insert into public.transcription_jobs (
        id, batch_id, user_id, storage_path, original_filename, mime_type, size_bytes
      ) values (
        v_job_id,
        v_batch_id,
        v_user_id,
        v_first_storage_path,
        v_filename,
        v_first_mime_type,
        v_total_size
      );

      v_part_number := 0;
      for v_part in select value from jsonb_array_elements(v_parts)
      loop
        v_extension := lower(coalesce(v_part->>'extension', ''));
        v_mime_type := lower(coalesce(v_part->>'mime_type', ''));
        v_size := (v_part->>'size_bytes')::bigint;
        v_storage_path := v_part->>'storage_path';

        insert into public.transcription_job_parts (
          job_id, user_id, part_index, storage_path, mime_type, size_bytes
        ) values (
          v_job_id, v_user_id, v_part_number, v_storage_path, v_mime_type, v_size
        );
        v_part_number := v_part_number + 1;
      end loop;
    else
      -- Compatibility for an older browser tab during the production rollout.
      v_storage_path := v_file->>'storage_path';
      v_size := (v_file->>'size_bytes')::bigint;
      v_mime_type := lower(coalesce(v_file->>'mime_type', 'application/octet-stream'));

      if v_size < 1 or v_size > 52428800 then
        raise exception 'File exceeds the 50 MB limit';
      end if;
      if v_storage_path <> v_user_id::text || '/' || v_job_id::text || '/' || v_filename then
        raise exception 'Invalid storage path';
      end if;

      insert into public.transcription_jobs (
        id, batch_id, user_id, storage_path, original_filename, mime_type, size_bytes
      ) values (
        v_job_id, v_batch_id, v_user_id, v_storage_path, v_filename, v_mime_type, v_size
      );
    end if;
  end loop;

  return v_batch_id;
end;
$$;

revoke execute on function public.create_upload_batch(text, jsonb) from public, anon;
grant execute on function public.create_upload_batch(text, jsonb) to authenticated;
