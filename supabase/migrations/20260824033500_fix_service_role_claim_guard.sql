create or replace function public.claim_next_job(p_worker_id text)
returns setof public.transcription_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
begin
  if not public.is_worker()
     and coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Worker authorization required';
  end if;

  update public.transcription_jobs
  set status = 'queued',
      progress = 0,
      stage = 'Recovered after worker interruption',
      claimed_by = null,
      lease_expires_at = null
  where status in ('transcribing', 'summarizing')
    and lease_expires_at < now()
    and attempt_count < 3;

  select id into v_job_id
  from public.transcription_jobs
  where status = 'queued' and attempt_count < 3
  order by created_at, id
  for update skip locked
  limit 1;

  if v_job_id is null then
    return;
  end if;

  update public.transcription_jobs
  set status = 'transcribing',
      progress = 5,
      stage = 'Preparing audio',
      attempt_count = attempt_count + 1,
      claimed_by = p_worker_id,
      lease_expires_at = now() + interval '20 minutes',
      started_at = coalesce(started_at, now()),
      error_code = null,
      error_message = null
  where id = v_job_id;

  return query
  select * from public.transcription_jobs where id = v_job_id;
end;
$$;

revoke execute on function public.claim_next_job(text) from public, anon;
grant execute on function public.claim_next_job(text) to authenticated, service_role;
