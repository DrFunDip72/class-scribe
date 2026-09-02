# Changelog

## 2026-09-02

### Oversized audio and durable multipart uploads

- Removed the 50 MB source-audio rejection. Oversized audio and all supported video now become local mono 16 kHz, 48 kbps AAC/M4A before any upload.
- Added 90-minute output parts, up to 32 parts and 1 GB of prepared audio per logical recording, while preserving Supabase Free's 50 MB per-object limit.
- Added authenticated TUS resumable uploads with 6 MB chunks, retry delays, and prior-upload resumption for objects over 6 MB.
- Added `transcription_job_parts`, owner/worker RLS, exact multipart path validation, narrow grants, and an atomic multipart batch RPC through committed production migrations.
- Updated worker 1.4.1 to download/transcribe parts sequentially, maintain continuous timestamps, produce one transcript/summary/result, and delete every part after commit.
- Replaced the blocked PyAV decode path with installed system FFmpeg while preserving faster-whisper `small`, CPU, and INT8 inference.
- Verified four-part browser conversion and a real two-part production queue job through combined result and complete Storage cleanup.

## 2026-08-30

### Verification

- Verified the production Boolean health endpoint and GitHub outage issue open/assign/close lifecycle.
- Recorded that GitHub's free best-effort scheduler produced multi-hour gaps despite a five-minute cron expression; dependable prompt notification and owner email receipt remain unfinished.

## 2026-08-28

### Recording workflow

- Added persistent per-recording checkmarks for successful Summary, Transcript, and Everything copy actions.
- Added explicit Done/Undo and reversible Archive/Restore actions without deleting saved notes.
- Added To do, Done, Archived, and All dashboard filters plus per-batch `x of y done` progress.
- Added one-click `Archive done` for each upload batch and persistent cross-device state behind account-isolated RLS.
- Kept workflow metadata separate from worker-controlled queue jobs and preserved the 320-pixel mobile baseline.

### Reliability

- Replaced the one-shot launcher with a persistent Ollama/worker supervisor that retries local-service startup and relaunches the queue worker after any exit.
- Added a repeatable administrator installer for a pre-login Windows `SYSTEM` task with startup, logon, five-minute fallback, missed-run, wake, and 999 one-minute restart protections.
- Moved the worker singleton mutex to the global Windows namespace so `SYSTEM` and interactive sessions cannot run separate queue workers.
- Pointed unattended Ollama startup at the existing owner model store and added an ignored supervisor-state/log directory.
- Documented installation, maintenance, recovery, privacy-safe logging, and the separate firmware requirement for automatic power restoration.
- Added a zero-incremental-cost external outage monitor using a Boolean-only health route and standard GitHub Actions runner in the existing public repository.
- Added deduplicated assigned GitHub outage issues, automatic recovery closure, three-attempt health checks, and a non-default monthly keepalive branch to prevent inactive-schedule shutdown.
- Kept monitoring deterministic and free of AI, email APIs, private queue data, secrets, artifacts, caches, and paid/larger runners.

## 2026-08-24

### Added

- Added a sourced business-model and economics document covering commercial-readiness blockers, free-tier and local-worker capacity, recommended pricing, unit economics, profitability scenarios, required work, risks, and a staged validation plan.
- Added optional completion email beside browser pop-ups, with shared batch/per-recording/failure preferences and an account-email-only recipient.
- Integrated the FluxPrompt Email Agent from the outbound local worker using its exact ordered inputs, unique sessions, defensive response parsing, and a local-only API key.
- Added a branded responsive HTML email with a private-dashboard call to action and no filename, transcript, summary, attachment, or signed URL.
- Converted `completion_events` into a durable three-attempt email outbox and added opt-out rechecks so unsent events are canceled when email is disabled.
- Added a `worker.py --test-email` operational check and documented setup, recovery, costs, limits, privacy, and troubleshooting.
- Added a Copy menu on completed results with separate `Summary`, `Transcript`, and `Everything` clipboard targets.
- Added accessible copy confirmation/failure feedback and preserved complete Markdown downloads.
- Updated the local Ollama prompts to produce streamlined study guides with a short overview, ordered concepts and definitions, selective examples, a final big takeaway, and genuine action items.
- Prevented short lectures from being padded with outside knowledge and enforce the final big takeaway in worker code.
- Updated the product, architecture, worker operations, status, testing, and decision handoff documentation.
- Added a 320-pixel mobile layout baseline across landing, authentication, dashboard, and result screens with no horizontal overflow.
- Added 44-pixel-or-larger phone touch targets, safer long-text wrapping, stacked narrow controls, and improved mobile secondary-text contrast.
- Replaced the narrow-screen Copy dropdown with a safe-area-aware bottom action sheet that supports outside-tap, close-button, and Escape dismissal plus keyboard focus containment/restoration.

## 2026-08-23

### Added

- Installed and verified Python 3.12.10, FFmpeg 9.0, faster-whisper 1.2.1, CTranslate2 4.8.1 CPU INT8, Ollama 0.32.15, Whisper `small`, and `qwen3:4b`.
- Added the hidden Windows logon task `AudioTranscriberWorker`.
- Built the Next.js 16/React 19/TypeScript web application with account, upload, dashboard, retry, history, and result interfaces.
- Created the Supabase Free project, private `recordings` bucket, durable FIFO queue, account-isolated RLS, worker heartbeat, and completion-event tables.
- Added a dedicated least-privileged Auth role for the worker.
- Built the production worker with local transcription, chunked structured summaries, leases, retry handling, heartbeat, cleanup, and single-instance protection.
- Deployed the production site to Vercel Hobby.
- Added local helper tests and completed a real browser-to-worker-to-result production-data-path test.
- Replaced the planning documentation with an exact operational handoff.
- Changed sign-up to immediate account access without an email-confirmation step, per owner preference.
- Raised the browser and database batch limit from 5 to 20 files while retaining sequential FIFO processing.
- Added local browser extraction for MP4, WebM, MOV, M4V, and MKV input. Videos are read lazily, converted sequentially to compact mono AAC/M4A, and never uploaded in their original form.
- Verified the video path end to end with a 57.3 MB MP4 that produced a 55 KB audio upload, completed local transcription and summarization, rendered its result, and left no test account or media behind.
- Added opt-in persistent Web Push notifications for completion and failure events, including batch-complete or per-recording preference, per-device controls, a test alert, and click-through to results.
- Added a browser service worker and installable web-app manifest so alerts can appear over other applications instead of requiring the dashboard tab to stay visible.
- Added a locally generated VAPID signing identity, durable per-device delivery/retry records, automatic expired-subscription cleanup, and privacy-safe notification payloads.

### Security and reliability

- Verified the local FluxPrompt key loads without exposing its value and restarted the idle worker process so worker 1.3.0 uses the updated environment.
- Sent the owner-approved branded sample through the live FluxPrompt Email Agent and received HTTP 200 plus a valid success response without persisting its recipient or response body.
- Repeated the owner-approved live sample and received a second HTTP 200 success response, confirming the provider call is repeatable.
- Locked email recipients through RLS to the authenticated account's lowercase JWT email and kept the FluxPrompt key off Vercel, Supabase, and browser code.
- Browser uploads go directly to private Supabase Storage.
- Audio is deleted after successful processing.
- Worker secrets and generated bootstrap material are ignored.
- Queue claims use atomic row locking and stale-lease recovery.
- Duplicate Windows worker launches exit safely.
- The VAPID private key remains only in ignored `.worker-secrets`; Supabase stores only its browser-safe public key.
