-- Account-managed classes. Each user owns their own list, so a second user
-- adds their own courses without touching anyone else's.
--
-- `code` is a filename-safe short form used when naming a recording
-- (`<CODE>_<YYYY-MM-DD>.<ext>`). The owner-only Drive/GitHub automation parses
-- that form, so seeding the owner's existing codes keeps it working unchanged.
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{0,31}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (user_id, code)
);

create index classes_user_idx on public.classes (user_id, archived_at, created_at);

create trigger classes_set_updated_at
before update on public.classes
for each row execute function public.set_updated_at();

alter table public.classes enable row level security;

create policy "Users read their classes"
on public.classes for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users create their classes"
on public.classes for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users update their classes"
on public.classes for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users delete their classes"
on public.classes for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.classes from anon, authenticated;
grant select, insert, update, delete on public.classes to authenticated;

-- A recording's class is now stored, not inferred from its filename.
-- Deleting a class leaves its recordings in place, merely unsorted.
alter table public.transcription_jobs
  add column class_id uuid references public.classes(id) on delete set null;

create index transcription_jobs_class_idx
on public.transcription_jobs (user_id, class_id, created_at desc);

-- Accept an optional class per file, verifying it belongs to the caller.
create or replace function public.begin_upload_batch(p_label text, p_files jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_batch_id uuid := gen_random_uuid();
  v_file jsonb;
  v_file_count integer;
  v_job_id uuid;
  v_filename text;
  v_transcription_tier text;
  v_class_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(p_files) <> 'array' then
    raise exception 'Files must be an array';
  end if;

  v_file_count := jsonb_array_length(p_files);
  if v_file_count < 1 or v_file_count > 20 then
    raise exception 'A batch must contain between one and 20 recordings';
  end if;
  if length(coalesce(trim(p_label), '')) > 80 then
    raise exception 'Batch label is too long';
  end if;

  insert into public.upload_batches (id, user_id, label, file_count)
  values (v_batch_id, v_user_id, nullif(trim(p_label), ''), v_file_count);

  for v_file in select value from jsonb_array_elements(p_files)
  loop
    if jsonb_typeof(v_file) <> 'object' then
      raise exception 'Each file must be an object';
    end if;

    v_job_id := (v_file->>'job_id')::uuid;
    v_filename := v_file->>'original_filename';
    v_transcription_tier := lower(coalesce(v_file->>'transcription_tier', 'fast'));
    v_class_id := nullif(v_file->>'class_id', '')::uuid;

    if v_filename is null or length(v_filename) < 1 or length(v_filename) > 240 then
      raise exception 'Invalid filename';
    end if;
    if v_transcription_tier not in ('fast', 'balanced', 'high') then
      raise exception 'Invalid transcription tier';
    end if;
    if v_class_id is not null and not exists (
      select 1 from public.classes
      where id = v_class_id and user_id = v_user_id
    ) then
      raise exception 'Class was not found';
    end if;

    insert into public.transcription_jobs (
      id, batch_id, user_id, storage_path, original_filename, mime_type,
      size_bytes, status, progress, stage, transcription_tier, class_id
    ) values (
      v_job_id, v_batch_id, v_user_id, null, v_filename, null,
      null, 'uploading', 0, 'Waiting for upload', v_transcription_tier, v_class_id
    );
  end loop;

  return v_batch_id;
end;
$$;

-- Reassigning a finished recording needs no broad update policy on jobs.
create function public.set_job_class(p_job_id uuid, p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if not exists (
    select 1 from public.transcription_jobs
    where id = p_job_id and user_id = v_user_id
  ) then
    raise exception 'Recording was not found';
  end if;
  if p_class_id is not null and not exists (
    select 1 from public.classes
    where id = p_class_id and user_id = v_user_id
  ) then
    raise exception 'Class was not found';
  end if;

  update public.transcription_jobs
  set class_id = p_class_id, updated_at = now()
  where id = p_job_id and user_id = v_user_id;
end;
$$;

revoke execute on function public.set_job_class(uuid, uuid) from public, anon;
grant execute on function public.set_job_class(uuid, uuid) to authenticated;
