alter table public.notification_preferences
  add column email_notifications_enabled boolean not null default false,
  add column email_address text;

alter table public.notification_preferences
  add constraint notification_preferences_email_address_check
  check (
    email_address is null
    or (
      length(email_address) between 3 and 320
      and email_address = lower(btrim(email_address))
      and email_address ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ),
  add constraint notification_preferences_email_enabled_check
  check (not email_notifications_enabled or email_address is not null);

drop policy "Users create their notification preferences"
on public.notification_preferences;

drop policy "Users update their notification preferences"
on public.notification_preferences;

create policy "Users create their notification preferences"
on public.notification_preferences for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    email_address is null
    or email_address = lower(btrim((select auth.jwt()) ->> 'email'))
  )
);

create policy "Users update their notification preferences"
on public.notification_preferences for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    email_address is null
    or email_address = lower(btrim((select auth.jwt()) ->> 'email'))
  )
);

-- Existing rows predate outbound email and must never send retroactively.
update public.completion_events
set
  state = 'delivered',
  external_reference = coalesce(external_reference, 'legacy-email-disabled'),
  delivered_at = coalesce(delivered_at, now())
where state in ('pending', 'failed');

alter table public.completion_events
  add column event_key text,
  add column delivery_kind text,
  add column recipient text,
  add column payload jsonb,
  add column attempt_count smallint not null default 0,
  add column next_attempt_at timestamptz not null default now(),
  add column last_error text,
  add column updated_at timestamptz not null default now();

alter table public.completion_events
  add constraint completion_events_event_key_check
  check (event_key is null or length(event_key) between 1 and 180),
  add constraint completion_events_delivery_kind_check
  check (delivery_kind is null or delivery_kind in ('recording', 'batch', 'failed')),
  add constraint completion_events_recipient_check
  check (
    recipient is null
    or (
      length(recipient) between 3 and 320
      and recipient = lower(btrim(recipient))
      and recipient ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ),
  add constraint completion_events_payload_check
  check (payload is null or jsonb_typeof(payload) = 'object'),
  add constraint completion_events_attempt_count_check
  check (attempt_count between 0 and 3),
  add constraint completion_events_pending_payload_check
  check (
    state = 'delivered'
    or (
      event_key is not null
      and delivery_kind is not null
      and recipient is not null
      and payload is not null
    )
  );

create unique index completion_events_event_key_idx
  on public.completion_events (event_key)
  where event_key is not null;

create index completion_events_pending_email_idx
  on public.completion_events (next_attempt_at, created_at)
  where state in ('pending', 'failed') and attempt_count < 3;

create trigger completion_events_set_updated_at
before update on public.completion_events
for each row execute function public.set_updated_at();

drop policy "Users read their completion events"
on public.completion_events;

create policy "Users and worker read permitted completion events"
on public.completion_events for select
to authenticated
using ((select auth.uid()) = user_id or (select public.is_worker()));
