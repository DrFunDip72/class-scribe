create table public.notification_configuration (
  key text primary key check (key = 'web_push'),
  public_value text not null check (length(public_value) between 80 and 120),
  updated_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 20 and 2048),
  p256dh text not null check (length(p256dh) between 40 and 200),
  auth_key text not null check (length(auth_key) between 8 and 100),
  device_name text not null default 'Browser' check (length(device_name) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notify_each_recording boolean not null default false,
  notify_batch_complete boolean not null default true,
  notify_failures boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (notify_each_recording or notify_batch_complete)
);

create table public.push_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null check (length(event_key) between 1 and 180),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  state text not null default 'pending' check (state in ('pending', 'sent', 'failed')),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 3),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, event_key)
);

create index push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);
create index push_notification_deliveries_user_id_idx
  on public.push_notification_deliveries (user_id);
create index push_notification_deliveries_pending_idx
  on public.push_notification_deliveries (next_attempt_at, created_at)
  where state in ('pending', 'failed') and attempt_count < 3;

create trigger notification_configuration_set_updated_at
before update on public.notification_configuration
for each row execute function public.set_updated_at();

create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute function public.set_updated_at();

create trigger push_notification_deliveries_set_updated_at
before update on public.push_notification_deliveries
for each row execute function public.set_updated_at();

alter table public.notification_configuration enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_notification_deliveries enable row level security;

create policy "Signed-in users read notification configuration"
on public.notification_configuration for select
to authenticated
using (true);

create policy "Worker writes notification configuration"
on public.notification_configuration for insert
to authenticated
with check ((select public.is_worker()));

create policy "Worker updates notification configuration"
on public.notification_configuration for update
to authenticated
using ((select public.is_worker()))
with check ((select public.is_worker()));

create policy "Users read their push subscriptions"
on public.push_subscriptions for select
to authenticated
using ((select auth.uid()) = user_id or (select public.is_worker()));

create policy "Users create their push subscriptions"
on public.push_subscriptions for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users update their push subscriptions"
on public.push_subscriptions for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users and worker delete permitted push subscriptions"
on public.push_subscriptions for delete
to authenticated
using ((select auth.uid()) = user_id or (select public.is_worker()));

create policy "Users and worker read notification preferences"
on public.notification_preferences for select
to authenticated
using ((select auth.uid()) = user_id or (select public.is_worker()));

create policy "Users create their notification preferences"
on public.notification_preferences for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users update their notification preferences"
on public.notification_preferences for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Worker reads push deliveries"
on public.push_notification_deliveries for select
to authenticated
using ((select public.is_worker()));

create policy "Worker creates push deliveries"
on public.push_notification_deliveries for insert
to authenticated
with check ((select public.is_worker()));

create policy "Worker updates push deliveries"
on public.push_notification_deliveries for update
to authenticated
using ((select public.is_worker()))
with check ((select public.is_worker()));

create policy "Worker deletes push deliveries"
on public.push_notification_deliveries for delete
to authenticated
using ((select public.is_worker()));

revoke all on public.notification_configuration from anon, authenticated;
revoke all on public.push_subscriptions from anon, authenticated;
revoke all on public.notification_preferences from anon, authenticated;
revoke all on public.push_notification_deliveries from anon, authenticated;

grant select, insert, update on public.notification_configuration to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.push_notification_deliveries to authenticated;
