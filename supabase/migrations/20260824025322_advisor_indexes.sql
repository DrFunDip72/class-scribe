create index completion_events_user_id_idx
  on public.completion_events (user_id);

create index worker_heartbeats_current_job_id_idx
  on public.worker_heartbeats (current_job_id)
  where current_job_id is not null;
