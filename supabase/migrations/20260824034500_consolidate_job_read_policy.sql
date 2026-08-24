drop policy if exists "Users read their jobs" on public.transcription_jobs;
drop policy if exists "Worker reads all jobs" on public.transcription_jobs;

create policy "Users and worker read permitted jobs"
on public.transcription_jobs for select
to authenticated
using ((select auth.uid()) = user_id or (select public.is_worker()));
