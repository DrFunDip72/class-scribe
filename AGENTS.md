# Class Scribe — Agent Instructions

This is the required entry point for every developer or coding agent.

## Objective

Maintain a free-tier application where authenticated users upload class recordings, the Windows computer processes them sequentially with local AI, and results are saved privately to each account.

## Read first

1. `docs/STATUS.md`
2. `docs/PRODUCT.md`
3. `docs/ARCHITECTURE.md`
4. `docs/DECISIONS.md`
5. The task-specific document under `docs/`

Repository documentation is authoritative over conversation history.

## Fixed constraints

- Vercel Hobby, Supabase Free, GitHub Free, and local inference.
- Next.js/TypeScript, Supabase Auth/Postgres/private Storage.
- One to 20 logical recordings per batch. Every Storage object remains limited to 50 MB, while an oversized source recording is prepared into multiple private audio parts and returns one logical result.
- Oversized audio plus MP4, WebM, MOV, M4V, and MKV sources are converted sequentially in the browser to mono 16 kHz, 48 kbps AAC/M4A. Original oversized audio and original videos must never upload.
- FIFO, one active inference job on the Windows computer.
- `faster-whisper` small, CPU, INT8; Ollama `qwen3:4b`.
- Outbound worker traffic only. Never expose the computer, Ollama, or router ports.
- RLS account isolation. Treat recordings and transcripts as private educational data.
- Web Push is opt-in and account-scoped. Keep notification payloads generic: never include filenames, transcript text, summaries, or signed URLs.
- The VAPID private key belongs only in ignored `.worker-secrets/`; only its public key may be stored in Supabase or sent to a browser.
- Email is opt-in and account-scoped. The outbound worker uses `completion_events` as a durable FluxPrompt outbox; the API key lives only in ignored `.env.worker.local`.

## Current state

The complete system is built and deployed. The public app, production sign-in, browser upload, durable queue, local inference, result display, and audio deletion have passed an end-to-end test. Browser-side preparation supports oversized audio and video, 90-minute multipart Storage objects, and resumable uploads while preserving one result per source recording. Persistent Web Push and optional FluxPrompt completion email are implemented through the local worker. The FluxPrompt key is configured locally; an owner-approved branded sample received HTTP 200 and a valid success response from FluxPrompt. The worker is supervised by a pre-login Windows `SYSTEM` task with startup and recurring recovery triggers. Completed results use streamlined study-guide notes and let users copy the summary, transcript, or everything independently. See `docs/STATUS.md` for current verification and remaining owner-operated tests.

## Security rules

- Never commit credentials, tokens, cookies, private keys, worker passwords, or Supabase secret/service-role keys.
- Never prefix secrets with `NEXT_PUBLIC_`.
- Do not log transcript contents, signed URLs, or authorization headers.
- Preserve RLS and private Storage. The worker uses a dedicated Auth user whose `app_metadata.role` is `worker`.
- Do not replace the worker with a service-role key unless a reviewed decision explicitly requires it.

## Working rules

- Use committed migrations for database changes and forward migrations for corrections.
- Pin dependencies and preserve lockfiles.
- Test the smallest relevant boundary after changes.
- Do not claim completion without verification evidence.
- Preserve the direct-browser upload design and outbound-only worker boundary.
- Preserve lazy browser-side video reading and sequential conversion. Do not replace it with a whole-file-in-memory FFmpeg/WASM path without a measured reason.
- Preserve durable push delivery rows and per-device subscriptions. A transcription must still complete if notification delivery fails.

## Required handoff

Before ending a work session:

1. Update `docs/STATUS.md`.
2. Append architectural decisions to `docs/DECISIONS.md`.
3. Update `CHANGELOG.md`.
4. Update setup/operations docs when behavior changes.
5. Record tests actually run in `docs/TESTING.md`.
6. Confirm ignored secret files are not tracked.
## Useful checks

```powershell
cd web
npm run lint
npm run build
cd ..
\.venv-worker\Scripts\python.exe -m unittest -v test_worker_helpers.py
\.venv-worker\Scripts\python.exe verify-local-stack.py verification-sample.mp3
Get-ScheduledTask -TaskName AudioTranscriberWorker
Get-ScheduledTaskInfo -TaskName AudioTranscriberWorker
```
