drop policy "Users read their results" on public.transcription_results;
drop policy "Worker reads all results" on public.transcription_results;

create policy "Owners and worker read results"
on public.transcription_results for select
to authenticated
using (
  (select auth.uid()) = user_id
  or (select public.is_worker())
);
