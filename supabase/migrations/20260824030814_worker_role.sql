create function public.is_worker()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((auth.jwt()->'app_metadata'->>'role') = 'worker', false);
$$;

revoke all on function public.is_worker() from public, anon;
grant execute on function public.is_worker() to authenticated;

create policy "Worker reads all jobs"
on public.transcription_jobs for select
to authenticated
using ((select public.is_worker()));

create policy "Worker updates all jobs"
on public.transcription_jobs for update
to authenticated
using ((select public.is_worker()))
with check ((select public.is_worker()));

create policy "Worker writes results"
on public.transcription_results for insert
to authenticated
with check ((select public.is_worker()));

create policy "Worker updates results"
on public.transcription_results for update
to authenticated
using ((select public.is_worker()))
with check ((select public.is_worker()));

create policy "Worker writes heartbeats"
on public.worker_heartbeats for insert
to authenticated
with check ((select public.is_worker()));

create policy "Worker updates heartbeats"
on public.worker_heartbeats for update
to authenticated
using ((select public.is_worker()))
with check ((select public.is_worker()));

create policy "Worker writes completion events"
on public.completion_events for insert
to authenticated
with check ((select public.is_worker()));

create policy "Worker updates completion events"
on public.completion_events for update
to authenticated
using ((select public.is_worker()))
with check ((select public.is_worker()));

create policy "Worker reads recordings"
on storage.objects for select
to authenticated
using (bucket_id = 'recordings' and (select public.is_worker()));

create policy "Worker deletes recordings"
on storage.objects for delete
to authenticated
using (bucket_id = 'recordings' and (select public.is_worker()));

grant select, update on public.transcription_jobs to authenticated;
grant select, insert, update on public.transcription_results to authenticated;
grant select, insert, update on public.worker_heartbeats to authenticated;
grant select, insert, update on public.completion_events to authenticated;

create or replace function public.claim_next_job(p_worker_id text)
returns setof public.transcription_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
begin
  if not public.is_worker() and current_user <> 'service_role' then
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
