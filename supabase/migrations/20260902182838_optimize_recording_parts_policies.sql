drop policy if exists "Users read their recording parts"
on public.transcription_job_parts;

drop policy if exists "Worker reads all recording parts"
on public.transcription_job_parts;

create policy "Users and worker read permitted recording parts"
on public.transcription_job_parts for select
to authenticated
using (
  (select auth.uid()) = user_id
  or (select public.is_worker())
);

create index transcription_job_parts_user_id_idx
on public.transcription_job_parts (user_id);
