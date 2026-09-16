# Architecture

```text
Vercel-hosted Next.js browser
  |  Supabase Auth session
  |  video/oversized audio: local lazy read -> mono AAC/M4A parts
  |  direct or resumable upload (private bucket; <=50 MB/object)
  v
Supabase Auth + Postgres + Storage
  ^
  |  outbound HTTPS polling using a dedicated worker Auth identity
  |
Windows startup task -> worker.py
  -> selected faster-whisper tier / CPU INT8
     -> Fast: small
     -> Balanced: distil-large-v3
     -> High: medium.en
  -> Ollama qwen3:4b on 127.0.0.1
  -> signed Web Push -> browser service worker -> OS notification
  -> FluxPrompt Email Agent -> account email with dashboard link

GitHub Actions schedule -> Vercel /api/worker-health
  -> Boolean-only Supabase RPC
  -> assigned GitHub outage issue -> owner email notification

Google Drive URecorder -> Drive for desktop -> owner logon/hourly importer -> private Supabase queue
  -> existing worker result -> integrity gate -> public course GitHub repository
  -> Thursday repository-count audit -> generic FluxPrompt report
```

## Web application

The `web/` app uses Next.js App Router and Supabase SSR. Proxy middleware refreshes sessions and protects `/dashboard` and `/jobs/*`. Audio at 50 MB or below uploads unchanged. Oversized audio and every video are dynamically handled by pinned Mediabunny packages: a lazy `BlobSource` uses an 8 MiB read cache, any video track is discarded, and the primary audio track is decoded and encoded as mono 16 kHz, 48 kbps AAC in M4A. Output is trimmed into 90-minute parts, capped at 32 parts, and yielded one at a time so a 20-file selection does not encode every source or retain every output part in memory at once.

Objects at or below 6 MB use the standard Storage upload. Larger objects use Supabase's TUS endpoint with 6 MB chunks, retry delays, and browser upload fingerprint resumption. TUS improves interrupted-transfer recovery but does not bypass the Free plan's 50 MB per-object cap; the multipart recording design handles that cap.

Before upload, the browser presents one accessible Fast/Balanced/High radio group with measured estimates; that selection is included in every logical file record. `begin_upload_batch` atomically creates the batch and all logical job placeholders in `uploading` state before media transfer begins. The browser prepares and uploads sources sequentially. Immediately after one source's complete part manifest is present, `queue_uploaded_recording` validates the account, paths, MIME types, sizes, part order, and tier-bound job, inserts the manifest, and changes only that job to `queued`. The worker can claim it while later sources continue preparing or uploading. One selected source always creates one job even when it has many parts.

If an individual source fails, the browser removes only that source's objects, calls `fail_recording_upload`, and continues with the remaining selection. All placeholders exist from the start, so batch-completion notifications cannot fire while another source is still uploading. A browser that is force-closed can leave an `uploading` placeholder; it is never worker-claimable and can be safely classified as an interrupted upload in a later cleanup feature. The legacy `create_upload_batch` RPC remains available for already-open clients and queues its fully uploaded batch atomically.

The signed-in interface translates these internal states into client-facing language such as Uploading, Waiting, Transcribing, Creating notes, Ready, and Needs attention. It does not expose model identifiers, storage sizes, worker terminology, detected-language diagnostics, or raw internal stage/error strings in the primary workflow. Fast/Balanced/High remain visible because they are deliberate user choices.

Vercel serves the application code but does not receive media and performs no inference. The original video never leaves the browser; only derived audio is sent directly to Supabase. This avoids Vercel Function payload/duration limits and keeps the cloud portion inexpensive.

## Supabase

Supabase is the durable coordination layer:

- Auth owns users and sessions.
- The private `recordings` bucket stores queued direct audio or prepared audio parts.
- Postgres stores batches, upload placeholders, queue jobs with immutable user-selected transcription tiers, ordered job-part manifests, results, account-owned recording workflow state, worker heartbeat, and completion events.
- Postgres stores account preferences, browser push subscriptions, public notification configuration, durable per-device push deliveries, and a durable email outbox.
- RLS makes user ownership authoritative.
- `claim_next_job` uses `FOR UPDATE SKIP LOCKED` and recovers expired leases.

## Worker

The Windows scheduled task starts Ollama if needed, verifies its localhost API and installed inference runner, then starts `worker.py`. The runner-aware gate prevents a partially installed Ollama HTTP process from allowing the queue worker to claim jobs that cannot be summarized. The worker signs in as a dedicated Auth user tagged with `app_metadata.role=worker`, polls over outbound HTTPS, and claims exactly one oldest job. It downloads and transcribes that job's ordered parts sequentially, offsets timestamps into one continuous transcript, creates one summary/result, records a completion event, and deletes every remote part only after result commit. Legacy one-object jobs remain readable during rollout.

System FFmpeg decodes each downloaded part to mono 16 kHz float audio before inference. The job's persisted profile selects pinned faster-whisper behavior on CPU INT8: Fast is `small`/beam 1 with automatic language detection, Balanced is `distil-large-v3`/beam 5 with fixed English and previous-text conditioning disabled, and High is `medium.en`/beam 5 with fixed English. The worker retains only one Whisper model in memory and releases it before loading a different tier. The `SYSTEM` launcher points `HF_HOME` at the owner's verified model cache, avoiding duplicate multi-gigabyte downloads. Bypassing PyAV avoids an unsigned native extension blocked by Windows Smart App Control and uses the already installed FFmpeg runtime instead.

A global cross-session Windows named mutex prevents duplicate worker processes even when the scheduled task runs as `SYSTEM` and a manual launch runs in the owner's desktop session. Database atomic claiming is a second safeguard. The same worker owns the VAPID private key and sends Web Push after committing the transcription result. Push and email use separate retryable outboxes, so a notification-provider failure cannot fail or roll back a transcription.

The separate `class_scribe_automation.py` process remains outbound-only but its importer runs in the owner's interactive Windows session because Google's streamed `G:` filesystem is session-scoped. Google Drive for desktop hydrates `URecorder` sources into an isolated temporary staging path; the importer verifies size and modification time before converting them into ten-minute M4A parts. Worker-only RPCs and Storage policies record source identity plus queue/export state in `drive_ingestions`, including compatibility deduplication against prior rclone and browser submissions. The continuously running inference worker remains a pre-login `SYSTEM` task. The exporter reads only worker-authorized owner results, applies a repetition/timestamp/completeness gate, writes a summary-first Markdown note through a repository-scoped token, and verifies remote bytes before committing export state. See `docs/DRIVE-GITHUB-AUTOMATION.md`.

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

## Recording workflow state

`recording_user_states` stores one account-owned row per transcription job. Separate timestamps record successful Summary, Transcript, and Everything clipboard actions, explicit Done state, and reversible Archive state. The table is intentionally separate from `transcription_jobs`: authenticated browsers can manage their own workflow metadata without receiving update permission on queue status, leases, attempts, progress, or other worker-controlled fields.

The result page writes a copy timestamp only after `navigator.clipboard.writeText` succeeds. A tracking-write failure cannot undo a successful clipboard operation and is reported as a non-blocking warning. Done is always explicit because copying does not prove that the user pasted or finished handling the result. Archive is a view state only and never removes the transcript, summary, or result row.

The dashboard joins the state and upload-batch metadata into its existing read. It defaults to unfinished, unarchived recordings; provides Done, Archived, and All filters; reports done progress against each batch's original file count; and can archive all currently done rows in one account-scoped update. All state reads and writes remain behind ownership RLS.

## Lifecycle

```text
choose tier -> create all uploading placeholders -> prepare/upload recording 1 -> queue recording 1 -> worker may claim it
                                           |      \-> prepare/upload recording 2 -> queue recording 2 -> ...
                                           \-> one upload fails -> mark that placeholder failed; continue later files

queued -> selected-model sequential part transcription -> one summary -> completed
   \-> processing failure -> user retry -> queued
```

Claims have a 20-minute lease that the worker refreshes while processing. A stale in-progress job is returned to the queue if attempts remain. Attempts are capped at three.

## Long recordings

Whisper streams segments and periodically refreshes progress/lease state. Long transcripts are split on sentence boundaries, summarized per chunk, then consolidated into structured JSON with a brief overview, lecture-ordered study-guide points, a final big takeaway, and genuine action items. Single-section recordings skip the second consolidation call to reduce latency and hallucination risk. The result page derives three clipboard-safe strings on the server—summary notes, transcript, and everything—and passes only those serializable strings to the small client-side Copy control. That control renders a compact anchored dropdown on wider screens and a fixed, safe-area-aware bottom action sheet at 640 CSS pixels or narrower. The sheet traps keyboard focus, closes on Escape or backdrop activation, and returns focus to its trigger.

## Responsive web boundary

The web UI is designed from a 320 CSS-pixel minimum viewport upward. Flex and grid children use shrink-safe sizing, long filenames and generated text wrap instead of widening the document, dense dashboard controls stack on narrow screens, and visible phone controls provide at least a 44 by 44 CSS-pixel target. Horizontal clipping is a final document-level guard; component sizing remains responsible for preventing overflow.

## Privacy boundary

No inbound port, public tunnel, or router rule is required. Ollama remains at localhost. Original videos and oversized source audio never upload. Derived parts and direct audio objects are private and deleted after a successful result is saved. Transcript text is never written to worker logs.

The owner-only Drive-to-GitHub exporter adds a second, queue-idle Ollama pass after result integrity checks. It divides timestamped segments into approximately six-minute windows and accepts only topic headings and paragraph-start indexes. Markdown is reconstructed from the original segments, and an ordered identity check must prove that each timestamp/text pair appears exactly once. Invalid structure falls back deterministically. This formatting does not alter Supabase results and does not apply to other accounts.

## Separate private OpenWhispr API

The computer also hosts a separate OpenAI-compatible Speaches container for private Tailscale clients. This is not part of the Class Scribe request path or FIFO queue. Docker publishes container port 8000 only on `100.79.197.76`, and `/v1/models` must include `Systran/faster-whisper-base.en`.

The container uses Docker's `unless-stopped` policy. Because Docker Desktop is a per-user WSL 2 application, `OpenWhisprServerSupervisor` runs at the owner's Windows logon and every five minutes. Its short-lived PowerShell action checks the model endpoint, launches Docker Desktop if the engine is unavailable, starts the existing container if necessary, and exits. It never recreates the container and never opens a router port. Pre-login availability is not promised; Class Scribe's independent `SYSTEM` worker remains available without owner login. See `docs/OPENWHISPR.md`.
