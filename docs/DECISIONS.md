# Architecture Decision Log

This file is append-only. New decisions may supersede older ones without deleting history.

## ADR-001 — Free-Tier-Only Initial Release

Use Vercel Hobby, Supabase Free, GitHub Free, and local inference. The owner requires a $0 starting stack.

## ADR-002 — Local AI Inference

Run transcription and summarization on the owner's Windows computer to avoid recurring AI API costs. Availability and concurrency therefore depend on that computer.

## ADR-003 — Outbound Worker Polling

The worker polls Supabase over outbound HTTPS. Do not expose the worker or Ollama to the internet. Durable claims, leases, and heartbeats handle disconnects.

## ADR-004 — Sequential FIFO Processing

Accept up to 20 simultaneous uploads but process one oldest-first job at a time to fit CPU/RAM limits.

## ADR-005 — Small Whisper on CPU INT8

Use `faster-whisper`, model `small`, device `cpu`, and compute type `int8`.

## ADR-006 — Ollama Qwen3 4B

Use local Ollama `qwen3:4b` for summary, key points, and action items. Validate structured output and remove reasoning markup.

## ADR-007 — Supabase Identity and Durable State

Use Supabase Auth, Postgres, and private Storage for account ownership, persistence, files, and results.

## ADR-008 — Deferred Email Delivery

Do not send email initially. Record a completion event for the owner's future agent-builder caller.

## ADR-009 — Direct Browser-to-Storage Uploads

Upload directly from the authenticated browser to private Supabase Storage, then create the queue batch atomically. This avoids Vercel payload/duration limits.

## ADR-010 — Dedicated Worker Auth Identity

The worker signs in using the publishable key as a dedicated Auth user tagged in protected `app_metadata`. Narrow RLS is safer than a project-wide service-role key on the computer.

## ADR-011 — Delete Audio After Success

Delete remote audio only after its result and completion event are saved, reducing private-data retention and protecting the 1 GB quota.

## ADR-012 — Completion Event Outbox

Store one durable pending completion event per job so later delivery failures cannot break transcription.

## ADR-013 — Single-Instance Worker Defense

Use both a Windows named mutex and atomic database claims to prevent duplicate processing.

## ADR-014 — No Sign-Up Email Confirmation

Disable mandatory email confirmation and send a successful new sign-up directly to the dashboard.

**Reason:** The owner explicitly prefers immediate account creation and accepts the reduced email-ownership assurance.

**Consequence:** Anyone can register an address they do not control. Add CAPTCHA and abuse limits before broad public promotion. Password-reset email remains enabled.

## ADR-015 — Twenty-File Upload Batches

Allow one to 20 files in a single batch while preserving one-at-a-time FIFO processing.

**Reason:** A class day can produce 12 or more short 5-10 minute videos, and selecting them together is substantially easier.

**Consequence:** A maximum-size batch can approach the entire 1 GB Supabase Free Storage quota. Audio deletion after success and storage monitoring remain required.
