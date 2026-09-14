create index drive_ingestions_user_id_idx
on public.drive_ingestions (user_id);

drop policy "Users read their Drive ingestions" on public.drive_ingestions;
drop policy "Worker reads Drive ingestions" on public.drive_ingestions;

create policy "Owners and worker read Drive ingestions"
on public.drive_ingestions for select
to authenticated
using (
  (select auth.uid()) = user_id
  or (select public.is_worker())
);
