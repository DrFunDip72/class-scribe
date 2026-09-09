revoke execute on function public.begin_upload_batch(text, jsonb) from service_role;
revoke execute on function public.queue_uploaded_recording(uuid, jsonb) from service_role;
revoke execute on function public.fail_recording_upload(uuid) from service_role;
