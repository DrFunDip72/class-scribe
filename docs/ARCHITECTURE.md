# Architecture

```text
Vercel-hosted Next.js browser
  |  Supabase Auth session
  |  direct upload (private bucket)
  v
Supabase Auth + Postgres + Storage
  ^
  |  outbound HTTPS polling using a dedicated worker Auth identity
  |
Windows startup task -> worker.py
  -> faster-whisper small / CPU INT8
  -> Ollama qwen3:4b on 127.0.0.1
```

## Web application

The `web/` app uses Next.js App Router and Supabase SSR. Proxy middleware refreshes sessions and protects `/dashboard` and `/jobs/*`. The browser uploads directly to Storage, then calls `create_upload_batch` once so all file metadata and jobs are inserted atomically.

Vercel does not receive audio and performs no inference. This avoids function payload/duration limits and keeps the cloud portion inexpensive.

## Supabase

Supabase is the durable coordination layer:

- Auth owns users and sessions.
- The private `recordings` bucket stores queued source audio.
- Postgres stores batches, queue jobs, results, worker heartbeat, and completion events.
- RLS makes user ownership authoritative.
- `claim_next_job` uses `FOR UPDATE SKIP LOCKED` and recovers expired leases.

## Worker

The Windows scheduled task starts Ollama if needed, then `worker.py`. The worker signs in as a dedicated Auth user tagged with `app_metadata.role=worker`, polls over outbound HTTPS, claims exactly one oldest job, downloads it, transcribes, summarizes, saves results, records a completion event, and deletes the source object.

A Windows named mutex prevents duplicate worker processes. Database atomic claiming is a second safeguard.

## Lifecycle

```text
browser upload -> queued -> transcribing -> summarizing -> completed
                         \-> failed -> user retry -> queued
```

Claims have a 20-minute lease that the worker refreshes while processing. A stale in-progress job is returned to the queue if attempts remain. Attempts are capped at three.

## Long recordings

Whisper streams segments and periodically refreshes progress/lease state. Long transcripts are split on sentence boundaries, summarized per chunk, then consolidated into structured JSON with summary, key points, and action items.

## Privacy boundary

No inbound port, public tunnel, or router rule is required. Ollama remains at localhost. Storage objects are private and deleted after a successful result is saved. Transcript text is never written to worker logs.
