# Database and Storage

Committed migrations under `supabase/migrations/` are authoritative and have been applied to project `wmsotywnkqdajhmiultx`.

## Tables

- `upload_batches` — owner, label, file count, timestamps.
- `transcription_jobs` — owner, storage path, display metadata, FIFO status, progress, attempts, claim/lease, and safe errors.
- `transcription_results` — transcript, segments, summary, key points, action items, language, duration, and model metadata.
- `worker_heartbeats` — worker state, active job, version, and last seen.
- `completion_events` — durable future email/webhook outbox.

## RPCs

Notification tables added by `web_push_notifications`:

- `notification_configuration` — worker-published Web Push public key; authenticated users can read it and only the worker can change it.
- `push_subscriptions` — account-owned per-browser Push API endpoints and encryption keys.
- `notification_preferences` — batch/per-recording and failure-alert settings for each account.
- `push_notification_deliveries` — worker-only durable per-device delivery outbox with attempts, backoff, and sent state.

- `create_upload_batch(label, files)` validates authentication, 1-20 items, supported media, 50 MB per item, user-prefixed paths, then creates the batch and jobs atomically.
- `retry_transcription_job(job_id)` checks ownership, failed status, and remaining attempts.
- `claim_next_job(worker_id)` requires the dedicated worker JWT role (or service role), recovers stale leases, and atomically claims the oldest eligible row with `SKIP LOCKED`.

These functions intentionally use SECURITY DEFINER to perform narrow validated mutations. Anonymous execution is revoked, and each function validates the caller before writing.

## RLS

Authenticated users can see only rows where `user_id = auth.uid()`. They cannot write worker state, delivery rows, notification configuration, or another user's records. Users may manage only their own subscriptions and preferences. The dedicated worker's signed JWT contains `app_metadata.role=worker`; policies permit only the queue/result/heartbeat/storage and notification-delivery operations it needs.

## Storage

Bucket `recordings` is private, accepts the supported audio/video MIME types, and enforces a 50 MB object limit. Paths begin with the uploading user's UUID. User policies validate that first path segment. Worker policies permit authenticated read/delete only when `is_worker()` is true.

## Migration history

1. `initial_schema` — types, tables, constraints, functions, RLS, bucket, and storage policies.
2. `advisor_indexes` — foreign-key and heartbeat indexes.
3. `harden_rpc_permissions` — removed anonymous/default execution.
4. `worker_role` — least-privileged worker RLS and guarded claim.
5. `fix_service_role_claim_guard` — checks JWT role correctly inside SECURITY DEFINER.
6. `consolidate_job_read_policy` — combines user and worker SELECT policies.
7. `increase_batch_limit_to_20` — raises both the table constraint and atomic batch RPC limit from 5 to 20.

The timestamped `web_push_notifications` migration adds public-key configuration, account-scoped subscriptions/preferences, durable deliveries, indexes, triggers, grants, and RLS.

Use forward migrations; never reset the production database.
