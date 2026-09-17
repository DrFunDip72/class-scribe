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

## ADR-025 — Private Course Repositories for Transcript Exports

Store any GitHub copy of a private transcription only in a private course-specific repository. Never place transcript or summary content in the public `class-scribe` application repository. Use the immutable Class Scribe job UUID in each Markdown document's frontmatter and use the lecture date, rather than upload or completion time, for its dated path.

**Reason:** The owner wants course-organized GitHub archives and future Notion automation, while transcripts remain private educational data. A stable source ID supports duplicate-safe synchronization even if a title or filename later changes.

**Consequence:** The initial private repositories are `HRM-391`, `PSE-390`, `STRAT-392`, and `PHIL-201`. The September 2 owner results were exported once to `notes/2026/2026-09-02.md`. Recordings without an unambiguous course and lecture date must remain unexported until the owner classifies them. This decision establishes the privacy and identity convention only; durable automatic GitHub and Notion delivery still requires a reviewed implementation and retry outbox.

## ADR-026 — Owner-Directed Public Course Archives

Supersede ADR-025's private-repository requirement for these four owner-controlled course archives. Publish `HRM-391`, `PSE-390`, `STRAT-392`, and `PHIL-201` so the owner can intentionally share the notes with friends. Keep the public application repository separate and continue excluding all other users' data.

**Reason:** The owner explicitly chose public visibility for the four course repositories after reviewing the sharing purpose. Public GitHub links are simpler to distribute and can later feed a public Notion workflow without repository authentication.

**Consequence:** Anyone can discover, read, copy, index, or redistribute these exported summaries and transcripts, including content retained in Git history. Future automatic export must be opt-in and restricted to the owner's account; it must never publish another account's recording. Every public document must preserve its source job UUID and place the study-guide summary before the complete transcript. `tyler_eager.m4a` is explicitly excluded from all course repositories.

## ADR-027 — Local Three-Configuration Transcription Benchmark Before Model Changes

Keep the production transcriber on `faster-whisper` `small`, CPU INT8, beam 1 while evaluating three configurations against the exact same retained source: the production baseline, English-only `small.en` with beam 5, and English-only `medium.en` with beam 5. Decode once, run each model sequentially, and save only local ignored comparison artifacts.

**Reason:** The September 2 text audit exposed proper-noun, technical-vocabulary, quiet-speech, prayer, and cross-talk errors, but the source audio had already been deleted. Model-to-model agreement on a clean synthetic clip does not measure accuracy. A retained real lecture plus human listening is required to determine whether added CPU time produces a meaningful quality gain.

**Consequence:** `compare_transcribers.py` is an operator-only experiment and never uploads audio or changes database results. Its outputs belong in ignored `.transcriber-benchmarks/` and must not be committed. First-time model downloads distort timing, so use a cached repeat for performance. Do not change ADR-005 or the production worker configuration until a real class recording is reviewed against all three outputs.

## ADR-028 — Keep the Fast Default; Treat Medium English as an Optional Quality Tier

Retain ADR-005's `small`/CPU INT8/beam-1 production default. Do not adopt `small.en`/beam 5. Treat `medium.en`/beam 5 as a candidate for a future explicit per-recording High accuracy option, not a silent system-wide replacement.

**Reason:** On a difficult 10-minute real PHIL 201 excerpt, `small.en` took 184.532 seconds versus the baseline's 97.235 seconds without a consistent quality gain. `medium.en` recovered materially better technical, name, and sentence-level wording, but took 536.625 seconds—5.5 times the baseline transcription time—and still was not verbatim-perfect.

**Consequence:** Existing uploads keep their current speed and FIFO capacity. A future High accuracy feature must expose the processing-time tradeoff before submission, persist the chosen model per job, keep processing sequential, and be tested on a full class and multi-file queue before release. The current comparison tool remains available for private operator experiments without changing saved production results.

## ADR-029 — Prefer Distil for a Future Balanced Tier; Reject Turbo as Tested

Keep production on ADR-005's `small` default. If a faster higher-quality tier is implemented, use `distil-large-v3` as the leading Balanced candidate and retain `medium.en` as the High/exactness candidate. Do not promote `turbo` with the tested beam-5, previous-text-conditioned configuration.

**Reason:** On the cached ten-minute PHIL 201 benchmark, Distil took 204.844 seconds versus 554.953 for `medium.en`, a 63.09% reduction, and produced no post-audio text. Its bounded 107-word published-reference WER was 6.54% versus 3.74% for `medium.en`, showing a measurable exact-wording tradeoff. Turbo was faster than `medium.en` and scored 2.80% on that bounded reference, but invented 37 words across 11 segments wholly beyond the source boundary and extended timestamps 26.916 seconds past the audio.

**Consequence:** No deployed model changes in this decision. A future tiered implementation must label speed/accuracy tradeoffs, persist the selected tier, and retain sequential queueing. Turbo requires a separate configuration and hallucination-control test before reconsideration; bounded quote WER must never be presented as whole-lecture accuracy.

## ADR-030 — User-Selected Fast, Balanced, and High Transcription Tiers

Implement one transcription-tier choice per upload batch and persist the choice on every logical recording job. Fast maps to `small`/beam 1 with automatic language detection, Balanced maps to `distil-large-v3`/beam 5 with fixed English and previous-text conditioning disabled, and High maps to `medium.en`/beam 5 with fixed English. Fast is the backward-compatible default.

**Reason:** The owner approved all three non-hallucinating benchmark candidates so users can choose turnaround versus exactness. Persisting a controlled tier identifier instead of an arbitrary model name prevents browsers from requesting unreviewed models or parameters. Keeping the existing two-argument upload RPC and placing the tier inside each validated file record avoids an unsupported overloaded PostgREST function and preserves already-open clients.

**Consequence:** The dashboard shows rounded estimates of 10, 20, and 55 transcription minutes per recorded hour on the current worker and identifies the selected tier in history and results. FIFO order never changes based on tier. To stay within 16 GB RAM, the worker retains one Whisper model and unloads it before switching. The `SYSTEM` launcher reuses the owner's Hugging Face cache. Existing jobs and missing legacy inputs resolve to Fast; only `fast`, `balanced`, and `high` pass the database constraint and RPC validation.

## ADR-031 — Progressive Per-Recording Queue Admission

Create every logical job in a batch as an `uploading` placeholder, then atomically promote each job to `queued` immediately after its own complete Storage manifest has uploaded and passed validation. Keep media preparation and transfer sequential in the browser and keep worker inference FIFO with one active job.

**Reason:** A large multi-file selection should not make the first completed upload wait for every later file. Creating all placeholders first preserves the true batch boundary for notification logic, while a distinct non-claimable state prevents the worker from seeing incomplete media.

**Consequence:** The first finished source may begin processing while later files prepare or upload. One failed source is marked with a safe upload failure and does not prevent later selections from entering the queue. The worker and its active queue require no restart because `claim_next_job` still selects only `queued` rows. A force-closed browser can leave an `uploading` placeholder; it cannot be processed or trigger a false batch-complete notification, and automatic stale-upload cleanup is deferred. The old atomic `create_upload_batch` RPC remains for backward compatibility.

The normal client UI describes results and progress in plain language and hides implementation details such as model IDs, byte counts, raw worker stages, detected-language diagnostics, and infrastructure names. Fast, Balanced, and High remain visible because users actively choose their speed/quality tradeoff.

## ADR-032 — Recover the Private OpenWhispr API After Owner Logon

Keep the owner's separate Speaches API in its existing Docker container, bound only to the computer's Tailscale IPv4 address. Retain the container's `unless-stopped` policy and add a least-privileged owner-session Windows task that runs at logon and every five minutes. The task may start Docker Desktop and the existing container, but it must not recreate the container or publish port 8000 beyond Tailscale.

**Reason:** The 2026-09-09 Windows restart left Docker Desktop, WSL, and the port-8000 API stopped even though Docker's normal login auto-start setting was enabled. Class Scribe recovered because it has an independent `SYSTEM` task; OpenWhispr had no equivalent retry layer.

**Consequence:** `Systran/faster-whisper-base.en` returns automatically after the owner signs in, and later Docker/container failures are retried within about five minutes. Docker Desktop still depends on the owner's interactive profile, so this design does not promise pre-login availability. Concurrent OpenWhispr and Class Scribe inference share CPU and can increase fan noise and completion time.

## ADR-033 — Gate Queue Startup on a Complete Ollama Runtime

Require the Windows launcher to verify Ollama's installed `llama-server.exe` inference runner as well as its localhost `/api/tags` response before starting the queue worker. Keep an ignored maintenance marker that lets the `SYSTEM` task stop its own detached Ollama process during a signed installer repair or upgrade.

**Reason:** Ollama 0.32.15 could still answer `/api/tags` after its inference runner disappeared, so the earlier health check reported ready while every `qwen3:4b` summary request failed with HTTP 500 and consumed durable job attempts. A normal user process could not terminate the `SYSTEM`-owned runtime to repair the installation.

**Consequence:** A partial Ollama installation now holds jobs safely in the durable queue instead of claiming them. An operator must repair the local runtime before processing resumes. The maintenance marker is local, ignored, and must be removed after maintenance; it changes no database, network, model, or privacy boundary.

## ADR-034 — Withhold Corrupted Results From Public Course Archives

Replace an existing course note only when the new completed result has an unambiguous owner, course, lecture date, expected model, complete document structure, and a basic transcript-integrity check. Do not publish a nominally completed result when repetition or coverage evidence indicates corruption.

**Reason:** The High-tier HRM 391 September 8 job spans 73 minutes but contains only 1,187 words, and 182 of its 198 segments repeat the same sentence through most of the recording. Publishing it would turn a processing failure into misleading public study material. Its source object was deleted by the normal post-completion retention path, so the existing result cannot be repaired from stored media.

**Consequence:** The four valid September 2 High results replace their Fast counterparts, and the valid PSE 390 September 8 result is added. HRM 391 September 8 remains unpublished until the owner re-uploads the source and a new result passes integrity review. Git history preserves every superseded public note for rollback.

## ADR-035 — Owner-Only Drive Inbox and Automatic Public Course Archive

Use a local hourly `SYSTEM` automation to read the owner's `URecorder` Google Drive folder on Monday/Wednesday, with one missed-class-day catch-up. Convert sources through native FFmpeg into ten-minute private M4A parts, admit them through worker-only Supabase RPCs, process them with the existing FIFO worker at High tier, then publish only integrity-approved results to the four owner-directed public course repositories. Run a separate Thursday audit for the expected two/two/two/one weekly note schedule.

**Reason:** The desired workflow is record, name, and stop touching the file. A local pull preserves the outbound-only home-server boundary, Drive provides durable source retention during outages, ten-minute parts make upload retries inexpensive, and the existing queue/inference system avoids a second transcription stack. Drive file ID plus modification time prevents repeated scans; parsed class/date/part plus an owner-job cross-check prevents retranscribing a recording already submitted through the browser.

**Consequence:** Automatic import/export applies only to `jmaximum72@gmail.com` and `HRM-391`, `PSE-390`, `STRAT-392`, and `PHIL-201`. Ambiguous filenames, schedule mismatches, multiple matching jobs, occupied GitHub paths with another UUID, or suspicious transcripts stop at review instead of being guessed or published. GitHub documents remain publicly readable by owner decision and order Summary, Key Points, Action Items, then Transcript. Google and GitHub credentials remain local and ignored. The current rclone shared OAuth client works but is scheduled for retirement during 2026, so a personal Google OAuth client ID is required near-term for long-term reliability.

## ADR-036 — First-Party Drive Desktop Source with Owner-Session Import

Supersede ADR-035's active rclone source with the owner's Google Drive for desktop streamed `URecorder` view. Run only the import/export pass under the owner's interactive Windows principal at logon and hourly; keep the continuous transcription worker and Thursday repository audit as `SYSTEM`. Hydrate each eligible source to isolated staging, compare source size and modification time before and after copying, and retain the rclone code/config temporarily only for rollback.

**Reason:** The first-party client is already signed into the correct account, removes dependency on rclone's retiring shared OAuth client, requires no new cloud credential in Class Scribe, and exposes the exact durable phone-upload folder. Google's streamed drive is scoped to the signed-in Windows session, so a pre-login SYSTEM importer cannot reliably access it.

**Consequence:** New Drive ingestion begins only after the owner has logged into Windows and Google Drive for desktop is running; locking the session does not stop it. The pre-login inference worker can continue processing already-queued work. Local source IDs derive from normalized relative paths and version identity still includes modification time; compatibility checks prevent already-linked rclone content from being duplicated. The obsolete SYSTEM importer must be removed with the administrator installer, and the old Google OAuth grant should be revoked after a one-week rollback window.

## ADR-037 — Use Exact-Source Overrides for Historical or Off-Schedule Backfills

Keep the scheduled importer’s global cutover and Monday/Wednesday validation intact. For an owner-approved exception, admit only one explicitly named Drive-relative path through an operator command. Allow that command to skip cross-source matching when a known matching result is corrupt, while retaining the existing private result and all publication quality checks.

**Reason:** The September 8 HRM and PHIL recordings predate the automation cutover and use a Tuesday date, so broadening the recurring importer would also make unrelated historical files eligible. HRM already has a nominally completed but badly repetitive result, so normal matching would link the bad job instead of retranscribing the preserved Drive source.

**Consequence:** Historical recovery is deliberate, auditable, and limited to the exact stable file the owner names. It does not change normal discovery, scheduling, privacy, FIFO processing, source retention, or public publication safeguards. `--force-new` may create a second private result only when explicitly invoked; the exporter publishes only the newly linked ingestion after it independently passes integrity checks.

## ADR-038 — Merge Desktop and Cloud Drive Discovery

Use the owner-session Google Drive for desktop view as the preferred local source and the existing read-only rclone remote as a cloud fallback. Merge the two listings by case-insensitive relative path, choose the newest observed version, and prefer local hydration when timestamps tie. Accept the unambiguous standalone `Phil` alias and a one-day-early recording date; map that tolerated date to the following scheduled class day only for weekly coverage accounting.

**Reason:** `Phil 9-14.m4a` existed in the owner’s cloud `URecorder` folder but remained absent from the streamed `G:` view many hours later, so desktop-only discovery silently missed a valid recording. `strat 392 9-8.m4a` was present but intentionally excluded because its filename was one day earlier than Wednesday and older than the initial cutover. The observed recorder filenames therefore require both source redundancy and narrow date/name tolerance.

**Consequence:** Either Drive view can keep discovery operating when the other is unavailable, and duplicate paths still produce one logical candidate before database idempotency checks. The cloud fallback retains the retiring shared rclone OAuth dependency until it is replaced with an owner-created client, but its failure does not disable desktop discovery. Exact historical files before cutover still require the explicit backfill command. Public note dates preserve the filename date, while the weekly audit counts a one-day-early label against its intended scheduled day.

## ADR-039 — Repository-Local AI Reading Indexes

Place a root `AGENTS.md` in each public course repository and title it as that course’s AI Repository Index. Keep it procedural rather than maintaining a static lecture list: agents enumerate dated note paths, read summaries for orientation, verify material claims against timestamped transcript passages, cite lecture dates and timestamps, disclose missing coverage, and treat non-dated materials as supplemental.

**Reason:** The repositories are intended for friends and future AI-assisted study. A root `AGENTS.md` is automatically discoverable by many coding agents, while dynamic path rules remain accurate as Class Scribe publishes new lectures without another index-writing step.

**Consequence:** Every course archive has self-contained reading and safety instructions. HRM explicitly distinguishes its Week 1 primer from transcripts, and each course records its expected weekly frequency. The indexes contain no credentials or private database data and prohibit adding source media or unpublished Class Scribe content. Generated lecture files remain automation-owned unless the owner explicitly authorizes a correction.

## ADR-040 — AI Transcript Formatting Must Preserve Source Segments

For transcript-formatting experiments and any future implementation, let the local language model return only structural metadata such as topic headings and paragraph-start segment indexes. Reconstruct the displayed transcript from the original timestamped segments, validate that every segment appears exactly once in its original order, and retain the raw stored result as the canonical source.

**Reason:** Asking a model to rewrite a 60–90 minute transcript can silently paraphrase, correct, omit, or invent content. The September 14 HRM experiment showed that `qwen3:4b` can add useful organization without receiving authority to alter the transcript text.

**Consequence:** Formatting may improve headings, paragraph grouping, and timestamp density without changing evidentiary wording. Invalid model structure must fall back to deterministic grouping. The experiment adds no production behavior yet; a deployed version still needs latency measurement, failure handling, database representation, web/GitHub rendering decisions, and user-facing controls.

## ADR-041 — Format Only Owner GitHub Exports at an Idle Inference Boundary

Apply ADR-040's structure-only method to the owner Drive-to-GitHub exporter, not to normal account results. Split source segments into approximately six-minute windows, ask local `qwen3:4b` only for a short heading and paragraph-start indexes, enforce paragraph-size limits, reconstruct the document from canonical timestamp/text pairs, and verify exact ordered identity before publication. If a model call or structure check fails, stop calling the model for that document and use deterministic headings and paragraph grouping for the remaining windows. Defer completed exports while any transcription job is queued, transcribing, or summarizing.

**Reason:** The owner wants public course documents that are readable without turning a long lecture into one block, but transcript wording is evidence and cannot be delegated to a generative rewrite. Formatting also uses the same CPU and Ollama runtime as the one-at-a-time worker, so it must not compete with class processing.

**Consequence:** Future owner automation notes retain Summary, Key Points, and Action Items first, followed by a topic-organized complete transcript. Supabase remains the unchanged canonical source, other users keep their current private output, and formatting failure cannot lose content or block a valid export. Existing published notes are not automatically backfilled by this change.

## ADR-042 — Publish Owner-Approved Course Audio as Verified Release Assets

For the explicitly authorized owner account and four public course repositories only, rehydrate the matching durable Drive source after transcript quality checks and while the inference queue is idle. Strip source metadata, chapters, and video; create a mono 16 kHz 32 kbps MP3; validate it with FFprobe; upload it to an annual GitHub Release; and require matching byte size plus SHA-256 before adding its public link and metadata to the note. Never store these binaries in ordinary Git history or Git LFS.

**Reason:** The owner wants every public course note to include the recording while keeping the workflow fully automatic and on the $0 stack. Release assets are designed for binary distribution, do not inflate Git history, and expose digest metadata that supports deterministic verification. The original Drive file remains the durable source and can recreate the derivative.

**Consequence:** Classroom audio and voices in these four owner archives are intentionally public. Asset naming is date/part based within `class-audio-<year>`, and same-name bytes may be reused only when size and SHA-256 match; conflicts stop rather than overwrite. A note is not considered fully exported until both asset and Markdown readback verify. All other users retain the private-audio boundary. Historical dated notes are backfilled idempotently, yielding whenever real transcription work enters the queue.

## ADR-043 — Treat Drive Reconnect Folders and Late Sync as One Durable Inbox

Merge the configured Drive Desktop folder with numbered siblings matching `URecorder (n)`, and scan on Monday through Thursday. Admit only one unlabeled source for a course/date/part identity; require explicit `part` or `pt` labels when a lecture genuinely has multiple recordings.

**Reason:** On September 16, Drive Desktop wrote PSE, STRAT, and PHIL into `URecorder (1)` while the importer continued watching `URecorder`. Every scheduled pass succeeded, but could not see those recordings, and Thursday's audit correctly reported three missing notes. A prior-success-only catch-up rule also prevented Thursday discovery after a successful Wednesday scan even if files arrived later.

**Consequence:** A Drive reconnect or late sync no longer silently strands a class recording. Repeated next-day scans remain safe because the ingestion ledger is idempotent. Ambiguous same-date duplicates are not published over one another; the operator must label actual multipart sources explicitly or use the exact-path override when deliberate replacement is required.
