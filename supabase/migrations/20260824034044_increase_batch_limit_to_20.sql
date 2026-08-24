alter table public.upload_batches
drop constraint upload_batches_file_count_check;

alter table public.upload_batches
add constraint upload_batches_file_count_check
check (file_count between 1 and 20)
not valid;

alter table public.upload_batches
validate constraint upload_batches_file_count_check;

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
  v_storage_path text;
  v_size bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(p_files) <> 'array' then
    raise exception 'Files must be an array';
  end if;

  v_file_count := jsonb_array_length(p_files);
  if v_file_count < 1 or v_file_count > 20 then
    raise exception 'A batch must contain between one and 20 files';
  end if;

  insert into public.upload_batches (id, user_id, label, file_count)
  values (v_batch_id, v_user_id, nullif(trim(p_label), ''), v_file_count);

  for v_file in select value from jsonb_array_elements(p_files)
  loop
    v_job_id := (v_file->>'job_id')::uuid;
    v_filename := v_file->>'original_filename';
    v_storage_path := v_file->>'storage_path';
    v_size := (v_file->>'size_bytes')::bigint;

    if v_filename is null or length(v_filename) > 240 then
      raise exception 'Invalid filename';
    end if;
    if v_size < 1 or v_size > 52428800 then
      raise exception 'File exceeds the 50 MB limit';
    end if;
    if v_storage_path <> v_user_id::text || '/' || v_job_id::text || '/' || v_filename then
      raise exception 'Invalid storage path';
    end if;

    insert into public.transcription_jobs (
      id, batch_id, user_id, storage_path, original_filename, mime_type, size_bytes
    ) values (
      v_job_id,
      v_batch_id,
      v_user_id,
      v_storage_path,
      v_filename,
      coalesce(v_file->>'mime_type', 'application/octet-stream'),
      v_size
    );
  end loop;

  return v_batch_id;
end;
$$;

revoke execute on function public.create_upload_batch(text, jsonb) from public, anon;
grant execute on function public.create_upload_batch(text, jsonb) to authenticated;
