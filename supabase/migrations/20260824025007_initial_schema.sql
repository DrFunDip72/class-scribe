create extension if not exists pgcrypto;

create type public.job_status as enum (
  'queued',
  'transcribing',
  'summarizing',
  'completed',
  'failed'
);

create table public.upload_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  file_count smallint not null check (file_count between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transcription_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.upload_batches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  duration_seconds numeric,
  status public.job_status not null default 'queued',
  progress smallint not null default 0 check (progress between 0 and 100),
  stage text not null default 'Waiting in queue',
  attempt_count smallint not null default 0 check (attempt_count between 0 and 3),
  claimed_by text,
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_path = user_id::text || '/' || id::text || '/' || original_filename)
);

create table public.transcription_results (
  job_id uuid primary key references public.transcription_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  detected_language text,
  transcript text not null,
  summary text not null,
  key_points text[] not null default '{}',
  action_items text[] not null default '{}',
  segments jsonb not null default '[]'::jsonb,
  transcription_model text not null,
  summary_model text not null,
  processing_seconds numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.worker_heartbeats (
  worker_id text primary key,
  state text not null check (state in ('idle', 'processing', 'offline')),
  current_job_id uuid references public.transcription_jobs(id) on delete set null,
  version text not null,
  last_seen_at timestamptz not null default now()
);

create table public.completion_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.transcription_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending', 'delivered', 'failed')),
  external_reference text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index upload_batches_user_created_idx
  on public.upload_batches (user_id, created_at desc);
create index transcription_jobs_user_created_idx
  on public.transcription_jobs (user_id, created_at desc);
create index transcription_jobs_queue_idx
  on public.transcription_jobs (created_at)
  where status = 'queued';
create index transcription_jobs_lease_idx
  on public.transcription_jobs (lease_expires_at)
  where status in ('transcribing', 'summarizing');
create index transcription_jobs_batch_idx
  on public.transcription_jobs (batch_id);
create index transcription_results_user_idx
  on public.transcription_results (user_id, created_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger upload_batches_set_updated_at
before update on public.upload_batches
for each row execute function public.set_updated_at();

create trigger transcription_jobs_set_updated_at
before update on public.transcription_jobs
for each row execute function public.set_updated_at();

create trigger transcription_results_set_updated_at
before update on public.transcription_results
for each row execute function public.set_updated_at();

alter table public.upload_batches enable row level security;
alter table public.transcription_jobs enable row level security;
alter table public.transcription_results enable row level security;
alter table public.worker_heartbeats enable row level security;
alter table public.completion_events enable row level security;

create policy "Users read their batches"
on public.upload_batches for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users delete their batches"
on public.upload_batches for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users read their jobs"
on public.transcription_jobs for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users delete their jobs"
on public.transcription_jobs for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users read their results"
on public.transcription_results for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Signed-in users read worker health"
on public.worker_heartbeats for select
to authenticated
using (true);

create policy "Users read their completion events"
on public.completion_events for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.upload_batches from anon, authenticated;
revoke all on public.transcription_jobs from anon, authenticated;
revoke all on public.transcription_results from anon, authenticated;
revoke all on public.worker_heartbeats from anon, authenticated;
revoke all on public.completion_events from anon, authenticated;
grant select, delete on public.upload_batches to authenticated;
grant select, delete on public.transcription_jobs to authenticated;
grant select on public.transcription_results to authenticated;
grant select on public.worker_heartbeats to authenticated;
grant select on public.completion_events to authenticated;
grant usage on type public.job_status to authenticated;

create function public.create_upload_batch(p_label text, p_files jsonb)
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
  v_storage_path text;
  v_size bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(p_files) <> 'array' then
    raise exception 'Files must be an array';
  end if;

  v_file_count := jsonb_array_length(p_files);
  if v_file_count < 1 or v_file_count > 5 then
    raise exception 'A batch must contain between one and five files';
  end if;

  insert into public.upload_batches (id, user_id, label, file_count)
  values (v_batch_id, v_user_id, nullif(trim(p_label), ''), v_file_count);

  for v_file in select value from jsonb_array_elements(p_files)
  loop
    v_job_id := (v_file->>'job_id')::uuid;
    v_filename := v_file->>'original_filename';
    v_storage_path := v_file->>'storage_path';
    v_size := (v_file->>'size_bytes')::bigint;

    if v_filename is null or length(v_filename) > 240 then
      raise exception 'Invalid filename';
    end if;
    if v_size < 1 or v_size > 52428800 then
      raise exception 'File exceeds the 50 MB limit';
    end if;
    if v_storage_path <> v_user_id::text || '/' || v_job_id::text || '/' || v_filename then
      raise exception 'Invalid storage path';
    end if;

    insert into public.transcription_jobs (
      id, batch_id, user_id, storage_path, original_filename, mime_type, size_bytes
    ) values (
      v_job_id,
      v_batch_id,
      v_user_id,
      v_storage_path,
      v_filename,
      coalesce(v_file->>'mime_type', 'application/octet-stream'),
      v_size
    );
  end loop;

  return v_batch_id;
end;
$$;

create function public.retry_transcription_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.transcription_jobs
  set status = 'queued',
      progress = 0,
      stage = 'Waiting in queue',
      claimed_by = null,
      lease_expires_at = null,
      error_code = null,
      error_message = null
  where id = p_job_id
    and user_id = auth.uid()
    and status = 'failed'
    and attempt_count < 3;

  if not found then
    raise exception 'Job is not eligible for retry';
  end if;
end;
$$;

create function public.claim_next_job(p_worker_id text)
returns setof public.transcription_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
begin
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

revoke all on function public.create_upload_batch(text, jsonb) from public;
revoke all on function public.retry_transcription_job(uuid) from public;
revoke all on function public.claim_next_job(text) from public;
grant execute on function public.create_upload_batch(text, jsonb) to authenticated;
grant execute on function public.retry_transcription_job(uuid) to authenticated;
grant execute on function public.claim_next_job(text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordings',
  'recordings',
  false,
  52428800,
  array[
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a',
    'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/ogg',
    'audio/webm', 'video/mp4', 'video/webm', 'application/ogg'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Users upload recordings into their folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'recordings'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users read their recordings"
on storage.objects for select
to authenticated
using (
  bucket_id = 'recordings'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users delete their recordings"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'recordings'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
