-- In-app recordings reach GitHub the same way Drive imports do.
--
-- A Drive import is published because `drive_ingestions` carries the course,
-- the lecture date, and the publication state for the automation to act on. An
-- app recording had none of that, so `export_completed` never saw it. This adds
-- the symmetrical record, plus the retention flag the worker needs so the audio
-- survives long enough for the owner session to archive it to Drive.

alter table public.transcription_jobs
  add column retain_source_audio boolean not null default false;

comment on column public.transcription_jobs.retain_source_audio is
  'When true the worker leaves the uploaded audio parts in storage after completing, so the owner automation can archive them to Drive and publish the public asset.';

create table public.app_recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null unique references public.transcription_jobs(id) on delete cascade,
  source_filename text not null check (length(source_filename) between 1 and 240),
  course_code text not null check (course_code in ('HRM-391', 'PSE-390', 'STRAT-392', 'PHIL-201')),
  lecture_date date not null,
  -- recorded -> archived (audio is in Drive) -> exported (note is on GitHub)
  status text not null default 'recorded' check (
    status in ('recorded', 'archived', 'exported', 'needs_review', 'failed')
  ),
  archived_path text,
  archived_bytes bigint,
  github_repository text,
  github_path text,
  github_sha text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_code, lecture_date, job_id)
);

create index app_recordings_pending_idx
on public.app_recordings (created_at)
where status in ('recorded', 'archived');

create trigger app_recordings_set_updated_at
before update on public.app_recordings
for each row execute function public.set_updated_at();

alter table public.app_recordings enable row level security;

create policy "Users read their app recordings"
on public.app_recordings for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Worker reads app recordings"
on public.app_recordings for select
to authenticated
using ((select public.is_worker()));

create policy "Worker updates app recordings"
on public.app_recordings for update
to authenticated
using ((select public.is_worker()))
with check ((select public.is_worker()));

revoke all on public.app_recordings from anon, authenticated;
grant select, update on public.app_recordings to authenticated;

-- Called by the Record screen after `queue_uploaded_recording` accepts the
-- upload. Returns null rather than raising when the class is not one of the
-- four courses with a public repository, so the app can call it unconditionally
-- and a personal class simply transcribes without publishing.
create function public.register_app_recording(
  p_job_id uuid,
  p_course_code text,
  p_lecture_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_job public.transcription_jobs%rowtype;
  v_existing uuid;
  v_recording_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_lecture_date is null then
    raise exception 'Lecture date is required';
  end if;
  if upper(coalesce(trim(p_course_code), '')) not in ('HRM-391', 'PSE-390', 'STRAT-392', 'PHIL-201') then
    return null;
  end if;

  select * into v_job
  from public.transcription_jobs
  where id = p_job_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Recording job not found';
  end if;
  if v_job.status not in ('queued', 'transcribing', 'summarizing', 'completed') then
    raise exception 'Recording job is not queued yet';
  end if;

  select id into v_existing from public.app_recordings where job_id = p_job_id;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Set before inserting: if the insert fails the worker still keeps the audio,
  -- which is recoverable. The reverse order could lose it.
  update public.transcription_jobs
  set retain_source_audio = true,
      updated_at = now()
  where id = p_job_id;

  insert into public.app_recordings (
    user_id, job_id, source_filename, course_code, lecture_date
  ) values (
    v_user_id,
    p_job_id,
    coalesce(nullif(trim(v_job.original_filename), ''), 'recording.m4a'),
    upper(trim(p_course_code)),
    p_lecture_date
  )
  returning id into v_recording_id;

  return v_recording_id;
end;
$$;

revoke execute on function public.register_app_recording(uuid, text, date) from public, anon;
grant execute on function public.register_app_recording(uuid, text, date) to authenticated;

-- The automation clears retention itself once the audio is safely in Drive, so
-- a stalled archive can never silently drop a lecture.
create function public.release_app_recording_audio(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_worker() then
    raise exception 'Worker authorization required';
  end if;
  update public.transcription_jobs
  set retain_source_audio = false,
      updated_at = now()
  where id = p_job_id;
end;
$$;

revoke execute on function public.release_app_recording_audio(uuid) from public, anon;
grant execute on function public.release_app_recording_audio(uuid) to authenticated;
