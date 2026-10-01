-- Account-scoped application preferences that are not about notifications.
-- The first is the default transcription tier, which moves out of the upload
-- form and into Settings so the recording flow stays uncluttered.
create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_transcription_tier text not null default 'balanced'
    check (default_transcription_tier in ('fast', 'balanced', 'high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_preferences_set_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

alter table public.user_preferences enable row level security;

create policy "Users read their preferences"
on public.user_preferences for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users create their preferences"
on public.user_preferences for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users update their preferences"
on public.user_preferences for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on public.user_preferences from anon, authenticated;
grant select, insert, update on public.user_preferences to authenticated;
