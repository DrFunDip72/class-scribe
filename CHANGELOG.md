# Changelog

## 2026-08-24

### Added

- Added a Copy menu on completed results with separate `Summary`, `Transcript`, and `Everything` clipboard targets.
- Added accessible copy confirmation/failure feedback and preserved complete Markdown downloads.
- Updated the local Ollama prompts to produce streamlined study guides with a short overview, ordered concepts and definitions, selective examples, a final big takeaway, and genuine action items.
- Updated the product, architecture, worker operations, status, testing, and decision handoff documentation.

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

- Browser uploads go directly to private Supabase Storage.
- Audio is deleted after successful processing.
- Worker secrets and generated bootstrap material are ignored.
- Queue claims use atomic row locking and stale-lease recovery.
- Duplicate Windows worker launches exit safely.
- The VAPID private key remains only in ignored `.worker-secrets`; Supabase stores only its browser-safe public key.
