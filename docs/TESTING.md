# Testing and Verification

## Automated and build checks — PASS

**Date:** 2026-08-23

- Python compile: `worker.py`, bootstrap, verifier, and tests.
- Worker helper tests: 4/4 pass (chunking, list cleanup, suffix safety, model JSON/thinking cleanup).
- Next.js `npm run lint`: pass.
- Next.js `npm run build`: pass; all routes compile under Next.js 16.3.2.
- Duplicate worker launch: exits 0 while the scheduled worker remains the only active instance.
- Supabase production schema and all seven committed migration files are represented; the latest batch-limit migration applied successfully.
- Batch-limit migration: applied successfully; a rolled-back production transaction accepted 20 metadata records/jobs atomically and rejected 21 with zero rows created.
- Production browser selector: accepted 20 synthetic 1 KB MP3 files and displayed `20/20`; rejected 21 with the expected message and retained `0/20`. No test audio was uploaded.
- Browser video-size boundary: accepted a valid 57.3 MB MP4 even though its original size exceeded the 50 MB Supabase object limit.
- Browser extraction: converted that MP4 locally to a 55 KB mono AAC/M4A and uploaded only the derived audio.
- Production deployment: Ready on the existing public alias; the live dashboard accepted a synthetic 57.3 MB MP4 for local extraction without uploading it.
- Post-deployment Vercel check: no runtime errors and no warning/error logs for deployment `dpl_3UCh1PMhNGfbtBKjTj2TNnpkmxYz`.
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
10. The temporary QA Auth user and its cascaded rows were deleted after verification; Storage remained empty and the worker remained live.

**Result:** PASS.

## Oversized video-to-audio path — PASS

**Environment:** local Next.js UI connected to production Supabase and the production Windows worker.
**Input:** generated 57.3 MB MP4 containing 9.6 seconds of non-private class-style verification speech.

1. The browser accepted the original video above 50 MB.
2. Mediabunny extracted its primary audio locally and discarded the video track.
3. The output was a 55 KB `audio/mp4` M4A, well below the Storage limit.
4. Only the M4A appeared in private Storage and the durable queue.
5. faster-whisper transcribed the expected photosynthesis lesson; Ollama returned the summary, key point, and assignment.
6. The result rendered in the app and the worker removed the source audio after success.
7. The disposable Auth user, job, batch, result, Storage object, and generated source file were all removed and their absence verified.

**Result:** PASS.

## Validation checks exercised

- One-to-20 UI limit and 50 MB client validation are implemented.
- The 50 MB pre-selection limit applies only to direct audio. Video is validated after local extraction because the original never uploads.
- Database RPC independently enforces 1-20, 50 MB, MIME type, and owner path.
- Storage bucket independently enforces 50 MB and allowed content types.
- Queue claim requires the dedicated worker JWT role.
- A normal signed-in test account could not act as the worker during authorization checks.

## Production Auth — PASS

- A disposable new account received a session immediately and was marked confirmed without an email-confirmation step.
- The test session was revoked and the disposable account was removed afterward.

## Still requiring owner-operated tests

- [ ] Forgot/reset password email and return URL.
- [ ] Two real user accounts cannot read each other's rows or Storage objects.
- [ ] Five real 30-60 minute classes remain FIFO and sequential.
- [ ] A 12-file batch of 5-10 minute recordings uploads and remains FIFO/sequential.
- [ ] A real long MP4/MOV/WebM class recording is prepared on the owner's normal browser and its conversion time and peak browser memory are recorded.
- [x] A 21st selected file is rejected before upload.
- [ ] Restart the computer during a long recording and confirm stale-lease recovery.
- [ ] Measure 30- and 60-minute processing time and peak memory.
- [ ] Keyboard/mobile usability review on the final production domain.

Do not promise processing time until real long-class benchmarks are recorded.
