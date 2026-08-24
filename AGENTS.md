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
- One to 20 files per batch; 50 MB maximum per file.
- FIFO, one active inference job on the Windows computer.
- `faster-whisper` small, CPU, INT8; Ollama `qwen3:4b`.
- Outbound worker traffic only. Never expose the computer, Ollama, or router ports.
- RLS account isolation. Treat recordings and transcripts as private educational data.
- Email delivery is deferred; use `completion_events` as its future integration point.

## Current state

The complete system is built and deployed. The public app, production sign-in, browser upload, durable queue, local inference, result display, and audio deletion have passed an end-to-end test. See `docs/STATUS.md` for the one remaining owner-operated Auth URL setting.

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
