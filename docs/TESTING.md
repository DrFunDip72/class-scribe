# Testing and Verification

## Optional completion email — IMPLEMENTED, LIVE SEND PENDING

**Environment:** local Next.js app, production deployment `dpl_ZCoznuhNdzRQaTB2roWvv14dPgPk`, production Supabase project, and local worker `1.3.0`.

1. `npm run lint` and `npm run build` passed after adding independent Email and Browser pop-up controls. Disposable authenticated accounts repeated the UI check locally and on the public production alias: both channels rendered, Email enabled only for the exact account address, the saved confirmation appeared, and disabling succeeded.
2. Worker compilation passed. Twelve helper tests cover the exact four ordered FluxPrompt input IDs, `api-key` header, flow/session query parameters, responsive branded HTML, generic dashboard link, empty attachment, defensive primary/fallback response parsing, and sanitized bounded delivery metadata.
3. Production migration `email_completion_notifications` applied successfully. The expected columns, partial indexes, RLS policies, and worker read policy were inspected afterward.
4. A separate disposable normal Auth user enabled its own lowercase account address. An attempted different recipient was rejected by RLS. The preference was disabled, the session was revoked, and both disposable Auth users plus cascaded preference rows were deleted.
5. Supabase security and performance advisors were rerun. No new email-related security finding appeared; the new pending-event index is expectedly unused before live delivery traffic.
6. Production deployment reached Ready and its alias moved successfully. The authenticated dashboard reported worker 1.3.0 online, showed no desktop horizontal overflow, and produced no Vercel runtime errors or warning/error/fatal logs. The disposable production account and cascaded row were deleted.
7. The ignored local `FLUXPROMPT_API_KEY` loads successfully without displaying or logging its value. The idle worker process was restarted and returned on worker 1.3.0. With an explicitly owner-approved recipient, `worker.py --test-email` sent the branded three-recording sample twice; both calls returned HTTP 200 and the defensive parser accepted a non-empty success response. Response bodies and the recipient were not written to project documentation. Inbox arrival and an automatic completion-event delivery remain owner-operated checks.

**Result:** code, database, RLS, production UI, mocked request boundary, and live FluxPrompt acceptance pass; inbox arrival and automatic completion-event delivery remain to be observed.

## Automated and build checks — PASS

**Date:** 2026-08-24

- Python compile: `worker.py`, bootstrap, verifier, and tests.
- Worker helper tests: 12/12 pass, including existing transcription/summary/push helpers plus the email template, exact FluxPrompt payload/request contract, response fallbacks, and safe delivery metadata.
- Worker Python dependency integrity: `pip check` pass after adding pinned `pywebpush==2.4.0`.
- Next.js `npm run lint`: pass.
- Next.js `npm run build`: pass; all routes compile under Next.js 16.3.2.
- Duplicate worker launch: exits 0 while the scheduled worker remains the only active instance.
- Supabase production schema and all nine committed migration files are represented; the email completion migration is the latest applied change.
- Batch-limit migration: applied successfully; a rolled-back production transaction accepted 20 metadata records/jobs atomically and rejected 21 with zero rows created.
- Production browser selector: accepted 20 synthetic 1 KB MP3 files and displayed `20/20`; rejected 21 with the expected message and retained `0/20`. No test audio was uploaded.
- Browser video-size boundary: accepted a valid 57.3 MB MP4 even though its original size exceeded the 50 MB Supabase object limit.
- Browser extraction: converted that MP4 locally to a 55 KB mono AAC/M4A and uploaded only the derived audio.
- Production deployment: Ready on the existing public alias; the live dashboard accepted a synthetic 57.3 MB MP4 for local extraction without uploading it.
- Final production deployment `dpl_9sbGiPyFnEwXzEB8n9AwYCMFtcgT`: Ready on both production aliases; no runtime error clusters and no runtime warning/error/fatal logs after deployment.
- Final public smoke check: landing page title/URL passed with no browser page errors or console messages; `manifest.webmanifest` and `class-scribe-icon.svg` both returned HTTP 200.
- Worker heartbeat: online/idle within seconds of the check.
- Worker notification startup: version `1.1.0` heartbeat online/idle; local VAPID private key generated in ignored storage and the 87-character public key published.
- Notification RLS with two disposable immediate-session users: each saw only its own subscription; cross-account subscription insertion, configuration writes, and delivery writes were blocked; delivery rows were invisible; authenticated public-key read succeeded.
- Notification RLS cleanup: both sessions were globally revoked, both disposable users were deleted, and zero synthetic subscriptions remained.

## Persistent completion notification — PASS

**Environment:** production HTTPS site, temporary normal Chrome profile, production Supabase, and production Windows worker `1.1.0`.
**Input:** generated `verification-sample.mp3`, 39 KB, non-private class-style speech.

1. A disposable production account signed in and granted the site notification permission.
2. The app registered the root service worker and created a real FCM Push API subscription.
3. The browser stored only its own account-scoped device subscription and showed the local enabled/test notification.
4. The browser uploaded the sample, the worker transcribed and summarized it, and the dashboard reached Completed.
5. The worker created one durable batch-completion delivery, signed and sent it on attempt one, and recorded `state=sent` with no error.
6. The service worker received the encrypted payload and retained a persistent notification titled `Your class notes are ready`, with generic body text and a click-through URL to the completed private result.
7. The source Storage object count was zero after completion.
8. The test session was signed out, the disposable user and cascaded rows were deleted, the temporary browser was closed, and no test media remained.

**Result:** PASS.

Chrome's runtime Incognito limitation was also exercised: Push API subscription is unavailable there, so the supported path is a normal browser profile.

## Selective copy and study-guide format — PASS

**Environment:** production deployment `dpl_8RmhrLYqJ6tT4tt9Ze9JsPbU1HLZ`, disposable production account, production Supabase, and Windows worker `1.2.1`.
**Input:** `verification-sample.mp3`, 39 KB, containing one source fact and one explicit assignment.

1. The completed result exposed `Summary`, `Transcript`, and `Everything` choices from the Copy control.
2. Captured Summary output contained the summary, key points, and action items but no transcript heading.
3. Captured Transcript output contained the transcript heading and expected speech but no summary heading.
4. Captured Everything output contained all four summary, key-point, action-item, and transcript sections.
5. The worker's final source-faithfulness prompt returned only the stated photosynthesis fact and chapter-review assignment; it did not pad the short lecture with external concepts.
6. Deterministic post-processing placed `Big takeaway` last even though the small model did not emit it itself.
7. The source Storage object was deleted. The browser signed out, its Auth session count reached zero, the disposable user and cascaded rows were deleted, and the browser closed.

**Result:** PASS.

## Mobile usability and Copy action sheet — PASS

**Environment:** local Next.js production-connected app, production deployment `dpl_4tGJ5KyeLzEtwXNc4rQnoMH4KGdo`, Chromium automation, production Supabase, Windows worker, and disposable immediate-session accounts.
**Viewports:** 320 x 568, 320 x 800, 360 x 800, 390 x 800/844, 430 x 800, plus a 1280 x 800 desktop regression check.

1. Landing, sign-up, dashboard, and completed-result documents reported `scrollWidth === innerWidth` at every tested phone width.
2. All visible links, buttons, fields, selects, and file-drop controls on the dashboard and result screen measured at least 44 by 44 CSS pixels at 320, 360, 390, and 430 widths.
3. At 320 x 568, the open Copy sheet measured 300 x 263 pixels with bounds `left=10`, `right=310`, `top=295`, and `bottom=558`; it remained entirely inside the viewport.
4. The sheet automatically focused Summary, closed through Escape and backdrop/close controls, trapped Tab focus, and restored focus to Copy.
5. Summary selection closed the sheet. Existing clipboard-content separation had already passed the production selective-copy test above.
6. At 1280 x 800, Copy remained an anchored 260-pixel desktop dropdown and stayed entirely within the viewport.
7. Automated axe-core WCAG 2 A/AA checks reported zero violations on the mobile dashboard, completed result, and open Copy sheet after correcting three low-contrast secondary text styles.
8. Next.js lint and production build passed after the final responsive changes.
9. The sample completed through the worker, remote audio was deleted, the browser signed out, the Auth session count reached zero, the disposable user and cascaded rows were removed, and zero test media remained.
10. The final public Vercel domain repeated the 320 x 568 dashboard/result measurements, opened the Copy sheet fully within the viewport, and passed the open-sheet WCAG 2 A/AA scan with zero detected violations.
11. The final Vercel deployment reached Ready; its authenticated production check produced no runtime warning, error, or fatal logs.

**Result:** PASS.

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
- [ ] Repeat the completed mobile usability review on one physical phone.

Do not promise processing time until real long-class benchmarks are recorded.

## Business-model documentation review — PASS

**Date:** 2026-08-24
**Scope:** `docs/BUSINESS-MODEL.md`; documentation-only change, so no application runtime test was required.

1. Reconciled the analysis with the deployed architecture, current computer specifications, and documented free-tier limits.
2. Checked Vercel, Supabase, Stripe, Otter, Notta, Fireflies, and faster-whisper claims against their official pricing, documentation, or repository pages linked in the document.
3. Recalculated the 48 kbps audio-size estimate, free-egress capacity, Stripe fee examples, break-even subscriber count, MRR, annualized revenue, and contribution table.
4. Labeled unmeasured capacity, electricity, acquisition, mature infrastructure, and growth figures as assumptions or scenarios rather than verified results.
5. Preserved the existing warning that processing-time promises require real 30- and 60-minute benchmarks.

**Result:** PASS.
