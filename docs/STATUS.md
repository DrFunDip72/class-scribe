# Current Status

**Last updated:** 2026-09-02
**Phase:** Built and deployed with source recordings larger than 50 MB, local audio/video preparation, resumable multipart uploads, one-result multipart processing, unattended pre-login worker startup, optional browser/email completion notifications, persistent Copied/Done/Archived workflow tracking, and a mobile-first interface. The zero-incremental-cost external outage monitor works but is not yet acceptance-complete because GitHub's schedule is best-effort.

## Live resources

- Production: https://class-scribe-ruddy.vercel.app
- GitHub: https://github.com/DrFunDip72/class-scribe
- Supabase project: `class-transcriber`
- Supabase ref: `wmsotywnkqdajhmiultx`
- Vercel project: `class-scribe` (`prj_hhjU0dQL2pTWWxjNq4A1EqkDVYq7`)
- Worker task: `AudioTranscriberWorker`

No credentials are stored in this document.

## Completed

- Responsive production web app with sign-up, sign-in, sign-out, confirmation callback, forgot/reset password, protected dashboard, job history, retry, selective summary/transcript/everything copy, and complete Markdown download.
- Direct private uploads for one to 20 logical recordings. Audio at 50 MB or below uploads unchanged; oversized audio and MP4/WebM/MOV/M4V/MKV video are prepared locally.
- Sequential browser-side conversion to mono 16 kHz, 48 kbps AAC/M4A in 90-minute parts. Original oversized audio/video never uploads; each private object remains at most 50 MB.
- Authenticated TUS resumable transfer for objects above 6 MB, with 6 MB chunks, retry delays, and prior-upload resumption.
- Ordered multipart manifests with up to 32 parts and a 1 GB prepared-recording safety ceiling; one selected source remains one FIFO job and one result.
- Supabase schema, private bucket, ownership RLS, FIFO claim RPC, leases, retry limit, heartbeats, results, and deferred completion events.
- Dedicated worker Auth identity with only the RLS access required to process jobs.
- Sequential Windows worker using faster-whisper small CPU INT8 and Ollama qwen3:4b.
- Automatic audio deletion after success and safe local temporary-file cleanup.
- Pre-login Windows `SYSTEM` task with startup, logon, five-minute fallback, missed-run, and 999 one-minute restart protections; a persistent launcher supervises Ollama and the worker, while cross-session locks prevent duplicates.
- Boolean-only public worker health route plus a GitHub Actions monitor configured every five minutes that creates one assigned outage issue and closes it after recovery; monitoring uses no AI, email API, new vendor, paid runner, artifact, or cache. GitHub's free scheduled-event delivery is best-effort and has not met the configured interval reliably.
- Production Vercel deployment and production login/dashboard/result verification.
- Production deployment `dpl_ABTjPTzeqe5RfhH3ZBK4dTsPYwv8` includes oversized-audio preparation, resumable multipart upload, optional email/browser channels, selective copy actions, and the mobile-first layout and is Ready on the public alias.
- Full data-path test: browser upload -> Storage -> queue -> local Whisper -> local Ollama -> saved result -> deleted audio -> production result UI.
- Opt-in Web Push controls, per-device subscription storage, privacy-safe completion/failure alerts, durable retry outbox, service-worker click-through, and locally held VAPID signing key.
- Independent opt-in email controls using the signed-in account email, shared batch/per-recording/failure preferences, a branded privacy-safe HTML template, and durable FluxPrompt delivery retries from the outbound local worker.
- Streamlined study-guide generation with a short overview, lecture-ordered concepts and definitions, selective examples, a final big takeaway, and genuine action items.
- Completed result Copy menu with separate Summary, Transcript, and Everything targets; complete Markdown download remains unchanged.
- Persistent per-recording Summary/Transcript/Everything copy checkmarks, explicit Done/Undo, reversible Archive/Restore, To do/Done/Archived/All filters, per-batch progress, and one-click archive of completed work.
- Phone layouts down to 320 CSS pixels avoid horizontal scrolling, use 44-pixel-or-larger visible touch targets, wrap long recording content, and present Copy choices in a viewport-safe bottom action sheet.
- Business-model documentation now separates the free validation ceiling from compliant paid operation, models unit economics and capacity, and estimates the work required for three growth levels.

## Last verified state

- On 2026-08-28, a live health check found Vercel Ready and Supabase Active Healthy but found the local worker stale for about 58 hours with 10 queued recordings. The prior logon-only task had exited with `0xC000013A` after exhausting three restarts.
- The hardened task is installed as `SYSTEM` with startup, logon, and five-minute repeating triggers, `StartWhenAvailable`, no execution time limit, `IgnoreNew`, wake support, and 999 one-minute restart attempts.
- The old interactive worker was stopped only during an observed idle boundary. The five-minute recovery trigger started the task under `SYSTEM`; Supabase then reported a fresh processing heartbeat from worker `1.3.1` and the durable queue resumed with zero failed jobs.
- A manual interactive `worker.py --once` launch while the `SYSTEM` worker was active exited 0 in 1.53 seconds with the expected duplicate-worker message, proving the global cross-session mutex blocks a second worker.
- PowerShell parsing, Python compilation, and all 13 worker helper tests passed. The ignored `.worker-state`, `.worker-secrets`, and `.env.worker.local` paths remain untracked.
- Worker heartbeat: online on version 1.4.1. The ignored local FluxPrompt key remains configured, and the current worker process was started by the `SYSTEM` task. FFmpeg decoding bypasses the PyAV native extension blocked by Windows Smart App Control while retaining faster-whisper `small` CPU/INT8.
- Production health RPC: applied; returned `true`, allowed anonymous function execution, and retained anonymous denial on direct `worker_heartbeats` table reads. Local production build served HTTP 200 with exactly `{"status":"online"}` and `no-store`.
- Production login: pass.
- Production dashboard: pass; reports worker online.
- Production result view: pass.
- Next.js lint/build: pass.
- Python compile and all 13 helper tests: pass.
- Notification migration: applied; VAPID public key published and private key retained locally.
- Production Web Push: real Chrome/FCM subscription, one-attempt worker delivery, service-worker receipt, generic payload, and private-result click-through all passed end to end; disposable data was removed.
- Production selective-copy test: Summary excluded the transcript, Transcript excluded study-note sections, and Everything contained summary, key points, action items, and transcript.
- Local mobile browser test: landing, sign-up, dashboard, and result layouts had no horizontal overflow at 320, 360, 390, and 430 CSS pixels; all visible dashboard/result controls were at least 44 pixels in both dimensions.
- Mobile Copy action sheet: stayed fully inside a 320 x 568 viewport, focused its first choice, closed by outside tap or Escape, returned focus to Copy, and preserved the compact desktop dropdown at 1280 x 800.
- Automated WCAG 2 A/AA scan: zero detected violations on the mobile dashboard, completed result, and open Copy action sheet after contrast corrections.
- Disposable mobile QA account: source audio was removed after processing, the Auth session was revoked, the user and cascaded test rows were deleted, and zero test media remained.
- Final production mobile check: the public Vercel dashboard and completed result had no overflow and no sub-44-pixel visible targets at 320 x 568; the Copy sheet remained inside the viewport and its WCAG 2 A/AA scan had zero detected violations.
- Vercel post-deployment health for `dpl_4tGJ5KyeLzEtwXNc4rQnoMH4KGdo`: build Ready with no build failures and no production runtime warning, error, or fatal logs after the authenticated mobile test.
- Worker `1.2.1` study-guide test: a short production sample stayed source-faithful, retained the real assignment, avoided count padding/outside facts, and ended with `Big takeaway`.
- Supabase migration application: pass.
- Email migration `email_completion_notifications`: applied to production; expected columns, partial indexes, worker/user policies, and JWT-email RLS checks are present.
- Email implementation checks: Next.js lint/build pass; Python compile and 12 helper tests pass for exact input ordering, request authentication/routing, responsive private HTML, defensive FluxPrompt parsing, response/error sanitization, and existing worker helpers.
- Local authenticated dashboard email control: pass; a disposable account enabled its exact account address, rendered the saved state, disabled it, and was fully removed. A separate RLS test proved a substituted recipient is rejected.
- Production authenticated dashboard email control: pass on `https://class-scribe-ruddy.vercel.app`; Email and Browser pop-ups both rendered, the exact account address enabled/saved/disabled, worker 1.3.0 reported online, and no horizontal overflow appeared at the desktop verification viewport. The disposable account was removed.
- Vercel deployment `dpl_ZCoznuhNdzRQaTB2roWvv14dPgPk`: Ready on both production aliases after a successful Next.js build. The post-deployment authenticated check produced no runtime errors or warning/error/fatal logs.
- Live FluxPrompt API calls: pass twice. The owner approved the exact recipient, `worker.py --test-email` sent two branded three-recording samples, and both calls returned HTTP 200 with the expected non-empty success response. No API key, HTML body, recipient, or provider response body was persisted in project documentation.
- Production batch boundary: 20 files accepted as 20 jobs; 21 files rejected with no batch created.
- Production Auth sign-up: a disposable account received a session immediately with no email-confirmation gate; its session was revoked and the account removed after the test.
- Production browser boundary: 20 synthetic MP3 files were accepted into the selector; 21 were rejected before upload. No test audio was uploaded or queued.
- Oversized-video path: a valid 57.3 MB MP4 was accepted, converted locally to a 55 KB M4A, uploaded, transcribed, summarized, rendered, and fully cleaned up.
- Deployed browser boundary: the public production dashboard accepted a synthetic 57.3 MB MP4 and labeled it for local extraction without uploading it; the disposable account was then removed and Storage remained empty.
- Vercel post-deployment health: no runtime errors or warning/error logs for the new deployment.
- Recording workflow migration `recording_user_states`: applied to production with account-owner RLS and no browser write grant on worker-controlled jobs. Owner upsert passed; a simulated cross-account insert failed with PostgreSQL `42501`.
- Twelve-recording workflow QA: initial To do state, persistent Summary copy, Done/Undo, Archive/Restore, bulk batch archive, filters, and `2 of 12 done` progress all passed locally and on the production database.
- Recording workflow mobile QA: the new dashboard initially exposed a min-content overflow at 320 x 568; the corrected layout reports `scrollWidth === innerWidth`, no visible sub-44-pixel controls, a fully bounded Copy sheet, zero WCAG 2 A/AA violations, and no browser page errors.
- Production deployment `dpl_3mV6YVvTVyYRCkjRqy68FyUCpQMs`: Ready on the public alias. Authenticated dashboard/result workflow passed at 320 pixels; the saved Summary check persisted across deployments; current-deployment warning/error/fatal runtime logs were empty.
- Production availability after the workflow release: landing page HTTP 200 and worker-health HTTP 200 with `{"status":"online"}`. The disposable 12-recording account and all cascaded database rows were removed; zero QA Storage objects remain.
- GitHub `main`: workflow implementation pushed in commit `a4b4ab6`.
- On 2026-08-30, the live health route again returned HTTP 200 with exactly `{"status":"online"}` and `Cache-Control: no-store, max-age=0`; the Windows task was Running.
- The external monitor is active and completed eight scheduled checks successfully. Its first manual negative-path run opened one owner-assigned `worker-offline` issue, and the next successful scheduled check closed that issue after recovery, proving issue deduplication and recovery closure in production.
- GitHub did not deliver the configured five-minute schedule reliably: observed successful runs had gaps up to about 6 hours 37 minutes. Owner email receipt is still unverified, so outage notification is not yet acceptance-complete.
- Supabase performance advisor: only expected low-traffic unused-index informational notices for the heartbeat and pending-email indexes; no recording-state finding.
- Supabase security advisor: expected warnings for intentionally callable, guarded SECURITY DEFINER RPCs. Leaked-password protection is unavailable on the Free plan.
- Multipart migrations: applied to production. A rolled-back 70 MB logical-job simulation confirmed ordered manifest validation; security/performance advisors reported no new multipart finding.
- Browser multipart conversion: pass. The real local encoder split a 9.63-second sample at forced three-second boundaries into four valid M4A parts with no browser error.
- Resumable upload: pass. An authenticated 7 MiB TUS upload used the production endpoint, listed one private object, and was fully removed.
- Production multipart result: pass. Two private audio parts became one 19.265-second completed result on attempt 1 with continuous segment timestamps, a non-empty summary, and zero remaining Storage objects.
- Production oversized-audio selector: pass. The deployed dashboard accepted a synthetic 51.0 MB M4A, labeled it `compresses locally`, created no job because submission was intentionally not started, and retained no test media/account.
- Production release health: login and worker-health returned HTTP 200; health returned exactly `{"status":"online"}` with `no-store`; current-deployment runtime error and warning/error/fatal log scans were empty.

## Supabase Auth policy

Email/password sign-up remains enabled, but mandatory email confirmation is disabled by owner decision. New users receive a session immediately and are sent directly to the dashboard.

Password-reset email stays enabled. The production reset URL should remain allow-listed even though sign-up confirmation is off.

## Deferred by design
- Speaker diarization, cloud inference fallback, billing, teams, and public sharing.
- Performance benchmarking with actual 30- and 60-minute private class recordings.

## Exact next task

Upload the real `hrm 391 9-2.m4a` from the owner's normal browser and record preparation time, peak browser memory, uploaded-part count, and completed result quality. Then test five real 30-60 minute recordings as one batch to confirm practical FIFO timing and live Storage headroom. Separately, replace or supplement the best-effort GitHub schedule with a genuinely dependable zero-cost external interval, confirm the owner receives its outage email, and run a planned worker outage/recovery drill. On the next planned Windows restart, confirm the task reaches Running and publishes a fresh heartbeat before any user signs in. Also verify one opted-in automatic completion email plus its `completion_events` delivery state.

For business validation, recruit 20-30 invited students for four active school weeks and measure retained usage, end-to-end processing time, egress, failures, support time, and willingness to pay before implementing billing.
