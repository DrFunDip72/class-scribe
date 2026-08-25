# Changelog

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
