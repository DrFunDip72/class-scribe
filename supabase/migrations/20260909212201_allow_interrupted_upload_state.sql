alter table public.transcription_jobs
drop constraint transcription_jobs_uploaded_media_check;

alter table public.transcription_jobs
add constraint transcription_jobs_uploaded_media_check
check (
  (
    storage_path is null
    and mime_type is null
    and size_bytes is null
    and (
      status = 'uploading'
      or (status = 'failed' and error_code = 'upload_failed')
    )
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
