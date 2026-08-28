# Architecture

```text
Vercel-hosted Next.js browser
  |  Supabase Auth session
  |  video input: local lazy read -> mono AAC/M4A
  |  direct upload (private bucket)
  v
Supabase Auth + Postgres + Storage
  ^
  |  outbound HTTPS polling using a dedicated worker Auth identity
  |
Windows startup task -> worker.py
  -> faster-whisper small / CPU INT8
  -> Ollama qwen3:4b on 127.0.0.1
  -> signed Web Push -> browser service worker -> OS notification
  -> FluxPrompt Email Agent -> account email with dashboard link

GitHub Actions schedule -> Vercel /api/worker-health
  -> Boolean-only Supabase RPC
  -> assigned GitHub outage issue -> owner email notification
```

## Web application

The `web/` app uses Next.js App Router and Supabase SSR. Proxy middleware refreshes sessions and protects `/dashboard` and `/jobs/*`. Direct audio uploads to Storage unchanged. Video input is dynamically handled by pinned Mediabunny packages: a lazy `BlobSource` uses an 8 MiB read cache, the video track is discarded, and the primary audio track is decoded and encoded as mono 16 kHz, 48 kbps AAC in M4A. Conversion and upload happen sequentially so a 20-file selection does not process every video in memory at once.

After every selected file has uploaded, the browser calls `create_upload_batch` once so all file metadata and jobs are inserted atomically. If preparation, upload, or batch creation fails, the browser removes any objects already uploaded for that attempt.

Vercel serves the application code but does not receive media and performs no inference. The original video never leaves the browser; only derived audio is sent directly to Supabase. This avoids Vercel Function payload/duration limits and keeps the cloud portion inexpensive.

## Supabase

Supabase is the durable coordination layer:

- Auth owns users and sessions.
- The private `recordings` bucket stores queued source audio.
- Postgres stores batches, queue jobs, results, worker heartbeat, and completion events.
- Postgres stores account preferences, browser push subscriptions, public notification configuration, durable per-device push deliveries, and a durable email outbox.
- RLS makes user ownership authoritative.
- `claim_next_job` uses `FOR UPDATE SKIP LOCKED` and recovers expired leases.

## Worker

The Windows scheduled task starts Ollama if needed, then `worker.py`. The worker signs in as a dedicated Auth user tagged with `app_metadata.role=worker`, polls over outbound HTTPS, claims exactly one oldest job, downloads it, transcribes, summarizes, saves results, records a completion event, and deletes the source object.

A global cross-session Windows named mutex prevents duplicate worker processes even when the scheduled task runs as `SYSTEM` and a manual launch runs in the owner's desktop session. Database atomic claiming is a second safeguard. The same worker owns the VAPID private key and sends Web Push after committing the transcription result. Push and email use separate retryable outboxes, so a notification-provider failure cannot fail or roll back a transcription.

## External worker monitoring

The public `GET /api/worker-health` route calls a narrow `worker_is_online()` RPC. The RPC returns only whether any non-offline heartbeat is at most 10 minutes old. Anonymous callers cannot select `worker_heartbeats`, and the response contains no worker identifier, timestamp, task state, queue count, job data, or user data.

A standard GitHub-hosted runner checks this route every five minutes and retries three times. If it cannot confirm health, it opens one `worker-offline` issue assigned to the repository owner; GitHub delivers the owner's configured issue notification email. The workflow closes the same issue after recovery, preventing repeated outage mail every five minutes. A monthly commit on the separate `monitor-keepalive` branch prevents GitHub's 60-day inactive-public-repository schedule shutdown without changing or deploying `main`.

This monitoring uses no AI, email API, workflow artifact, cache, paid runner, or new provider. It remains subject to GitHub scheduler delay/drop behavior and to the continuing availability of the project's existing public-repository GitHub Free, Vercel Hobby, and Supabase Free allowances.

## Browser notifications

The dashboard registers `web/public/sw.js` only after the user chooses to enable notifications. The browser creates a Push API subscription using the public VAPID key published by the worker. The account-scoped endpoint and encryption keys are stored behind RLS. The service worker can receive an encrypted push while the tab is hidden or closed, asks the operating system to show a persistent alert, and focuses or opens the relevant result when clicked.

The private VAPID key never leaves `.worker-secrets/vapid_private_key.pem`. Notification payloads deliberately contain only a generic status message and an authenticated app-relative URL. Expired provider endpoints are removed after HTTP 404/410 responses.

## Email notifications

Email is an independent account-level opt-in. The browser may write only the lowercase email claim from its own Supabase JWT; RLS rejects any other recipient, preventing the public app from becoming an arbitrary mail relay. The worker rechecks the preference immediately before delivery so turning email off cancels queued, unsent mail.

After a qualifying completion or failure, the worker writes a generic event to `completion_events` and calls the FluxPrompt Email Agent over outbound HTTPS. The API key exists only in ignored `.env.worker.local`, is sent only in the `api-key` header, and never reaches Vercel, Supabase, or browser code. The four FluxPrompt variable inputs remain in the agent-required order: subject, HTML body, account recipient, and an empty attachment value. Calls use a unique session ID and retry up to three times with backoff.

The responsive HTML email contains a Class Scribe heading, status text, and `https://class-scribe-ruddy.vercel.app/dashboard`. It intentionally excludes filenames, transcripts, summaries, and signed links. Users must authenticate at the dashboard to see private results.

## Lifecycle

```text
local video extraction (when needed) -> audio upload -> queued -> transcribing -> summarizing -> completed
                         \-> failed -> user retry -> queued
```

Claims have a 20-minute lease that the worker refreshes while processing. A stale in-progress job is returned to the queue if attempts remain. Attempts are capped at three.

## Long recordings

Whisper streams segments and periodically refreshes progress/lease state. Long transcripts are split on sentence boundaries, summarized per chunk, then consolidated into structured JSON with a brief overview, lecture-ordered study-guide points, a final big takeaway, and genuine action items. Single-section recordings skip the second consolidation call to reduce latency and hallucination risk. The result page derives three clipboard-safe strings on the server—summary notes, transcript, and everything—and passes only those serializable strings to the small client-side Copy control. That control renders a compact anchored dropdown on wider screens and a fixed, safe-area-aware bottom action sheet at 640 CSS pixels or narrower. The sheet traps keyboard focus, closes on Escape or backdrop activation, and returns focus to its trigger.

## Responsive web boundary

The web UI is designed from a 320 CSS-pixel minimum viewport upward. Flex and grid children use shrink-safe sizing, long filenames and generated text wrap instead of widening the document, dense dashboard controls stack on narrow screens, and visible phone controls provide at least a 44 by 44 CSS-pixel target. Horizontal clipping is a final document-level guard; component sizing remains responsible for preventing overflow.

## Privacy boundary

No inbound port, public tunnel, or router rule is required. Ollama remains at localhost. Original videos never upload. Derived audio and direct audio Storage objects are private and deleted after a successful result is saved. Transcript text is never written to worker logs.
