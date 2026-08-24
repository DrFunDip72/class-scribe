revoke execute on function public.create_upload_batch(text, jsonb) from anon;
revoke execute on function public.retry_transcription_job(uuid) from anon;
revoke execute on function public.claim_next_job(text) from anon, authenticated;

grant execute on function public.create_upload_batch(text, jsonb) to authenticated;
grant execute on function public.retry_transcription_job(uuid) to authenticated;
grant execute on function public.claim_next_job(text) to service_role;
