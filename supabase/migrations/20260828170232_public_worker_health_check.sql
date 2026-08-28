create function public.worker_is_online()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.worker_heartbeats
    where state <> 'offline'
      and last_seen_at >= now() - interval '10 minutes'
  );
$$;

comment on function public.worker_is_online() is
  'Returns only whether a worker heartbeat is fresh; exposes no worker, queue, job, or user data.';

revoke all on function public.worker_is_online() from public;
grant execute on function public.worker_is_online() to anon, authenticated;
