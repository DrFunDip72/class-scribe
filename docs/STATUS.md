# Current Status

**Last updated:** 2026-08-23
**Phase:** Built and deployed with 20-file batches, local video-to-audio extraction, and opt-in persistent completion notifications.

## Live resources

- Production: https://class-scribe-ruddy.vercel.app
- GitHub: https://github.com/DrFunDip72/class-scribe
- Supabase project: `class-transcriber`
- Supabase ref: `wmsotywnkqdajhmiultx`
- Vercel project: `class-scribe` (`prj_hhjU0dQL2pTWWxjNq4A1EqkDVYq7`)
- Worker task: `AudioTranscriberWorker`

No credentials are stored in this document.

## Completed

- Responsive production web app with sign-up, sign-in, sign-out, confirmation callback, forgot/reset password, protected dashboard, job history, retry, copy, and Markdown download.
- Direct private uploads for one to 20 supported recordings. Direct audio is capped at 50 MB; MP4/WebM/MOV/M4V/MKV video is converted locally and only its derived audio must fit the 50 MB limit.
- Sequential browser-side video conversion to mono 16 kHz, 48 kbps AAC/M4A; original video never uploads.
- Supabase schema, private bucket, ownership RLS, FIFO claim RPC, leases, retry limit, heartbeats, results, and deferred completion events.
- Dedicated worker Auth identity with only the RLS access required to process jobs.
- Sequential Windows worker using faster-whisper small CPU INT8 and Ollama qwen3:4b.
- Automatic audio deletion after success and safe local temporary-file cleanup.
- Startup task plus named-mutex duplicate-instance protection.
- Production Vercel deployment and production login/dashboard/result verification.
- Production deployment `dpl_9sbGiPyFnEwXzEB8n9AwYCMFtcgT` includes browser-side video extraction and persistent notifications and is Ready on the public alias.
- Full data-path test: browser upload -> Storage -> queue -> local Whisper -> local Ollama -> saved result -> deleted audio -> production result UI.
- Opt-in Web Push controls, per-device subscription storage, privacy-safe completion/failure alerts, durable retry outbox, service-worker click-through, and locally held VAPID signing key.

## Last verified state

- Worker heartbeat: online and idle, version 1.1.0.
- Production login: pass.
- Production dashboard: pass; reports worker online.
- Production result view: pass.
- Next.js lint/build: pass.
- Python compile and six helper tests: pass.
- Notification migration: applied; VAPID public key published and private key retained locally.
- Production Web Push: real Chrome/FCM subscription, one-attempt worker delivery, service-worker receipt, generic payload, and private-result click-through all passed end to end; disposable data was removed.
- Supabase migration application: pass.
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

- Sending completion emails through the owner's agent-builder caller.
- Speaker diarization, cloud inference fallback, billing, teams, and public sharing.
- Performance benchmarking with actual 30- and 60-minute private class recordings.

## Exact next task

After the production push deployment is verified, test a real 12-recording class batch when source files are available, including at least one long video, then measure browser preparation time, upload time, transcription/summarization time, notification arrival, and peak memory.
