create function public.link_drive_ingestion_to_existing_job(
  p_owner_email text,
  p_drive_file_id text,
  p_drive_modified_time timestamptz,
  p_drive_size_bytes bigint,
  p_source_filename text,
  p_course_code text,
  p_lecture_date date,
  p_source_part smallint,
  p_job_id uuid
)
returns setof public.drive_ingestions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_job_status public.job_status;
  v_ingestion_status text;
  v_ingestion_id uuid;
  v_existing public.drive_ingestions%rowtype;
begin
  if not public.is_worker() then
    raise exception 'Worker authorization required';
  end if;

  select id into v_owner_id
  from auth.users
  where lower(email) = lower(trim(p_owner_email))
    and email_confirmed_at is not null;
  if v_owner_id is null then
    raise exception 'Confirmed owner account was not found';
  end if;

  select status into v_job_status
  from public.transcription_jobs
  where id = p_job_id
    and user_id = v_owner_id;
  if not found or v_job_status not in ('queued', 'transcribing', 'summarizing', 'completed') then
    raise exception 'An eligible existing owner job was not found';
  end if;

  select * into v_existing
  from public.drive_ingestions
  where drive_file_id = trim(p_drive_file_id)
    and drive_modified_time = p_drive_modified_time;
  if found then
    return next v_existing;
    return;
  end if;

  if exists (select 1 from public.drive_ingestions where job_id = p_job_id) then
    raise exception 'The existing job is already linked to a Drive recording';
  end if;
  if length(coalesce(trim(p_source_filename), '')) not between 1 and 240
     or length(coalesce(trim(p_drive_file_id), '')) < 1
     or p_drive_size_bytes < 1
     or p_course_code not in ('HRM-391', 'PSE-390', 'STRAT-392', 'PHIL-201')
     or p_lecture_date is null
     or (p_source_part is not null and p_source_part not between 1 and 99) then
    raise exception 'Drive metadata is invalid';
  end if;

  v_ingestion_status := case v_job_status
    when 'completed' then 'completed'
    when 'transcribing' then 'processing'
    when 'summarizing' then 'processing'
    else 'queued'
  end;

  insert into public.drive_ingestions (
    user_id, drive_file_id, drive_modified_time, drive_size_bytes,
    source_filename, course_code, lecture_date, source_part, job_id, status
  ) values (
    v_owner_id, trim(p_drive_file_id), p_drive_modified_time, p_drive_size_bytes,
    trim(p_source_filename), p_course_code, p_lecture_date, p_source_part,
    p_job_id, v_ingestion_status
  )
  returning id into v_ingestion_id;

  return query
  select * from public.drive_ingestions where id = v_ingestion_id;
end;
$$;

revoke execute on function public.link_drive_ingestion_to_existing_job(
  text, text, timestamptz, bigint, text, text, date, smallint, uuid
) from public, anon;
grant execute on function public.link_drive_ingestion_to_existing_job(
  text, text, timestamptz, bigint, text, text, date, smallint, uuid
) to authenticated;
