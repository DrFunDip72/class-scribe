create policy "Worker reads all results"
on public.transcription_results for select
to authenticated
using ((select public.is_worker()));
