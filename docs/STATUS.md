# Current Status

**Last updated:** 2026-08-28
**Phase:** Built and deployed with unattended pre-login worker startup, layered process recovery, zero-incremental-cost external outage monitoring, 20-file batches, local video-to-audio extraction, optional browser/email completion notifications, streamlined study guides, selective copy actions, and a mobile-first interface.

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
- Direct private uploads for one to 20 supported recordings. Direct audio is capped at 50 MB; MP4/WebM/MOV/M4V/MKV video is converted locally and only its derived audio must fit the 50 MB limit.
- Sequential browser-side video conversion to mono 16 kHz, 48 kbps AAC/M4A; original video never uploads.
- Supabase schema, private bucket, ownership RLS, FIFO claim RPC, leases, retry limit, heartbeats, results, and deferred completion events.
- Dedicated worker Auth identity with only the RLS access required to process jobs.
- Sequential Windows worker using faster-whisper small CPU INT8 and Ollama qwen3:4b.
- Automatic audio deletion after success and safe local temporary-file cleanup.
- Pre-login Windows `SYSTEM` task with startup, logon, five-minute fallback, missed-run, and 999 one-minute restart protections; a persistent launcher supervises Ollama and the worker, while cross-session locks prevent duplicates.
- Boolean-only public worker health route plus a five-minute GitHub Actions monitor that creates one assigned outage issue and closes it after recovery; monitoring uses no AI, email API, new vendor, paid runner, artifact, or cache.
- Production Vercel deployment and production login/dashboard/result verification.
- Production deployment `dpl_ZCoznuhNdzRQaTB2roWvv14dPgPk` includes optional email/browser channels, browser-side video extraction, selective copy actions, and the mobile-first layout and is Ready on the public alias.
- Full data-path test: browser upload -> Storage -> queue -> local Whisper -> local Ollama -> saved result -> deleted audio -> production result UI.
- Opt-in Web Push controls, per-device subscription storage, privacy-safe completion/failure alerts, durable retry outbox, service-worker click-through, and locally held VAPID signing key.
- Independent opt-in email controls using the signed-in account email, shared batch/per-recording/failure preferences, a branded privacy-safe HTML template, and durable FluxPrompt delivery retries from the outbound local worker.
- Streamlined study-guide generation with a short overview, lecture-ordered concepts and definitions, selective examples, a final big takeaway, and genuine action items.
- Completed result Copy menu with separate Summary, Transcript, and Everything targets; complete Markdown download remains unchanged.
- Phone layouts down to 320 CSS pixels avoid horizontal scrolling, use 44-pixel-or-larger visible touch targets, wrap long recording content, and present Copy choices in a viewport-safe bottom action sheet.
- Business-model documentation now separates the free validation ceiling from compliant paid operation, models unit economics and capacity, and estimates the work required for three growth levels.

## Last verified state

- On 2026-08-28, a live health check found Vercel Ready and Supabase Active Healthy but found the local worker stale for about 58 hours with 10 queued recordings. The prior logon-only task had exited with `0xC000013A` after exhausting three restarts.
- The hardened task is installed as `SYSTEM` with startup, logon, and five-minute repeating triggers, `StartWhenAvailable`, no execution time limit, `IgnoreNew`, wake support, and 999 one-minute restart attempts.
- The old interactive worker was stopped only during an observed idle boundary. The five-minute recovery trigger started the task under `SYSTEM`; Supabase then reported a fresh processing heartbeat from worker `1.3.1` and the durable queue resumed with zero failed jobs.
- A manual interactive `worker.py --once` launch while the `SYSTEM` worker was active exited 0 in 1.53 seconds with the expected duplicate-worker message, proving the global cross-session mutex blocks a second worker.
- PowerShell parsing, Python compilation, and all 13 worker helper tests passed. The ignored `.worker-state`, `.worker-secrets`, and `.env.worker.local` paths remain untracked.
- Worker heartbeat: online on version 1.3.1. The ignored local FluxPrompt key remains configured, and the current worker process was started by the `SYSTEM` task.
- Production health RPC: applied; returned `true`, allowed anonymous function execution, and retained anonymous denial on direct `worker_heartbeats` table reads. Local production build served HTTP 200 with exactly `{"status":"online"}` and `no-store`.
- Production login: pass.
- Production dashboard: pass; reports worker online.
- Production result view: pass.
- Next.js lint/build: pass.
- Python compile and six helper tests: pass.
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
- Supabase performance advisor: only one expected unused heartbeat-index informational notice after consolidating the duplicate read policy.
- Supabase security advisor: expected warnings for intentionally callable, guarded SECURITY DEFINER RPCs. Leaked-password protection is unavailable on the Free plan.

## Supabase Auth policy

Email/password sign-up remains enabled, but mandatory email confirmation is disabled by owner decision. New users receive a session immediately and are sent directly to the dashboard.

Password-reset email stays enabled. The production reset URL should remain allow-listed even though sign-up confirmation is off.

## Deferred by design
- Speaker diarization, cloud inference fallback, billing, teams, and public sharing.
- Performance benchmarking with actual 30- and 60-minute private class recordings.

## Exact next task

Confirm the GitHub health workflow runs on schedule, the owner receives assigned-issue email, and a planned outage opens one issue then closes it after recovery. Allow the restarted worker to finish the current real queue and confirm that all remaining recordings complete with no failures. On the next planned Windows restart, confirm the task reaches Running and publishes a fresh heartbeat before any user signs in. Separately, confirm the sample arrived in the owner's inbox and verify one opted-in automatic completion email plus its `completion_events` delivery state.

For business validation, recruit 20-30 invited students for four active school weeks and measure retained usage, end-to-end processing time, egress, failures, support time, and willingness to pay before implementing billing.
