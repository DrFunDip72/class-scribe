# Current Status

**Last updated:** 2026-08-23
**Phase:** Built, deployed, and end-to-end verified; one owner-operated Auth dashboard setting remains.

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
- Direct private uploads for one to five supported audio files, with client and database validation at 50 MB each.
- Supabase schema, private bucket, ownership RLS, FIFO claim RPC, leases, retry limit, heartbeats, results, and deferred completion events.
- Dedicated worker Auth identity with only the RLS access required to process jobs.
- Sequential Windows worker using faster-whisper small CPU INT8 and Ollama qwen3:4b.
- Automatic audio deletion after success and safe local temporary-file cleanup.
- Startup task plus named-mutex duplicate-instance protection.
- Production Vercel deployment and production login/dashboard/result verification.
- Full data-path test: browser upload -> Storage -> queue -> local Whisper -> local Ollama -> saved result -> deleted audio -> production result UI.

## Last verified state

- Worker heartbeat: online and idle, version 1.0.0.
- Production login: pass.
- Production dashboard: pass; reports worker online.
- Production result view: pass.
- Next.js lint/build: pass.
- Python compile and four helper tests: pass.
- Supabase migration application: pass.
- Supabase performance advisor: only expected unused-index informational notices after consolidating the duplicate read policy.
- Supabase security advisor: expected warnings for intentionally callable, guarded SECURITY DEFINER RPCs. Leaked-password protection is unavailable on the Free plan.

## Remaining owner action

Supabase Auth redirect configuration is not exposed by the connected project API. In Supabase Dashboard, open:

`Authentication -> URL Configuration`

Set:

- Site URL: `https://class-scribe-ruddy.vercel.app`
- Redirect URL: `https://class-scribe-ruddy.vercel.app/auth/confirm`
- Redirect URL: `https://class-scribe-ruddy.vercel.app/reset-password`
- Local redirect: `http://localhost:3000/**`

Save, then create a new account with an inbox you can access and verify the confirmation link returns to the production app. Existing confirmed accounts and sign-in already work in production.

## Deferred by design

- Sending completion emails through the owner's agent-builder caller.
- Speaker diarization, cloud inference fallback, billing, teams, and public sharing.
- Performance benchmarking with actual 30- and 60-minute private class recordings.

## Exact next task

Complete the four Supabase Auth URL entries above, then run the sign-up/email-confirmation/password-reset checklist in `docs/TESTING.md`.
