alter table public.transcription_jobs
alter column storage_path drop not null,
alter column mime_type drop not null,
alter column size_bytes drop not null;

alter table public.transcription_jobs
add constraint transcription_jobs_uploaded_media_check
check (
  (
    status = 'uploading'
    and storage_path is null
    and mime_type is null
    and size_bytes is null
  )
  or
  (
    status <> 'uploading'
    and storage_path is not null
    and mime_type is not null
    and size_bytes is not null
  )
)
not valid;

alter table public.transcription_jobs
validate constraint transcription_jobs_uploaded_media_check;

comment on column public.transcription_jobs.status is
  'Upload and processing lifecycle. Uploading rows are never claimable by the worker.';

create function public.begin_upload_batch(p_label text, p_files jsonb)
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
  v_transcription_tier text;
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
  if length(coalesce(trim(p_label), '')) > 80 then
    raise exception 'Batch label is too long';
  end if;

  insert into public.upload_batches (id, user_id, label, file_count)
  values (v_batch_id, v_user_id, nullif(trim(p_label), ''), v_file_count);

  for v_file in select value from jsonb_array_elements(p_files)
  loop
    if jsonb_typeof(v_file) <> 'object' then
      raise exception 'Each file must be an object';
    end if;

    v_job_id := (v_file->>'job_id')::uuid;
    v_filename := v_file->>'original_filename';
    v_transcription_tier := lower(coalesce(v_file->>'transcription_tier', 'fast'));

    if v_filename is null or length(v_filename) < 1 or length(v_filename) > 240 then
      raise exception 'Invalid filename';
    end if;
    if v_transcription_tier not in ('fast', 'balanced', 'high') then
      raise exception 'Invalid transcription tier';
    end if;

    insert into public.transcription_jobs (
      id, batch_id, user_id, storage_path, original_filename, mime_type,
      size_bytes, status, progress, stage, transcription_tier
    ) values (
      v_job_id, v_batch_id, v_user_id, null, v_filename, null,
      null, 'uploading', 0, 'Waiting for upload', v_transcription_tier
    );
  end loop;

  return v_batch_id;
end;
$$;

create function public.queue_uploaded_recording(p_job_id uuid, p_parts jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status public.job_status;
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
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select status
  into v_status
  from public.transcription_jobs
  where id = p_job_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Upload job not found';
  end if;

  if v_status in ('queued', 'transcribing', 'summarizing', 'completed') then
    return p_job_id;
  end if;
  if v_status <> 'uploading' then
    raise exception 'Upload job is not waiting for media';
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
    if jsonb_typeof(v_part) <> 'object' then
      raise exception 'Each audio part must be an object';
    end if;

    v_extension := lower(coalesce(v_part->>'extension', ''));
    v_mime_type := lower(coalesce(v_part->>'mime_type', ''));
    v_size := (v_part->>'size_bytes')::bigint;
    v_expected_path := v_user_id::text || '/' || p_job_id::text || '/part-'
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

  v_part_number := 0;
  for v_part in select value from jsonb_array_elements(p_parts)
  loop
    v_mime_type := lower(coalesce(v_part->>'mime_type', ''));
    v_size := (v_part->>'size_bytes')::bigint;
    v_storage_path := v_part->>'storage_path';

    insert into public.transcription_job_parts (
      job_id, user_id, part_index, storage_path, mime_type, size_bytes
    ) values (
      p_job_id, v_user_id, v_part_number, v_storage_path, v_mime_type, v_size
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
  where id = p_job_id;

  return p_job_id;
end;
$$;

create function public.fail_recording_upload(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.transcription_jobs
  set status = 'failed',
      progress = 0,
      stage = 'Upload interrupted',
      attempt_count = 3,
      error_code = 'upload_failed',
      error_message = 'This recording did not finish uploading. Select it again to retry.',
      updated_at = now()
  where id = p_job_id
    and user_id = v_user_id
    and status = 'uploading';

  return found;
end;
$$;

revoke execute on function public.begin_upload_batch(text, jsonb) from public, anon;
revoke execute on function public.queue_uploaded_recording(uuid, jsonb) from public, anon;
revoke execute on function public.fail_recording_upload(uuid) from public, anon;

grant execute on function public.begin_upload_batch(text, jsonb) to authenticated;
grant execute on function public.queue_uploaded_recording(uuid, jsonb) to authenticated;
grant execute on function public.fail_recording_upload(uuid) to authenticated;
