# Testing and Verification

## Automated and build checks — PASS

**Date:** 2026-08-23

- Python compile: `worker.py`, bootstrap, verifier, and tests.
- Worker helper tests: 4/4 pass (chunking, list cleanup, suffix safety, model JSON/thinking cleanup).
- Next.js `npm run lint`: pass.
- Next.js `npm run build`: pass; all routes compile under Next.js 16.3.2.
- Duplicate worker launch: exits 0 while the scheduled worker remains the only active instance.
- Supabase migrations: six applied successfully.
- Worker heartbeat: online/idle within seconds of the check.

## Local inference — PASS

Generated MP3 input was transcribed by faster-whisper small on CPU INT8, then summarized by local Ollama `qwen3:4b`. Transcript and summary were non-empty and accurate.

## End-to-end data path — PASS

**Environment:** production Supabase; browser app first on local Next.js, then same persisted result verified on public Vercel deployment.
**Input:** generated `verification-sample.mp3`, 39 KB, non-private class-style speech.
**Observed:**

1. Authenticated browser uploaded directly to private Storage.
2. Atomic batch/job creation queued the item.
3. Windows worker claimed it FIFO.
4. faster-whisper produced a 23-word transcript.
5. Ollama produced a summary, one key point, and one action item.
6. Result and pending completion event were saved.
7. Source Storage object was deleted (remaining test audio count 0).
8. Dashboard showed Completed and worker online.
9. Production sign-in and result page displayed the saved private notes.

**Result:** PASS.

## Validation checks exercised

- One-to-five UI limit and 50 MB client validation are implemented.
- Database RPC independently enforces 1-5, 50 MB, MIME type, and owner path.
- Storage bucket independently enforces 50 MB and allowed content types.
- Queue claim requires the dedicated worker JWT role.
- A normal signed-in test account could not act as the worker during authorization checks.

## Still requiring owner-operated tests

- [ ] New-account confirmation link after production Auth URLs are saved.
- [ ] Forgot/reset password email and return URL.
- [ ] Two real user accounts cannot read each other's rows or Storage objects.
- [ ] Five real 30-60 minute classes remain FIFO and sequential.
- [ ] Restart the computer during a long recording and confirm stale-lease recovery.
- [ ] Measure 30- and 60-minute processing time and peak memory.
- [ ] Keyboard/mobile usability review on the final production domain.

Do not promise processing time until real long-class benchmarks are recorded.
