create table public.recording_user_states (
  job_id uuid primary key references public.transcription_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  summary_copied_at timestamptz,
  transcript_copied_at timestamptz,
  everything_copied_at timestamptz,
  done_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (archived_at is null or done_at is not null)
);

create index recording_user_states_user_archive_idx
  on public.recording_user_states (user_id, archived_at, done_at);

create trigger recording_user_states_set_updated_at
before update on public.recording_user_states
for each row execute function public.set_updated_at();

alter table public.recording_user_states enable row level security;

create policy "Users read their recording state"
on public.recording_user_states for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users create state for their recordings"
on public.recording_user_states for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.transcription_jobs as job
    where job.id = recording_user_states.job_id
      and job.user_id = (select auth.uid())
  )
);

create policy "Users update state for their recordings"
on public.recording_user_states for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.transcription_jobs as job
    where job.id = recording_user_states.job_id
      and job.user_id = (select auth.uid())
  )
);

create policy "Users delete their recording state"
on public.recording_user_states for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.recording_user_states from anon, authenticated;
grant select, insert, update, delete on public.recording_user_states to authenticated;
