# Changelog

## 2026-09-15

### AI repository indexes

- Added a root `AGENTS.md` AI Repository Index to HRM 391, PSE 390, STRAT 392, and PHIL 201.
- Each index teaches agents to discover dated lectures dynamically, interpret metadata and Summary/Key Points/Action Items/Transcript sections, verify claims against timestamped transcript evidence, cite dates and timestamps, disclose gaps, and avoid treating generated summaries as quotations.
- Tailored weekly expectations per course and marked the HRM Week 1 primer as supplemental rather than a transcript. All four public raw documents returned HTTP 200 after push.

### Resilient Drive discovery and observed filename variants

- Found `strat 392 9-8.m4a` in both Drive views and `Phil 9-14.m4a` in cloud Drive even though Google Drive for desktop had not surfaced the PHIL file on `G:`.
- Added a desktop-first hybrid discovery mode that merges cloud and local listings by case-insensitive relative path, prefers the newest version, prefers a local hydrated source on exact ties, and continues with either source if the other is temporarily unavailable.
- Added the unambiguous standalone `Phil`/`Philo`/`Philosophy` alias and one-day-early filename tolerance for the configured class schedule. Updated the weekly audit so those observed date labels satisfy the intended class day instead of appearing as both missing and unexpected.
- Applied the initial import cutover to both source modification time and parsed lecture date so old cloud items whose metadata changes cannot become unintended new backfills.
- Queued fresh High jobs for STRAT September 8 and PHIL September 14 in FIFO order.

## 2026-09-14

### Exact-path historical backfills

- Added an owner-operated `import-path` command that can select one exact stable Drive recording, bypass the normal cutover and class-day checks only for that explicit path, and optionally queue a fresh job instead of linking a known-bad result.
- Used the command to prepare and privately queue fresh High jobs for `hrm 391 9-8.m4a` and `Phil 201 - 9-8.m4a`; the prior corrupted HRM result remains preserved and unpublished.
- Confirmed no September 14 PHIL recording is currently visible in `URecorder` or active in Class Scribe; the normal hourly importer will admit it after it appears and remains unchanged for ten minutes.

### Google Drive for desktop source

- Detected Google Drive for desktop 130.0.2.0 in its default streaming layout and verified all 14 `URecorder` files through `G:\My Drive\URecorder`.
- Replaced the active shared-rclone import path with the first-party Drive desktop view, including a ten-minute stability window, hydration into isolated staging, and before/after size and modification checks.
- Added stable local source identities, compatibility deduplication against prior rclone ingestions, and filename aliases for `pse <date>` and `philo 201 <date>`.
- Registered `ClassScribeDriveDesktopAutomation` for the owner's interactive session with logon/hourly triggers and retained the continuously running transcription worker plus weekly audit under `SYSTEM`.
- Imported today's shortened-name PSE recording from the live desktop folder, completed High processing, and published the validated summary-first note to `PSE-390/notes/2026/2026-09-14.md`.
- Updated the administrator installer to remove the obsolete `ClassScribeDriveAutomation` task on its next approved run; because that cleanup prompt was canceled during this session, the launcher now makes any legacy SYSTEM import invocation exit successfully before touching `G:`.

### Google Drive to GitHub class automation

- Installed rclone 1.75.1 and authorized a replacement read-only credential for `jmaximum72@gmail.com`, rooted the remote to `URecorder`, ACL-restricted it under ignored `.worker-secrets`, and immediately revoked the first setup credential after rclone printed it to setup output.
- Added tolerant class/date/part filename parsing, a Mountain Time Monday/Wednesday schedule, Tuesday/Thursday missed-scan catch-up, a midnight September 14 cutover, Drive-version idempotency, and cross-source matching that links an existing browser upload instead of retranscribing it.
- Added native FFmpeg preparation into ten-minute mono 16 kHz 48 kbps M4A parts, retryable private uploads, and worker-only Supabase begin/link/queue RPCs backed by the new `drive_ingestions` ledger.
- Added owner-only result readback, transcript integrity checks, summary-first public GitHub rendering, UUID conflict protection, repository API retries, and SHA-256 readback verification.
- Added a Thursday 8:00 AM weekly audit for two HRM/PSE/PHIL notes and one STRAT note, including missing, unexpected, and duplicate-date detection plus a privacy-safe FluxPrompt report.
- Registered startup/hourly `ClassScribeDriveAutomation` and weekly `ClassScribeGitHubAudit` tasks as `SYSTEM`; an immediate unattended automation pass returned task result 0.
- Linked the September 14 HRM Drive file to its already-completed High browser job and published `HRM-391/notes/2026/2026-09-14.md`. Anonymous HTTP, document ordering, UUID metadata, and remote content verification passed.
- Canceled and fully removed one duplicate automation job and its eight Storage parts after the first live pass exposed the cross-source case; added permanent matching before download and confirmed zero duplicate rows/objects remain.
- Documented that rclone's shared Google OAuth client is being retired during 2026 and must be replaced near-term with an owner-created Google OAuth desktop client ID.
- Isolated cross-source matching failures to the affected Drive item, hardened the publication quality gate against malformed segment entries, and documented the automation's $0 incremental service cost.

## 2026-09-11

### High-tier course archive refresh

- Replaced the September 2 HRM 391, PSE 390, STRAT 392, and PHIL 201 public notes with their completed High `medium.en` transcript and regenerated study guide.
- Added the valid September 8 PSE 390 recording as a new summary-first Markdown note.
- Verified all five remote GitHub blobs exactly match their staged database result, contain the expected immutable Class Scribe job ID and High-tier metadata, and keep the summary before the complete transcript.
- Kept the September 8 HRM 391 result out of GitHub after detecting that 182 of 198 segments repeat the same sentence across most of the 73-minute recording; its deleted source must be re-uploaded for a valid retry.
- Measured old/new full-transcript agreement and word-level differences without mislabeling model disagreement as ground-truth accuracy; retained the existing bounded PHIL reference result as the only exact WER comparison.

## 2026-09-09

### Ollama repair and failed-job recovery

- Repaired the incomplete Ollama 0.32.15 installation with the official Authenticode-valid 0.33.3 installer after confirming the missing `llama-server.exe` caused summary requests to return HTTP 500.
- Added an ignored maintenance-pause marker so the pre-login `SYSTEM` task can stop its own detached Ollama runtime during future upgrades.
- Hardened launcher readiness to require both Ollama's HTTP API and its inference runner before starting the queue worker, preventing a partial installation from consuming job attempts.
- Verified the exact structured `qwen3:4b` request that previously failed now completes successfully, then requeued only the three affected High-tier recordings while preserving attempt counts.

### Private OpenWhispr recovery

- Restored Docker Desktop and the existing `openwhispr-speaches` container after the Windows restart left port 8000 unavailable.
- Verified the private Tailscale `/v1/models` endpoint returns HTTP 200 with `Systran/faster-whisper-base.en`; the listener remains bound only to `100.79.197.76`.
- Added a short-lived OpenWhispr supervisor and least-privileged Windows task that runs at owner logon and every five minutes, starts Docker Desktop when needed, and restores the existing container without recreating it.
- Preserved Docker's `unless-stopped` container policy, documented the owner-login availability boundary, and kept the separate Class Scribe `SYSTEM` worker unchanged.
- Verified PowerShell parsing, direct supervisor success, task registration, and a naturally scheduled `0x00000000` run while the live endpoint stayed healthy.
- Completed an actual API transcription with the required base English model and received a non-empty 23-word result.

### Client-facing workflow and progressive uploads

- Reworded the landing page, dashboard, and result states around recordings, notes, privacy, and user actions instead of local-worker, model-ID, storage-size, and raw pipeline terminology.
- Added per-file preparation/upload progress and plain-language Uploading, Waiting, Transcribing, Creating notes, Ready, and Needs attention states.
- Registered every selected recording as a non-claimable upload placeholder, then made each recording independently claimable as soon as its own validated upload completed.
- Continued later files after an individual upload failure while preserving the complete batch boundary for completion notifications.
- Added authenticated-only Supabase RPCs, strict media-integrity constraints, safe interrupted-upload state, and backward compatibility for already-open clients.
- Applied and rollback-tested all four forward migrations against production without disturbing the active FIFO worker queue.
- Pushed release commit `f3288cc` and deployed it to the public production alias; HTTP copy/health checks passed and the release produced no early warning/error/fatal runtime logs.

### Selectable transcription tiers

- Added Fast (`small`), Balanced (`distil-large-v3`), and High (`medium.en`) choices to the upload dashboard with measured per-hour estimates and a mobile-first radio-card layout.
- Persisted the selected tier on every logical job through a checked, non-null Supabase column and the existing atomically validated upload RPC; all historical jobs remain Fast.
- Updated worker `1.5.0` to honor each job's exact model, beam, language, and previous-text-conditioning profile while preserving FIFO processing and recording the actual model in results.
- Kept only one Whisper model in memory at a time and configured the pre-login `SYSTEM` launcher to reuse the owner's verified Hugging Face cache.
- Displayed the tier/model on dashboard rows, in-progress pages, and completed result pages. Turbo remains unavailable because its benchmark fabricated post-audio speech.
- Deployed the selectable-tier release to production and completed one real browser upload through every tier. All three jobs finished with the expected model labels, source audio was removed, the mobile dashboard had no horizontal overflow at 390 pixels, and the disposable test account/data were deleted.

### Summary repair and transcription comparison

- Fixed the deterministic `Big takeaway` fallback so a first sentence containing titles such as `Dr.` is not truncated at the abbreviation.
- Added a regression test for the HRM-style title case and advanced the local worker to version 1.4.2.
- Added an operator-only comparison tool that transcribes one retained audio source sequentially with production `small`/beam 1, `small.en`/beam 5, and `medium.en`/beam 5 on CPU INT8.
- Added ignored Markdown/JSON benchmark reports containing transcripts, segment metadata, cached timing, and model-agreement measurements without uploading private audio or changing production settings.
- Smoke-tested all three configurations twice on the 9.63-second verification sample; the clean clip was nearly identical across models, so no production-model winner was declared.
- Benchmarked a difficult 10-minute PHIL 201 excerpt from a retained 59.7 MB real class source. `medium.en` materially improved technical and lecture-specific wording but took 5.5 times the baseline transcription time; `small.en`/beam 5 was slower without a consistent quality gain.
- Scored 107 spoken words with published source text: Original/Fast had 9.35% WER, Medium had 15.89%, and High had 3.74%. High reduced errors 76.47% versus Medium on this bounded reference while taking 2.908 times as long.
- Kept production `small`/beam 1 unchanged, documented `medium.en` as a possible future per-recording High accuracy option, and restored the scheduled worker online after the idle-queue benchmark.
- Added a `next-gen` benchmark suite for current High `medium.en`, `distil-large-v3`, and `turbo`, with per-model previous-text conditioning and automatic post-audio timestamp/word detection.
- On the cached ten-minute PHIL excerpt, Distil ran 63.09% faster than current High and emerged as the Balanced-tier candidate; its bounded 107-word WER was 6.54% versus High's 3.74%.
- Rejected Turbo under the tested configuration despite a 2.80% bounded WER because it fabricated 37 words after the audio ended. Production transcription remains unchanged.

### Course archive bootstrap

- Created private `HRM-391`, `PSE-390`, `STRAT-392`, and `PHIL-201` repositories under the owner's GitHub account.
- Exported the owner's four completed September 2 recordings as dated Markdown containing metadata, summary, key points, action items, and full transcript.
- Embedded each Class Scribe job UUID for future duplicate-safe Notion synchronization and kept all transcript text out of the public application repository.
- Verified all four remote files and repository visibility; left the ambiguous `tyler_eager.m4a` recording unexported pending owner classification.
- Changed all four course repositories to public at the owner's explicit direction and verified anonymous HTTP 200 access to every exported document.
- Confirmed every document keeps Summary, Key Points, and Action Items before the complete Transcript in the same file; `tyler_eager.m4a` is intentionally excluded.
- Completed a text-only quality audit of the four real hour-long transcripts: main concepts are usable, but obvious proper-noun, technical-vocabulary, distant-speech, prayer, and cross-talk recognition errors make the current output unsuitable as a verbatim record.
- Identified and subsequently repaired an abbreviation-sensitive study-guide fallback that had truncated the HRM `Big takeaway` after `Dr.`.

## 2026-09-02

### Oversized audio and durable multipart uploads

- Removed the 50 MB source-audio rejection. Oversized audio and all supported video now become local mono 16 kHz, 48 kbps AAC/M4A before any upload.
- Added 90-minute output parts, up to 32 parts and 1 GB of prepared audio per logical recording, while preserving Supabase Free's 50 MB per-object limit.
- Added authenticated TUS resumable uploads with 6 MB chunks, retry delays, and prior-upload resumption for objects over 6 MB.
- Added `transcription_job_parts`, owner/worker RLS, exact multipart path validation, narrow grants, and an atomic multipart batch RPC through committed production migrations.
- Updated worker 1.4.1 to download/transcribe parts sequentially, maintain continuous timestamps, produce one transcript/summary/result, and delete every part after commit.
- Replaced the blocked PyAV decode path with installed system FFmpeg while preserving faster-whisper `small`, CPU, and INT8 inference.
- Verified four-part browser conversion and a real two-part production queue job through combined result and complete Storage cleanup.
- Deployed the web release to production, confirmed a 51.0 MB M4A is accepted for local compression, and found no current-deployment runtime errors or warning/error/fatal logs.

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
