# Testing and Verification

## Local-AI formatted transcript email — PASS WITH DELIVERY CONFIRMATION PENDING

**Date:** 2026-09-16
**Scope:** most recent published HRM 391 transcript (`2026-09-14`), local Ollama `qwen3:4b`, and the authorized FluxPrompt Email Agent.

1. Confirmed the durable transcription queue was empty and the Windows worker remained Running before using local Ollama, so the experiment did not delay class processing.
2. Parsed 1,102 timestamped segments and 7,298 words from the published HRM transcript, then divided them into thirteen approximately six-minute windows.
3. For each window, `qwen3:4b` returned structured JSON containing a topic heading and paragraph-start indexes only. Deterministic reconstruction produced 13 sections and 81 paragraphs, with forced paragraph-size limits for readability.
4. Compared the complete ordered `timestamp + text` identity before and after formatting. The strings matched exactly and produced SHA-256 `a1365d3eb697af762e8abf40e62dca48b9ce6618dcb077252617c75eabbc90d4`; no segment was rewritten, omitted, duplicated, or reordered.
5. Generated a responsive 55 KB HTML email containing only the formatted transcript, a preservation/transcription warning, and the public original-note link. Recipient, subject, empty attachments, and configured API key presence were verified before sending.
6. The FluxPrompt send command exited 0 and returned a non-empty API response. The response echoed the submitted HTML instead of explicitly confirming delivery, so API submission is verified while inbox receipt remains owner-confirmed.

**Result:** PASS for local AI structure generation, exact transcript preservation, HTML creation, and FluxPrompt API submission. Physical inbox delivery and subjective formatting preference still require owner confirmation.

## Public course AI repository indexes — PASS

**Date:** 2026-09-15
**Environment:** four public `DrFunDip72` course repositories and their local clean worktrees.

1. Fast-forwarded all four local course worktrees to public `main`, including the newly exported STRAT September 8 and PHIL September 14 notes.
2. Added a root `AGENTS.md` titled `AI Repository Index — <course>` to HRM 391, PSE 390, STRAT 392, and PHIL 201.
3. Verified every index defines dynamic dated-note discovery, metadata/section semantics, transcript-first evidence priority, date-and-timestamp citation, cross-lecture synthesis, gap disclosure, transcription uncertainty, and safe maintenance rules. HRM uniquely identifies its Week 1 primer as supplemental.
4. `git diff --check` passed in every course repository before commit. Pushed commits were HRM `3b87aa8`, PSE `dca84cc`, STRAT `35f6d7c`, and PHIL `7832a8c`.
5. Anonymous raw GitHub readback returned HTTP 200 for all four indexes, with content lengths from 2,763 to 2,797 bytes. All four local worktrees match their pushed `main` branches.

**Result:** PASS. Any agent entering a course repository now has a repository-local, automatically discoverable reading index that stays accurate as dated lectures are added.

## Hybrid Drive discovery and missed recordings — PASS

**Date:** 2026-09-15
**Environment:** live Drive-for-desktop `URecorder`, read-only cloud Drive fallback, production Supabase, High local worker, and public STRAT/PHIL repositories.

1. The desktop view contained `strat 392 9-8.m4a` (69,190,299 bytes) but not the claimed PHIL September 14 recording. A read-only cloud listing of the owner’s actual `URecorder` remote found both STRAT and `Phil 9-14.m4a` (71,696,431 bytes).
2. Confirmed neither course/date had a prior Class Scribe job or `drive_ingestions` row. The connected ChatGPT Google Drive plugin belongs to `justin.m@enhanced.ai`, not the owner inbox, so it was not used as evidence for or access to `jmaximum72@gmail.com`.
3. Added hybrid listing merge/fallback behavior, standalone PHIL aliases, one-day-early schedule tolerance, matching weekly-audit coverage, and a parsed-lecture-date cutover guard. Python compilation and the combined 28-test suite pass.
4. A live corrected discovery preview resolved STRAT September 8 from the desktop source and PHIL September 14 from the cloud source with their exact expected class/date and byte counts.
5. Prepared and privately queued both High jobs. STRAT job `9732d1fd-4545-4ded-9e6d-5f5be4b23daf` and PHIL job `f5d509ae-ddac-4d17-8c8a-057adc107ccc` each completed on attempt 1.
6. STRAT produced 10,165 transcript words and 1,043 timestamped segments; PHIL produced 11,610 words and 1,256 segments. Both returned zero quality-gate issues and were marked exported with verified GitHub SHAs at their dated note paths.

**Result:** PASS. The previously missed recordings were recovered, quality-checked, and publicly published; future discovery now covers the observed source and filename failure modes.

## September 8 exact-path recovery — PASS

**Date:** 2026-09-14
**Environment:** production Supabase, live Drive-for-desktop `URecorder`, High local worker, and public HRM/PHIL repositories.

1. Confirmed `hrm 391 9-8.m4a` (71,245,768 bytes) and `Phil 201 - 9-8.m4a` (70,349,819 bytes) are visible in the live Drive folder and each has zero prior `drive_ingestions` rows.
2. Confirmed the older HRM High result is not a missing job: it completed with only 1,187 words across 73 minutes and fails the repetition gate. Its GitHub path remains absent.
3. Added an exact-path recovery command. Default parsing still rejects a class-day mismatch; its explicit backfill mode accepts the owner-approved September 8 date. Python compilation and all ten automation tests pass.
4. Prepared and privately queued fresh High jobs for both sources. HRM job `0110c354-04fe-4025-8731-b90e64325083` and PHIL job `009aa858-2fce-4be2-8f02-a23374f53d8a` each completed on attempt 1.
5. HRM produced 8,952 words and 1,073 segments; PHIL produced 10,710 words and 1,312 segments. Both passed the completeness, timestamp, and repetition gates, were exported to `notes/2026/2026-09-08.md`, and returned anonymous HTTP 200.

**Result:** PASS. Both recovered September 8 notes are publicly available with summary-first ordering; the old corrupt HRM result remains unpublished.

## Google Drive for desktop source cutover — PASS WITH LEGACY TASK CLEANUP PENDING

**Date:** 2026-09-14
**Environment:** Google Drive for desktop 130.0.2.0, production Supabase, `jmaximum72@gmail.com` streamed `URecorder`, public course repositories, and Windows Task Scheduler.

1. Confirmed two live `GoogleDriveFS` processes, the default `G:` Google Drive filesystem, `G:\My Drive\URecorder`, and 14 visible source files. Google Drive for desktop is registered to start with the owner session.
2. Confirmed the user did not explicitly select streaming, but Drive for desktop chose its default streamed virtual-drive layout. No mirroring change or bulk local copy was requested.
3. Added an explicit desktop source configuration, ten-minute minimum age, deterministic path identity, isolated hydration copy, and source size/modification stability checks. The rclone code remains a selectable rollback path but is no longer active.
4. Expanded parser coverage for the observed `pse 9-14.m4a` and `philo 201 <date>` variants. Nine automation tests pass, including stable desktop enumeration and all prior parsing/publishing behavior.
5. A real forced pass read the streamed folder, skipped the already-linked HRM recording through compatibility deduplication, hydrated the 67,419,642-byte PSE source, prepared and uploaded private parts, and queued exactly one High job.
6. The production worker completed that PSE job at High. A following pass passed the publishing gate and wrote `PSE-390/notes/2026/2026-09-14.md`; no second HRM job was created.
7. Registered `ClassScribeDriveDesktopAutomation` under the owner with interactive logon/hourly triggers. An immediate scheduled run reached `Ready` with `LastTaskResult=0`. The main worker remains pre-login SYSTEM.
8. Updated the administrator installer to remove the obsolete `ClassScribeDriveAutomation` SYSTEM task and retain the Thursday audit as SYSTEM. The UAC cleanup attempt was canceled, so the obsolete task remains registered; a launcher identity guard makes it exit 0 before touching `G:` or queueing work. Run the installer once as Administrator to complete housekeeping.
9. Python compilation and the combined 25-test worker/automation suite passed. The working desktop task also completed its next naturally scheduled run with result 0. Anonymous GitHub readback returned HTTP 200 for the 61,552-byte PSE note and confirmed Summary precedes Transcript.

**Result:** PASS for the active desktop path, actual large-file hydration, deduplication, High queue processing, GitHub publication, and owner-session scheduling. One guarded legacy SYSTEM task remains pending administrator removal; it exits successfully and does not block or duplicate the working importer.

## Google Drive to public GitHub automation — PASS WITH OAUTH MAINTENANCE REQUIRED

**Date:** 2026-09-14
**Environment:** production Supabase, `jmaximum72@gmail.com` Google Drive `URecorder`, four public `DrFunDip72` course repositories, and Windows Task Scheduler under `SYSTEM`.

1. Installed rclone 1.75.1, completed read-only Google OAuth, found and rooted the remote to the exact `URecorder` folder, and listed 13 audio files. Four existing names were safely parseable; the September 14 midnight cutover excluded the already-exported September 2 set while retaining one current file.
2. rclone's first default config command printed the new credential. The credential was immediately revoked through Google's revocation endpoint and deleted. A replacement OAuth flow used output suppression; only that replacement remains active. ACLs grant the owner, Administrators, and `SYSTEM` access to the ignored config.
3. The fine-grained GitHub token was entered through a local hidden prompt, validated as `DrFunDip72` against all four public repositories, stored without terminal/chat output, and ACL-restricted under ignored `.worker-secrets`.
4. Created five committed forward migrations. Each migration passed a production transaction-and-rollback syntax check before application. The final schema has the `drive_ingestions` ledger, worker-only begin/link/queue RPCs, worker Storage insert/update, worker result readback, owner indexes, and consolidated SELECT policies.
5. Eight automation unit tests pass for separator/case/month/date/part variants, ambiguity and schedule rejection, Drive/Postgres timestamp equality, repetition detection, malformed segment tolerance, summary-before-transcript rendering, expected weekly counts, and missed-day catch-up.
6. The first controlled import downloaded and prepared the current HRM file into eight private ten-minute parts. It exposed that the same lecture had already been submitted through the browser. The new duplicate was canceled before claim; all eight objects plus its batch/job/ingestion rows were removed. Production confirms zero duplicate rows and zero duplicate Storage objects.
7. Added cross-source matching before download. The next pass linked the Drive version to the existing owner's High job and a later idempotency pass created no duplicate.
8. The completed HRM result passed transcript/summary/timestamp/repetition checks and published to `HRM-391/notes/2026/2026-09-14.md`. GitHub API readback matched SHA-256; anonymous raw access returned HTTP 200; the 54,007-byte document has a Class Scribe UUID and orders Summary, Key Points, Action Items, then Transcript.
9. `ClassScribeDriveAutomation` and `ClassScribeGitHubAudit` registered under `SYSTEM`. The immediate unattended run ended `Ready` with `LastTaskResult=0`; its safe log shows Drive scan and export pass completion. The audit is scheduled Thursday at 8:00 AM.
10. A live no-email weekly audit successfully read all four repositories and reported the current partial Monday state: HRM 1/1, PSE 0/1, PHIL 0/1, and STRAT 0/0. This validates counting without sending a premature warning before Wednesday.
11. Anonymous Data API probes returned 404 for the worker RPC and 401 for direct ingestion-table reads. Post-change advisors report no new missing-index or multiple-policy finding. Remaining warnings are the documented guarded SECURITY DEFINER RPCs, intentional Boolean health RPC, unavailable Free-plan password protection, and expected unused-index information.
12. Python compilation, all eight automation tests, the existing 16-test worker suite, and `git diff --check` were run. The final production worker-health request returned HTTP 200 with `{"status":"online"}`, and public GitHub readback again returned the 54,007-byte note with Summary before Transcript. Secrets remain ignored and untracked.

**Result:** PASS for live Drive discovery, cross-source deduplication, queue linkage, automatic public export, GitHub verification, weekly audit logic, and unattended task execution. Near-term owner maintenance remains required because rclone reports that its shared Google OAuth client ID will be retired during 2026; replace it with a personal desktop client ID as documented before relying on this indefinitely.

## Client-facing workflow and progressive per-recording queue admission — PASS

**Date:** 2026-09-09
**Environment:** production Supabase, local Next.js 16.3.2 lint/build, and the live Windows worker queue.

1. Created and applied four forward migrations: `upload_status_enum`, `progressive_upload_queue`, `tighten_progressive_upload_rpc_grants`, and `allow_interrupted_upload_state`.
2. Production exposes non-claimable `uploading` jobs with nullable media metadata, plus authenticated-only `begin_upload_batch`, `queue_uploaded_recording`, and `fail_recording_upload` RPCs. Anonymous and service-role execution is revoked; each SECURITY DEFINER function uses an empty search path and verifies `auth.uid()` ownership.
3. A rollback-only authenticated production transaction created two upload placeholders, queued the first with a validated one-part manifest while the second remained `uploading`, marked the second as a safe upload failure, and rolled everything back. The two fixed test IDs were absent afterward.
4. The production worker queue remained uninterrupted at one `transcribing` and five `queued` jobs after the schema and function test. The task/process was not restarted.
5. The browser now creates the full batch boundary before transfer, processes files sequentially, calls the queue transition immediately after each individual recording uploads, isolates cleanup to a failed source, and continues to later files.
6. The landing page, dashboard, upload progress, job history, and result page were reviewed against the React client checklist. User-facing states are plain language, model identifiers and detected-language diagnostics are absent from normal pages, and Fast/Balanced/High remain visible as intentional choices.
7. `npm run lint`, optimized `npm run build`, and `git diff --check` passed after the final TSX/CSS changes.
8. Commit `f3288cc` was pushed to GitHub `main`. The first two direct deployment attempts failed before alias promotion because API-created source deployments did not inherit the public Supabase build settings; build logs identified the missing settings, and the existing production deployment remained live.
9. Deployment `dpl_CwHpe7SmsLx4YmNX5PozCU4vbXPC` supplied only the two browser-public Supabase settings through an uncommitted deployment-only `.env.production`, completed its Next.js build, reached Ready, and moved both production aliases.
10. The public landing page and `/api/worker-health` returned HTTP 200. The landing response contains the new per-recording-start copy; health returned exactly `{"status":"online"}` with `Cache-Control: no-store, max-age=0`. Deployment-scoped warning/error/fatal runtime logs were empty.
11. The preferred in-app preview controls were absent and the browser fallback reported no available browser, so no claim is made for an authenticated visual or interactive production test in this release.

**Result:** PASS for database behavior, queue isolation, build/type safety, production deployment, public copy, service health, and early runtime logs. Authenticated visual verification remains pending.

## Selectable Fast, Balanced, and High tiers — PASS

**Date:** 2026-09-09
**Environment:** production Vercel/Supabase, Next.js 16.3.2 build, Windows `SYSTEM` task, Intel i7-10700 CPU, faster-whisper CPU INT8, and cached `small`, `distil-large-v3`, and `medium.en` models.

1. Created and applied migration `20260909181020_transcription_tiers.sql`. Production exposes a non-null text column with default `fast`; the validated check accepts only `fast`, `balanced`, and `high`. All 35 historical jobs were backfilled/defaulted to Fast, and no queued or active job existed during rollout.
2. The unchanged two-argument `create_upload_batch` signature now reads and validates each file record's tier, defaults a missing legacy value to Fast, and preserves its authenticated-only execution grant. No RLS policy or browser write grant was broadened.
3. Worker `1.5.0` maps Fast to `small`/beam 1/automatic language/previous-text conditioning, Balanced to `distil-large-v3`/beam 5/English/no previous-text conditioning, and High to `medium.en`/beam 5/English/previous-text conditioning. Unit coverage rejects unsupported values including Turbo and confirms the Balanced transcribe call receives the exact options.
4. An actual worker-code smoke run transcribed the same 9.633-second local verification sample through all three profiles, switching models in one process: Fast returned 23 words in 6.781 seconds, Balanced returned 23 words in 15.328 seconds, and High returned 23 words in 11.985 seconds. These short timings include model load/switch overhead and are functional smoke evidence, not replacements for the ten-minute benchmark.
5. The pre-login launcher now sets `HF_HOME` to the owner's existing verified cache so the `SYSTEM` worker does not download duplicate models. The scheduled task was disabled only while the queue was confirmed idle, then re-enabled and started. Supabase reported worker `1.5.0` online and idle with no active job.
6. Python compilation and all 21 worker/comparison tests passed. `npm run lint`, TypeScript checking, optimized `npm run build`, and `git diff --check` passed.
7. Supabase security advisors reported only the intentionally documented guarded SECURITY DEFINER RPC warnings plus Free-plan leaked-password protection; performance advisors reported only the two pre-existing low-traffic unused indexes. No new tier-related advisory appeared.
8. Production deployment `dpl_9doRpu5BXFgXeg8XJqnqJ5utXQmq` reached Ready and moved `https://class-scribe-ruddy.vercel.app` to the selectable-tier release. The deployment contained the exact committed `web/` tree plus only the two browser-public Supabase build settings, so unrelated local Auth-page edits were not deployed.
9. A disposable immediate-session account verified the live selector at desktop width and at 390 x 844 CSS pixels. Fast was the default; Balanced and High were independently selectable; the radio group retained accessible names; and the mobile page reported `scrollWidth === innerWidth` with no horizontal overflow.
10. The same 415 KB verification recording was uploaded once through each live tier. The production queue completed all three sequentially and displayed the exact persisted mappings: Fast -> `small`, Balanced -> `distil-large-v3`, and High -> `medium.en`. The worker returned online/idle after the third job, proving queue continuity and model switching across separate jobs.
11. After completion, the disposable account had three batches, jobs, and results with zero Storage objects. Deleting that exact disposable Auth user cascade-removed all nine application rows; a follow-up query returned zero users, batches, jobs, results, and Storage objects. The current deployment had no runtime error cluster and no warning/error/fatal runtime logs during the test.

**Result:** PASS. Database persistence, defensive validation, exact model-option mapping, real production uploads, one-model memory switching, queue continuity, audio cleanup, responsive live UI, deployment health, and disposable-data cleanup all passed.

## Next-generation local transcription benchmark — PASS WITH FINDINGS

**Date:** 2026-09-09
**Environment:** Intel Core i7-10700 (8 cores/16 threads), 15.7 GB RAM, local Python 3.12 worker environment, faster-whisper CPU INT8, and cached `medium.en`, `distil-large-v3`, and `turbo` models.

1. Added a `next-gen` comparison suite containing current High (`medium.en`), `distil-large-v3`, and `turbo`, all at beam 5 and fixed English. Distil uses `condition_on_previous_text=False`; the other two retain conditioning.
2. Added automatic timestamp-overrun and post-audio word metrics so invented trailing speech is visible in future reports. Python compilation and all 19 worker/comparison tests passed.
3. Reused the same private 600.014-second PHIL 201 excerpt from 29:30-39:30. The scheduled production worker was disabled only after confirming an idle queue, and the source and all outputs remained under ignored `.transcriber-benchmarks/`.
4. The first sequential run completed all three candidates and populated the two new model caches. The cached repeat is the comparable performance run: `medium.en` took 554.953 seconds (RTF 0.9249), Distil took 204.844 seconds (RTF 0.3414), and Turbo took 331.250 seconds (RTF 0.5521).
5. Distil was 63.09% faster than current High; current High took 2.709 times as long. Turbo was 40.31% faster than current High, while Distil was 38.16% faster than Turbo. Linear transcription-only projections for the complete 61:33 source are 56:56, 21:01, and 33:59 respectively.
6. Pairwise normalized-word agreement was 94.0% for current High versus Distil, 94.5% for current High versus Turbo, and 94.1% for Distil versus Turbo. These values measure agreement, not correctness.
7. The same bounded 107-word published-text reference produced 4 edits for current High (3.74% WER), 7 for Distil (6.54% WER), and 3 for Turbo (2.80% WER). This is an exact score for those two quote regions only, not the ten-minute excerpt or whole lecture, and it has not been replaced by a full human-produced transcript.
8. Turbo nevertheless failed the hallucination check: after the other models ended at `Sometimes shock value`, it generated 37 words in 11 segments beginning after the 600.014-second audio boundary and extended timestamps to 626.93 seconds. Those segments shared an extremely low average log probability near -2.868; the model-wide average was -0.45421 versus -0.16654 for current High and -0.16031 for Distil.
9. Distil made more proper-noun and exact-quotation substitutions than current High but did not invent post-audio speech. Current High retained the strongest conservative exactness of the non-hallucinating choices. Turbo's slightly better bounded quote score does not outweigh its fabricated tail under this configuration.
10. Model cache footprints were approximately 1.43 GB for `medium.en`, 1.41 GB for Distil, and 1.51 GB for Turbo. The production worker was then re-enabled and started; Task Scheduler returned Running and Supabase published a fresh idle heartbeat from worker `1.4.2`.
11. Final `npm run lint`, `npm run build`, Python compilation, all 19 worker/comparison tests, `git diff --check`, and ignored-secret checks passed. The public health endpoint returned HTTP 200 with exactly `{"status":"online"}` and `Cache-Control: no-store, max-age=0`; the scheduled worker remained enabled and Running.

**Result:** the benchmark machinery and all candidates ran successfully. Do not promote Turbo as configured. Distil is the best speed/quality candidate for routine study notes, while `medium.en` remains the safer choice when exact wording matters. Production `small` remains unchanged pending an explicit product-tier decision.

## Summary sentence boundary and three-model comparison — PASS

**Date:** 2026-09-09
**Environment:** local Python 3.12 worker environment, installed FFmpeg, faster-whisper CPU INT8, and cached `small`, `small.en`, and `medium.en` models.

1. Added a regression test using the HRM-shaped sentence `The course, taught by Dr. Peter Dennis, focuses on organizational management. Students apply the model.` The sentence helper returned the complete first sentence, and deterministic study-guide post-processing preserved the embedded title instead of truncating at `Dr.`
2. Python compilation passed for `worker.py`, `compare_transcribers.py`, `test_worker_helpers.py`, and `test_compare_transcribers.py`. All 17 helper/comparison tests passed.
3. `compare_transcribers.py verification-sample.wav` decoded the 9.63-second source once and ran all three configurations sequentially without Supabase access. Each configuration wrote a local ignored transcript and segment JSON, plus combined metrics and comparison Markdown.
4. The first run completed all models but included first-time download/cache cost: 6.750 seconds for `small`/beam 1, 43.125 seconds for `small.en`/beam 5, and 121.672 seconds for `medium.en`/beam 5.
5. The cached repeat took 5.828 seconds, 3.766 seconds, and 11.516 seconds respectively. All outputs had 23 words. The two English models matched exactly; the baseline used `learn` instead of `learned` and different capitalization, producing 95.7% word-sequence agreement.
6. Pairwise similarity was treated only as model agreement. The 9.63-second synthetic clip is too clean and short to rank lecture accuracy, especially for names, technical vocabulary, distant speech, prayers, and cross-talk.
7. `.transcriber-benchmarks/`, `.worker-state/`, `.worker-secrets/`, and `.env.worker.local` are ignored and untracked. No source audio or generated comparison artifact was committed.
8. A production query found exactly one stored result with the known `Dr.` truncation. An exact-match update repaired only job `671723a1-16e5-497e-b53d-223428329112`; its returned final point contains the complete first sentence. The matching public HRM note was updated in commit `dcc94c6c7f23be497a2d9b1e607e6e26d72344ab`, and a remote read returned the corrected line.
9. Production contained 35 completed jobs and no queued or active status before restart. The `AudioTranscriberWorker` scheduled task was restarted, returned to Running under `SYSTEM`, and Supabase published an idle heartbeat from worker `1.4.2`.
10. The owner's ZIP contained the four September 2 source recordings. Only the 59,730,190-byte, 3,693.296-second PHIL 201 source was extracted into ignored local benchmark storage. A 600.014-second stream-copy excerpt from 29:30 through 39:30 targeted the difficult Aristotle/agency passage; neither source was uploaded.
11. On that excerpt, production `small`/beam 1 produced 1,729 words in 97.235 seconds (RTF 0.1621), `small.en`/beam 5 produced 1,681 words in 184.532 seconds (RTF 0.3075), and `medium.en`/beam 5 produced 1,712 words in 536.625 seconds (RTF 0.8944). Pairwise agreement ranged from 90.6% to 92.3%.
12. Textual review against lecture context and the displayed Aristotle *On the Soul*, Book II, Chapter 5 wording showed `medium.en` correctly recovered multiple phrases both small candidates missed, including `to be acted upon`, `extinction`, `Latter-day Saint`, `fixing the car`, `logical deduction`, `Taylorsville Temple`, and `grade eight`. It still made errors such as `primacy` for `premises`; this is not a human-produced word-error-rate score.
13. `small.en`/beam 5 took 1.9 times the baseline time without a consistent quality improvement. `medium.en` was the clear text-quality winner but took 5.5 times the baseline transcription time. Linear projection for the full 61:33 recording is approximately 10:00, 18:56, and 55:03 transcription-only; the historical baseline job took 19.9 minutes end to end after summarization.
14. The scheduled production worker was disabled/stopped only after confirming an empty queue, then re-enabled immediately after the comparison. Task Scheduler returned Running and Supabase published a fresh idle heartbeat from worker `1.4.2`.
15. The stored production transcript was not treated as truth. For exact accuracy scoring, 46 spoken words from the displayed Aristotle passage and 61 spoken words from 2 Nephi 2:27 were aligned with their published source text after excluding words the professor skipped and all interleaved commentary.
16. Across those 107 reference words, Original/Fast had 10 substitutions and 9.35% WER; Medium had 9 substitutions, 4 deletions, 4 insertions, and 15.89% WER; High had 2 substitutions, 1 deletion, 1 insertion, and 3.74% WER. High therefore reduced reference-word errors by 76.47% versus Medium and 60.00% versus Original/Fast. This bounded score must not be represented as whole-lecture WER.
17. High took 536.625 seconds versus Medium's 184.532 seconds: 2.908 times as long and 352.093 additional seconds for the ten-minute excerpt. The five-times figure applies to High versus Original/Fast (5.519 times), not High versus Medium. Full-source linear projections are 18:56 for Medium and 55:03 for High, transcription-only.
18. A full-excerpt normalized-word Levenshtein comparison against the 1,729-word stored original found 208 minimum edits for Medium (12.03%) and 146 for High (8.44%). High is 62 edits/29.81% closer to the original than Medium. This is reproducible agreement data, not accuracy, because the original is itself the error-bearing production-model output.

**Result:** the summary repair and all three transcription paths pass. Keep `small`/beam 1 as the fast default, reject `small.en`/beam 5 as an upgrade candidate for this hardware, and consider `medium.en` only as an explicit High accuracy option because its material quality gain carries a large queue-time cost.

## Oversized audio, multipart queue, and FFmpeg decode — PASS

**Date:** 2026-09-02
**Environment:** local Next.js development app, Chromium automation, production Supabase, Windows `SYSTEM` task, local FFmpeg/Ollama, and worker `1.4.1`.

1. Applied production migrations `multipart_recordings` and `optimize_recording_parts_policies`. A rolled-back authenticated transaction created one logical 70,000,000-byte job from ordered 40 MB and 30 MB part metadata, then confirmed two manifest rows with indexes 0 and 1.
2. Browser conversion used the real Mediabunny/AAC path and forced the 9.63-second verification sample across three-second boundaries. It yielded four valid `audio/mp4` files in order, proving one `Input` can drive repeated trimmed conversions and that the generator releases control after each part. Chromium reported no page or console error.
3. An authenticated TUS integration uploaded a 7,340,032-byte object through the direct Supabase resumable endpoint using a 6 MB chunk size, then listed exactly one private object and removed it. Both disposable TUS users were deleted and their prefixes contained zero remaining objects.
4. `faster-whisper` model initialization initially exposed a Windows Smart App Control block on PyAV's unsigned `frame.pyd` after the scheduled worker restarted. Worker 1.4.1 now decodes through the installed FFmpeg executable and passes a mono 16 kHz float32 NumPy array to the unchanged `small` CPU/INT8 model. A local 9.63-second MP3 decoded to 154,121 samples and transcribed into two segments in English.
5. Restarted `AudioTranscriberWorker` while the queue was idle. The task returned to Running under `SYSTEM`, and Supabase published an idle heartbeat from worker `1.4.1`.
6. A disposable production account uploaded the same verification recording as two private objects and created one logical multipart job. The worker claimed it once, transcribed the parts sequentially, offset the timestamps, and completed on attempt 1 with one 19.265-second result, 289 transcript characters, four segments, and a non-empty summary.
7. The worker removed both remote objects after result commit; listing the job prefix returned zero objects. Both disposable accounts from the failed PyAV diagnostic and successful regression were cascade-deleted after their sessions were signed out, leaving no QA account or media behind.
8. Final `npm run lint`, `npm run build`, Python compilation, all 13 worker helper tests, and `git diff --check` passed.
9. Supabase advisors reported no new multipart finding. Security output contains only the documented guarded SECURITY DEFINER RPC warnings and unavailable Free-plan leaked-password warning; performance output contains only the two pre-existing low-traffic unused-index notices.
10. Production deployment `dpl_GDdXPdtLqAu245izFSYrH4LW82v9` reached Ready and moved both public aliases. The preceding build of the same multipart implementation passed the live sign-up/dashboard check: it accepted a synthetic 51.0 MB M4A and labeled it `compresses locally` instead of showing the former limit error. Submission was intentionally not started, so no invalid audio entered the queue. The final deployment additionally exposes the updated large-recording/privacy copy on the public landing page.
11. The deployed dashboard reported worker online with no horizontal overflow at the 1264-pixel verification viewport. `/login` and `/api/worker-health` returned HTTP 200; health returned exactly `{"status":"online"}` with `Cache-Control: no-store, max-age=0`. Vercel reported no current-deployment runtime error cluster and no warning/error/fatal runtime logs.
12. The disposable live account signed out and was cascade-deleted. The synthetic local source was removed, and no Storage object or queue job was created.

**Result:** PASS. The 50 MB ceiling now applies per private Storage object rather than per source recording, and multipart processing still produces one saved result.

## Persistent copied, Done, and Archive workflow — PASS

**Date:** 2026-08-28
**Environment:** local Next.js development app, production Supabase, production Vercel deployment `dpl_3mV6YVvTVyYRCkjRqy68FyUCpQMs`, Chromium automation, and a disposable immediate-session account with one synthetic 12-recording completed batch.

1. Applied production migration `recording_user_states`. Generated project types matched the committed table shape, and the applied migration version matches the repository filename.
2. An authenticated-owner simulation successfully upserted and selected only its own state row inside a rolled-back transaction. A simulated second account attempting to attach state to another user's job was rejected by RLS with PostgreSQL `42501`.
3. Twelve completed synthetic recordings initially appeared as `To do 12`, `Done 0`, `Archived 0`, with batch progress `0 of 12 done`; historical results therefore require no inferred or destructive backfill.
4. Copying Summary wrote the clipboard first, persisted `summary_copied_at`, rendered a saved checkmark after reopening the Copy menu, and displayed `Summary copied` on the dashboard. Summary, Transcript, and Everything remain independently tracked; Everything is interpreted as coverage of both sections without auto-marking Done.
5. Dashboard and result actions exercised Mark done, Mark not done/Undo, Archive, Restore, and per-batch `Archive done`. Filters and counts changed correctly, and batch progress reached `2 of 12 done` while archived results remained retrievable.
6. The first 320 x 568 dashboard pass exposed a 49-pixel min-content overflow in the new grid child. Adding `min-width: 0` to the dashboard main column reduced `body.scrollWidth` to exactly 320. The production dashboard and open result Copy sheet then had no horizontal overflow, no visible control smaller than 44 by 44 CSS pixels, and the 300-pixel sheet remained inside the viewport.
7. Axe-core WCAG 2 A/AA reported zero violations on the open production Copy sheet. Browser page-error collection was empty, and the saved Summary check persisted from local testing to the public deployment.
8. Final `npm run lint`, `npm run build`, and all 13 worker helper tests passed. `git diff --check` passed after normalizing the new migration ending.
9. Supabase advisors reported no new recording-state security or performance issue. Existing intentional guarded SECURITY DEFINER warnings, unavailable Free-plan leaked-password protection, and low-traffic unused-index notices remain documented.
10. The first file-based deployment candidate built successfully but lacked the two public Supabase build variables and returned a middleware 500. Runtime logs identified the exact cause; it was immediately replaced by `dpl_3mV6YVvTVyYRCkjRqy68FyUCpQMs`, which reached Ready on the public alias using only the browser-public Supabase URL and publishable key. The corrected deployment served the authenticated workflow and produced no warning/error/fatal runtime logs during the final check.
11. The public site and Boolean worker-health endpoint both returned HTTP 200, with `{"status":"online"}` from the health route. The disposable Auth user and all 12 batches/jobs/results plus two state rows were cascade-deleted, and zero test Storage objects remained.

**Result:** PASS.

## Ollama inference repair and guarded retry — PASS; RETRIES RUNNING

**Date:** 2026-09-09
**Scope:** local Ollama runtime, `SYSTEM` launcher readiness, and the three production jobs whose summary stage failed with Ollama HTTP 500.

1. Reproduced the failure with a minimal local generation call: Ollama reported that its `llama-server` binary was missing while `/api/tags` still returned successfully.
2. Downloaded the official Ollama 0.33.3 installer identified by WinGet. Its SHA-256 exactly matched the package manifest, Windows Authenticode reported `Valid`, and the signer was Ollama Inc.
3. Used the new ignored maintenance marker to let the `SYSTEM` task stop its own detached Ollama process, then completed the repair installation.
4. Confirmed Ollama 0.33.3, `lib\ollama\llama-server.exe`, localhost port 11434, and the pre-login worker task were present/running.
5. Re-ran the exact structured `qwen3:4b` schema request that had failed; it returned a completed response with summary, key points, and action-items fields.
6. Added a launcher gate requiring both the runner file and `/api/tags`; PowerShell parsing reported zero errors.
7. Ran all 16 worker helper tests; all passed.
8. Selected only the three failed High-tier job UUIDs, required `HTTPStatusError`, fewer than three prior attempts, and no existing result, then returned them to `queued` without resetting attempt counts.
9. Confirmed the PSE 390 retry was claimed with a live lease and reached `Transcribing audio locally` on attempt 3; the STRAT 392 and PHIL 201 retries remained queued behind it.

**Result:** PASS for runtime repair, failure reproduction, summary generation, guarded requeue, and first-job claim. Final transcription/result/source-cleanup verification remains pending because these High-tier recordings are long and process sequentially.

## Private OpenWhispr restart recovery — PASS

**Date:** 2026-09-09
**Environment:** Docker Desktop 29.7.2, WSL 2, Tailscale, existing `openwhispr-speaches` container, and Windows Task Scheduler.

1. Confirmed the failed endpoint had no port-8000 listener while Tailscale remained online with `100.79.197.76` assigned to this computer.
2. Confirmed Docker Desktop's service and `docker-desktop` WSL distribution were stopped and Docker CLI could not reach the engine.
3. Started Docker Desktop. Its existing container resumed without recreation and reported `running` with restart policy `unless-stopped`.
4. Requested `http://100.79.197.76:8000/v1/models`; it returned HTTP 200 and listed `Systran/faster-whisper-base.en` plus the existing Distil model.
5. Verified the listener binds only to `100.79.197.76:8000`; localhost is intentionally not bound.
6. Parsed both recovery PowerShell scripts with zero syntax errors and ran the supervisor directly with exit code 0.
7. Installed `OpenWhisprServerSupervisor` for owner logon plus five-minute repetition. The immediate task run and the next naturally scheduled run both completed with `0x00000000`; the container and required model endpoint remained healthy.
8. Posted the repository's non-private 9.6-second verification MP3 to `/v1/audio/transcriptions` with `Systran/faster-whisper-base.en`; the API returned a non-empty 23-word transcript.
9. Did not interrupt the active Class Scribe High-tier transcription and did not perform a full Windows reboot.

**Result:** PASS for live restoration, healthy-state checks, and scheduled execution. A future physical reboot should confirm owner-logon recovery; pre-login Docker Desktop availability is intentionally not claimed.

## External worker-outage monitor — PARTIALLY VERIFIED, SCHEDULER GAP

**Date:** 2026-08-28 and 2026-08-30

1. Applied production migrations `public_worker_health_check` and `limit_worker_health_rpc_permissions`.
2. Verified `worker_is_online()` returned `true`, `anon` could execute only the Boolean RPC, `authenticated` had no redundant grant, and `anon` still could not select `worker_heartbeats`.
3. Supabase security advisors reported the expected intentionally public SECURITY DEFINER warning; performance advisors reported only existing/new-table unused-index informational notices.
4. `npm run lint` and `npm run build` passed. The Next.js build included dynamic route `/api/worker-health`.
5. A local production server connected to production Supabase returned HTTP 200, `Cache-Control: no-store, max-age=0`, and exactly `{"status":"online"}`.
6. Prettier parsed the GitHub workflow successfully and `git diff --check` passed.
7. The workflow uses a standard public-repository runner, no artifacts/caches, three health attempts, one deduplicated assigned outage issue, automatic recovery closure, and a monthly non-default-branch keepalive.
8. The production Vercel route returned HTTP 200, `Cache-Control: no-store, max-age=0`, and exactly `{"status":"online"}` on 2026-08-30.
9. GitHub reported the workflow active. Eight scheduled runs completed successfully, and the initial manual negative-path run opened issue `#1`, labeled it `worker-offline`, and assigned it to the repository owner. The next successful scheduled run closed the issue with the recovery comment.
10. The scheduled runs did not occur near the configured five-minute interval. Observed gaps reached approximately 6 hours 37 minutes, consistent with GitHub's documented best-effort scheduled-event behavior. Receipt of the issue-assignment email remains owner-operated and unverified.
11. Ignored `.env.worker.local`, `.worker-secrets`, and `web/.env.local` files remain untracked. Unrelated in-progress Auth page changes were left untouched.

**Result:** health detection, production deployment, issue creation/deduplication, assignment, and recovery closure pass. Do not call the notification goal complete: the free GitHub schedule is materially less frequent than configured, owner email receipt is unverified, and a planned worker outage/recovery drill remains.

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

## Unattended worker startup and layered recovery — PASS

**Date:** 2026-08-28
**Environment:** production Supabase queue, Windows Task Scheduler, local Ollama, and worker `1.3.1`.

1. The initial health check found Vercel Ready and Supabase Active Healthy, but the local worker heartbeat was about 58 hours stale. Ten jobs were queued, none were active, and the existing interactive task's final result was `0xC000013A` after only three configured restarts.
2. Installed the task as the Windows `SYSTEM` service account with startup, logon, and five-minute repeating triggers. Exported task XML confirmed a five-minute interval, 3,650-day repetition duration, 999 one-minute restart attempts, `StartWhenAvailable`, no execution time limit, and `IgnoreNew` overlap handling.
3. The new persistent launcher restarted the old interactive worker, which resumed the durable queue. A second launcher invocation exited 0 in 0.45 seconds because the cross-process lock was already held.
4. Waited for an observed zero-active-job boundary before terminating the old interactive process tree. No active transcription was interrupted. The next recovery trigger started the task under `SYSTEM`.
5. Supabase reported a fresh `processing` heartbeat from worker `1.3.1` 17 seconds before verification. The queue had resumed with five queued, one active, 15 completed, and zero failed jobs at that observation.
6. A manual interactive `worker.py --once` invocation while the `SYSTEM` worker was active exited 0 in 1.53 seconds with the expected duplicate-worker message, verifying the global cross-session mutex.
7. Both PowerShell scripts parsed without errors. `worker.py` and `test_worker_helpers.py` compiled, and all 13 helper tests passed, including the access-denied/global-mutex duplicate path.
8. `.worker-state`, `.worker-secrets`, and `.env.worker.local` are ignored; no secret path was added to Git.

**Result:** PASS. A physical Windows reboot was intentionally not forced during this session; the installed boot trigger should be confirmed on the next planned restart.

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

- One-to-20 logical-recording selection is enforced; source audio/video above 50 MB is accepted for local preparation.
- The browser enforces 50 MB per uploaded object, 90-minute prepared parts, and at most 32 parts per source.
- Database RPC independently enforces 1-20 logical recordings, 1-32 parts, 50 MB per object, 1 GB per logical recording, supported MIME/extension pairs, and exact owner/job/part paths.
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

## High-tier GitHub course refresh — PASS WITH ONE CORRUPT RESULT WITHHELD

**Date:** 2026-09-11

1. Queried only completed course jobs owned by `jmaximum72@gmail.com` and matched the four September 2 Fast/High pairs by exact course filename and duration.
2. Replaced the HRM 391, PSE 390, STRAT 392, and PHIL 201 September 2 notes with the corresponding High `medium.en` results. Added PSE 390 September 8 as a new note.
3. Verified each of the five remote GitHub blob IDs exactly matches its local staged blob, embeds the expected High-result UUID, declares `transcription_tier: "high"`, and places Summary before Transcript.
4. Verified all four repositories remain public, each local branch equals `origin/main`, and all four refresh worktrees are clean.
5. Verified the six relevant High database jobs have result rows and zero remaining Storage objects.
6. Withheld HRM 391 September 8: its 73-minute result contains 1,187 words, 198 segments, and 182 exact repetitions of one sentence spread through most of the audio duration. Because source cleanup already occurred, a fresh owner upload is required.
7. Compared normalized full transcripts. Sequence-match ratios were HRM 88.44%, PSE 92.89%, STRAT 83.70%, and PHIL 91.47%; word-level diff edits per 100 old words were 17.13, 11.05, 24.36, and 11.93 respectively. These are difference/agreement measurements, not WER.
8. Reused the existing 107-word published PHIL reference for the only ground-truth accuracy statement: High WER was 3.74% versus Fast's 9.35%, a 60% error reduction on that bounded passage. Manual terminology checks also found High recovered `extinction`, `Latter-day Saint`, and `logical deduction`, while HRM still worsened the instructor surname.

**Result:** PASS for five valid publications and remote verification. HRM September 8 correctly remains unpublished pending re-upload.

## GitHub course export and public access — PASS

**Date:** 2026-09-09
**Scope:** one-time owner export from production Supabase to private GitHub course repositories.

1. Queried recordings created from 2026-09-02 onward and confirmed the four September 2 course filenames belonged to `jmaximum72@gmail.com`; another account's recordings were excluded.
2. Confirmed `hrm_391_9-2.m4a`, `pse_390_9-2.m4a`, `strat_392_-_9-2.m4a`, and `philo_201_9-2.m4a` were completed and had result rows.
3. Created `DrFunDip72/HRM-391`, `DrFunDip72/PSE-390`, `DrFunDip72/STRAT-392`, and `DrFunDip72/PHIL-201`, then changed all four to public visibility at the owner's explicit direction.
4. Wrote each result to `notes/2026/2026-09-02.md` with its Class Scribe job UUID, dated metadata, generated study guide, and complete transcript.
5. Retrieved every remote file through the authenticated GitHub API, decoded its content, and compared its SHA-256 digest with the staged export. All four comparisons returned `exact_match=True`.
6. Verified the latest commits: HRM `af79a32c733acc9680a39854dd7014ac14c1b92a`, PSE `ef2009d3ba0941a095bef6d9ba2e9be77e0ec5ba`, STRAT `5bbc3422cb134aebcf1e06f7c3638c0b6dabaec4`, and PHIL `bc30712904073522dcf6e0070d1158c8c97c7dac`.
7. Verified all four repositories report `PUBLIC`, and anonymous raw-file requests returned HTTP 200 for every exported path.
8. Verified each document's heading order is Summary, Key Points, Action Items, then Transcript, with all sections in the same Markdown file.
9. Did not export `tyler_eager.m4a`; the owner explicitly directed that it go nowhere.

**Result:** PASS for the four September 2 course recordings. `tyler_eager.m4a` remains intentionally unexported.

## Real transcript text-only quality audit — PASS WITH LIMITATIONS

**Date:** 2026-09-09
**Scope:** the four owner recordings exported for September 2. Source audio was already deleted by the normal retention policy, so this audit evaluates text coherence and obvious contextual substitutions, not measured word-error rate.

| Course | Audio | Words | Processing | Text-only finding |
|---|---:|---:|---:|---|
| HRM 391 | 73.5 min | 11,105 | 22.8 min | Main organization-management lecture is recoverable; opening, student discussion, repeated phrases, names, and the closing prayer contain obvious errors. |
| PSE 390 | 60.3 min | 7,413 | 19.2 min | Ethics concepts and assignments are recoverable; `Brigham Young University`, `BYU`, `adjunct`, `Wealth of Nations`, names, and the final prayer are misrecognized in places. |
| STRAT 392 | 71.1 min | 9,211 | 20.1 min | Amazon and competitive-advantage sections are coherent; the opening prayer, soft classroom interaction, and ending contain substantial garbling. |
| PHIL 201 | 61.6 min | 9,219 | 19.9 min | Course structure and broad Aristotle discussion are usable; Greek phrases, philosophical terminology, examples, and cross-talk are frequently unreliable. |

The stored segment records contain timestamps and text but omit confidence fields, so low-confidence passages cannot currently be highlighted after processing. The worker uses `faster-whisper/small-cpu-int8` with `beam_size=1`, VAD, and previous-text conditioning. The summaries generally preserve the main topics but can repeat transcription errors. The HRM fallback `Big takeaway` ends after `Dr.` because its first-sentence extraction treats the title abbreviation as a sentence boundary.

**Result:** Suitable as a searchable study aid and summary source; unsuitable for exact quotation, proper-name verification, or a verbatim academic record without listening back to the original audio.

## Business-model documentation review — PASS

**Date:** 2026-08-24
**Scope:** `docs/BUSINESS-MODEL.md`; documentation-only change, so no application runtime test was required.

1. Reconciled the analysis with the deployed architecture, current computer specifications, and documented free-tier limits.
2. Checked Vercel, Supabase, Stripe, Otter, Notta, Fireflies, and faster-whisper claims against their official pricing, documentation, or repository pages linked in the document.
3. Recalculated the 48 kbps audio-size estimate, free-egress capacity, Stripe fee examples, break-even subscriber count, MRR, annualized revenue, and contribution table.
4. Labeled unmeasured capacity, electricity, acquisition, mature infrastructure, and growth figures as assumptions or scenarios rather than verified results.
5. Preserved the existing warning that processing-time promises require real 30- and 60-minute benchmarks.

**Result:** PASS.
