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
- RLS makes user ownership authoritative.
- `claim_next_job` uses `FOR UPDATE SKIP LOCKED` and recovers expired leases.

## Worker

The Windows scheduled task starts Ollama if needed, then `worker.py`. The worker signs in as a dedicated Auth user tagged with `app_metadata.role=worker`, polls over outbound HTTPS, claims exactly one oldest job, downloads it, transcribes, summarizes, saves results, records a completion event, and deletes the source object.

A Windows named mutex prevents duplicate worker processes. Database atomic claiming is a second safeguard.

## Lifecycle

```text
local video extraction (when needed) -> audio upload -> queued -> transcribing -> summarizing -> completed
                         \-> failed -> user retry -> queued
```

Claims have a 20-minute lease that the worker refreshes while processing. A stale in-progress job is returned to the queue if attempts remain. Attempts are capped at three.

## Long recordings

Whisper streams segments and periodically refreshes progress/lease state. Long transcripts are split on sentence boundaries, summarized per chunk, then consolidated into structured JSON with summary, key points, and action items.

## Privacy boundary

No inbound port, public tunnel, or router rule is required. Ollama remains at localhost. Original videos never upload. Derived audio and direct audio Storage objects are private and deleted after a successful result is saved. Transcript text is never written to worker logs.
