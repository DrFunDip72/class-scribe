# Database and Storage

Committed migrations under `supabase/migrations/` are authoritative and have been applied to project `wmsotywnkqdajhmiultx`.

## Tables

- `upload_batches` — owner, label, file count, timestamps.
- `transcription_jobs` — owner, first-part compatibility path, logical display metadata, FIFO status, progress, attempts, claim/lease, and safe errors.
- `transcription_job_parts` — ordered private Storage-object manifest for a logical job; each object is at most 50 MB and owner/worker readable through RLS.
- `transcription_results` — transcript, segments, summary, key points, action items, language, duration, and model metadata.
- `recording_user_states` — one owner-controlled row per job with separate Summary/Transcript/Everything copy timestamps plus reversible Done and Archive timestamps.
- `worker_heartbeats` — worker state, active job, version, and last seen.
- `completion_events` — worker-only durable FluxPrompt email outbox with event keys, recipient, generic payload, attempts, backoff, safe errors, and delivery state.

## RPCs

Notification tables added by `web_push_notifications`:

- `notification_configuration` — worker-published Web Push public key; authenticated users can read it and only the worker can change it.
- `push_subscriptions` — account-owned per-browser Push API endpoints and encryption keys.
- `notification_preferences` — enabled email channel, JWT-locked account address, and shared batch/per-recording/failure settings for each account.
- `push_notification_deliveries` — worker-only durable per-device delivery outbox with attempts, backoff, and sent state.

- `create_upload_batch(label, files)` validates authentication, 1-20 logical recordings, 1-32 ordered parts per recording, supported audio types, exact owner/job/part paths, 50 MB per object, and 1 GB per logical recording, then creates the batch, jobs, and manifests atomically. The legacy one-object payload remains temporarily accepted for already-open browser tabs.
- `retry_transcription_job(job_id)` checks ownership, failed status, and remaining attempts.
- `claim_next_job(worker_id)` requires the dedicated worker JWT role (or service role), recovers stale leases, and atomically claims the oldest eligible row with `SKIP LOCKED`.

These functions intentionally use SECURITY DEFINER to perform narrow validated mutations. Anonymous execution is revoked, and each function validates the caller before writing.

## RLS

Authenticated users can see only rows where `user_id = auth.uid()`. They cannot write worker state, delivery rows, notification configuration, or another user's records. Users may manage only their own subscriptions, preferences, and recording workflow rows. Recording-state insert/update policies additionally verify that the referenced transcription job belongs to the same authenticated account; the browser still has no update grant on `transcription_jobs`. Preference insert/update RLS requires any email recipient to equal the lowercase `email` claim in the current JWT. The dedicated worker's signed JWT contains `app_metadata.role=worker`; policies permit only the queue/result/heartbeat/storage and notification-delivery operations it needs.

## Storage

Bucket `recordings` is private, accepts supported audio MIME types (plus legacy video types), and enforces a 50 MB object limit. Multipart paths are exactly `<user UUID>/<job UUID>/part-NNNN.<audio extension>`. User policies validate the owner prefix; the batch RPC validates the full ordered manifest. Worker policies permit authenticated read/delete only when `is_worker()` is true.

## Migration history

1. `initial_schema` — types, tables, constraints, functions, RLS, bucket, and storage policies.
2. `advisor_indexes` — foreign-key and heartbeat indexes.
3. `harden_rpc_permissions` — removed anonymous/default execution.
4. `worker_role` — least-privileged worker RLS and guarded claim.
5. `fix_service_role_claim_guard` — checks JWT role correctly inside SECURITY DEFINER.
6. `consolidate_job_read_policy` — combines user and worker SELECT policies.
7. `increase_batch_limit_to_20` — raises both the table constraint and atomic batch RPC limit from 5 to 20.

The timestamped `web_push_notifications` migration adds public-key configuration, account-scoped subscriptions/preferences, durable deliveries, indexes, triggers, grants, and RLS.

The timestamped `email_completion_notifications` migration adds account-email preferences, strengthens preference RLS, converts the original completion-event placeholder into the retryable email outbox, and marks pre-feature placeholder rows delivered so no historical job sends retroactively.

The timestamped `recording_user_states` migration adds persistent account-scoped copy, Done, and Archive state without granting the browser any write access to worker-controlled queue rows.

The timestamped `multipart_recordings` and `optimize_recording_parts_policies` migrations add ordered job parts, lift the logical job size to a 1 GB safety ceiling while retaining 50 MB per object, update the atomic batch RPC, combine owner/worker part reads, and add the part-owner index.

Use forward migrations; never reset the production database.
