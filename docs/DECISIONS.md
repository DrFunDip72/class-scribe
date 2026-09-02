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

## ADR-016 — Local Streaming Video-to-Audio Preparation

**Superseded for output sizing and memory behavior by ADR-024.** The local privacy boundary and accepted video formats remain in force.

For MP4, WebM, MOV, M4V, and MKV input, use pinned Mediabunny packages in the authenticated browser to read the source lazily, discard video, and produce mono 16 kHz, 48 kbps AAC/M4A. Prepare and upload selected files sequentially. Only the derived audio may cross the network.

**Reason:** Source class videos can exceed the Supabase Free 50 MB object limit even when their speech audio is small. Local extraction preserves the $0 stack, avoids Vercel media limits, reduces Storage/egress use, and keeps the original video private.

**Consequence:** An up-to-date browser must be able to decode the source audio codec and preparation uses the user's CPU. ADR-024 replaces the single completed M4A with one-at-a-time 90-minute parts while retaining the lazy source read.

## ADR-017 — Local-Worker Web Push Completion Alerts

Use standards-based Web Push for user-opted completion and failure alerts. The local Windows worker owns the VAPID private key, publishes only its public key, creates durable per-device delivery rows, and sends encrypted pushes after transcription state is committed. A root-scoped service worker displays the operating-system notification and opens the relevant authenticated page when clicked.

**Reason:** The user may be working in another application or may close the dashboard tab. Web Push supplies the requested Google Calendar-style persistent alert without a paid service and without exposing the home computer.

**Consequence:** Permission is controlled by the browser and operating system, delivery is best-effort, each device subscribes separately, and replacing the VAPID private key requires users to enable notifications again. Payloads must remain generic and completion must never depend on delivery success.

## ADR-018 — Streamlined Study Guides and Selective Copy

Generate a brief overview plus up to 14 lecture-ordered study points that prioritize core concepts, definitions, comparisons, process steps, selective clarifying examples, and a final `Big takeaway`. Do not pad short lectures or add outside knowledge, and skip the consolidation model call when only one transcript chunk exists. Keep genuine action items separate. On the result page, offer `Summary`, `Transcript`, and `Everything` clipboard targets while keeping the existing complete Markdown download.

**Reason:** Students need notes that scan like a study guide instead of a generic prose recap, and they often need to paste the study notes or raw transcript independently.

**Consequence:** `Summary` copy includes the overview, key points, and action items but excludes the transcript. Existing completed results keep their original generated content while receiving the new copy choices; the revised generation format applies to recordings processed by worker version `1.2.1` or later.

## ADR-019 — 320-Pixel Mobile Baseline and Copy Action Sheet

Treat 320 CSS pixels as the minimum supported web viewport. At 640 pixels or narrower, stack dense dashboard and result controls, preserve visible action labels, require at least 44 by 44 CSS pixels for visible touch targets, and render Copy choices as a safe-area-aware bottom action sheet. Keep the anchored Copy dropdown on wider screens.

**Reason:** Phone users were forced to zoom out, and the desktop-sized Copy dropdown could extend beyond the visible screen. A bounded action sheet makes all three clipboard targets readable and reachable without compromising the desktop layout.

**Consequence:** Mobile layout changes must be checked for horizontal overflow at 320, 360, 390, and 430 CSS pixels. The Copy sheet must stay inside the viewport, close from its backdrop/close control/Escape, contain keyboard focus while open, and return focus to its trigger.

## ADR-020 — Optional FluxPrompt Completion Email

Supersede ADR-008's email deferral. Add Email as an independent account-level notification channel beside per-device Web Push, using the owner's FluxPrompt Email Agent from the outbound-only Windows worker. Reuse `completion_events` as a durable retry outbox. Keep the batch/per-recording and failure preferences shared across enabled channels.

**Reason:** Users may miss a browser pop-up or use a browser/device where persistent Push is unavailable. A concise email with a dashboard link lets them return to private results without adding cloud inference or a separate mail vendor.

**Consequence:** The FluxPrompt API key lives only in ignored `.env.worker.local`. RLS restricts the stored recipient to the current Supabase JWT email, and the worker rechecks opt-in before sending. Email subject/body remain generic and contain no filename, transcript, summary, attachment, signed URL, or account-specific result URL. Delivery retries cannot change transcription state. Because mandatory sign-up confirmation is disabled, email ownership is not assured; add anti-abuse controls before broad public launch. FluxPrompt account pricing and request allowance remain an external operational limit.

## ADR-021 — SYSTEM Startup Task with Layered Recovery

Run the local launcher as a Windows `SYSTEM` scheduled task with startup, logon, and five-minute repeating triggers. Keep Task Scheduler restart-on-failure enabled for 999 one-minute attempts, and make the launcher itself supervise Ollama and the Python worker in a persistent retry loop.

**Reason:** The prior interactive logon task stopped after its worker process was interrupted and its three automatic retries were exhausted. It also could not start after an unattended reboot until the owner signed in.

**Consequence:** The task requires one administrator-approved installation but no stored Windows password or interactive login afterward. Because `SYSTEM` has a different profile, the launcher must use the owner's existing Ollama model directory explicitly. Planned maintenance must disable the task before stopping it, or the recurring trigger will restore it. The worker mutex uses the global Windows namespace so a manual user-session launch cannot overlap the `SYSTEM` worker; launcher locking and database claims add two more duplicate defenses. The worker remains outbound-only.

## ADR-022 — Zero-Incremental-Cost External Worker Outage Alert

Use a standard GitHub-hosted runner in the existing public repository to check a Boolean-only production health route every five minutes. After three unsuccessful checks, create one assigned GitHub issue; close it after recovery. Use the repository owner's normal GitHub issue email notification rather than an AI agent or email-delivery API.

**Reason:** The local worker cannot report its own failure when its process, Task Scheduler, computer, power, or internet connection is down. GitHub runs outside that failure boundary, standard hosted runners are currently free and unlimited for public repositories, and issue notifications add no new vendor or billing account.

**Consequence:** A public caller may learn only whether a worker heartbeat is currently fresh. Anonymous callers still cannot read the heartbeat table or any queue, recording, account, or result data. The intentionally anonymous `SECURITY DEFINER` RPC therefore produces an expected Supabase advisor warning. GitHub schedules can be delayed or dropped under load; the check is not a hard real-time guarantee. A monthly keepalive commit on a non-default branch prevents GitHub's documented 60-day inactive-public-repository schedule shutdown. Provider terms cannot be guaranteed forever, so this design must remain on standard public-repository runners with no artifacts, caches, larger runners, payment method, or new paid dependency.

## ADR-023 — Persistent Copied, Done, and Archived Recording State

Store per-recording workflow metadata in a separate `recording_user_states` table protected by account ownership RLS. Record Summary, Transcript, and Everything copy timestamps only after a successful clipboard write. Keep Done as an explicit reversible user action, and permit only done recordings to carry a reversible Archive timestamp.

**Reason:** Opening a result does not mean it was copied, and copying one section does not prove the user finished pasting or handling the recording. Users working through 12-file batches need exact persistent copy indicators, a deliberate checklist, batch progress, and a way to hide completed work.

**Consequence:** Existing results begin as untouched and remain visible in `To do` until explicitly marked done. Copying Everything is displayed as coverage of both Summary and Transcript but does not auto-complete the recording. Archive changes only the dashboard view and never deletes results. Keeping this metadata separate prevents browser update grants from reaching worker-controlled job status, progress, attempts, or leases. Batch archive is limited to the signed-in account's already-done rows.

## ADR-024 — Local Preparation, Multipart Manifests, and Resumable Uploads

Treat 50 MB as a Supabase Storage object limit, not a source-recording limit. Upload audio at or below 50 MB unchanged. For oversized audio and every supported video, use the existing lazy Mediabunny browser pipeline to produce mono 16 kHz, 48 kbps AAC/M4A in 90-minute parts. Yield, upload, and release one part at a time. Use standard Storage upload through 6 MB and authenticated TUS upload above 6 MB. Store each ordered part in `transcription_job_parts`, but preserve one `transcription_jobs` row and one result per selected source.

**Reason:** Long classes and uncompressed M4A/WAV sources can exceed the Supabase Free 50 MB per-object limit even when compact speech audio fits the overall free Storage allowance. Local preparation avoids Vercel payload/runtime limits and prevents the original large recording from leaving the user's device. Multipart objects retain the $0 stack; resumable transfer avoids restarting a large part after a brief connection failure.

**Consequence:** Every object remains at most 50 MB, every logical recording is limited to 32 parts and 1 GB of prepared audio, and the project-wide 1 GB free Storage quota still applies. Browser/device resources and source codec support remain practical limits. The batch RPC validates exact owner/job/part paths and creates manifests atomically. The outbound worker downloads and transcribes parts sequentially, offsets timestamps, commits one result, and deletes all remote parts only after success. System FFmpeg decodes parts to NumPy for the unchanged faster-whisper `small` CPU/INT8 model, avoiding the PyAV native extension blocked by Windows Smart App Control.
