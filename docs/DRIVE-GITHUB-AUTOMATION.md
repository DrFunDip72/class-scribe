# Google Drive to GitHub Automation

## Objective

The owner records a Monday/Wednesday class, saves the audio in the Google Drive folder `URecorder` with a recognizable class and lecture date, and takes no further action. The Windows computer imports it, reuses the existing private Class Scribe queue, and publishes one summary-first Markdown document to the matching public course repository after transcription passes an integrity check.

## Live flow

```text
URecorder in jmaximum72@gmail.com
  -> hourly Monday/Wednesday rclone read
  -> native FFmpeg mono 16 kHz / 48 kbps M4A / ten-minute parts
  -> private Supabase Storage + drive_ingestions ledger
  -> existing FIFO Windows worker, High tier by default
  -> repetition/timestamp/completeness gate
  -> DrFunDip72/<course>/notes/<year>/<YYYY-MM-DD[-part-N]>.md
```

The hourly task still runs on other days so completed work can reach GitHub, but it does not contact Drive. On Tuesday or Thursday it performs one catch-up Drive scan only when the preceding class day had no successful scan. The original Drive recording is never moved or deleted.

## Filename recognition

The parser is case-insensitive, ignores ordinary punctuation differences, and accepts extra words. Supported examples include:

```text
HRM-391_2026-09-14.mp3
hrm 391 lecture 9-14-26.m4a
PSE390 September 14 2026.mp3
PHIL_201 class 9.14.mp3
strategy 392 sept-16-2026 pt2.mp3
```

Accepted course aliases include `HRM 391`, `PSE 390`, `STRAT 392`, `STRATEGY 392`, `PHIL 201`, and `PHILOSOPHY 201`, with spaces, `_`, `-`, or punctuation between components. Dates may be ISO, US numeric, abbreviated/full month names, two-digit years, or month/day without a year. A missing year is inferred from Drive modification time. Explicit `part` or `pt` suffixes are supported.

The parser refuses an ambiguous/missing class or date and refuses dates outside the configured schedule: HRM/PSE/PHIL on Monday or Wednesday, STRAT on Wednesday. It emails one generic attention notice instead of guessing or publishing to a public repository.

## Duplicate handling and cutover

- The durable identity is Drive file ID plus modification timestamp.
- Repeated hourly scans are idempotent.
- Before downloading, the importer compares the parsed class/date/part against eligible existing owner jobs. A single matching browser-created job is linked instead of retranscribed; multiple matches require review.
- The initial cutover is midnight Mountain Time on 2026-09-14. Older Drive files are ignored so existing September 2 notes are not duplicated.
- A file changed after import is a new Drive version, but GitHub refuses to overwrite a different Class Scribe UUID at an occupied path.

## Preparation and queue handoff

`class_scribe_automation.py` downloads through rclone with retries and a partial suffix. Native FFmpeg discards video, creates mono 16 kHz 48 kbps AAC/M4A, and segments at ten minutes. Ten-minute output is normally well below 6 MB, allowing individual retry through standard private Storage upload while preserving the existing 50 MB/object and 32-part database limits.

The importer signs in as the existing dedicated worker Auth user. Worker-only RPCs create/link the owner job and validate the complete M4A manifest. Normal users cannot call those paths successfully because every RPC checks protected `app_metadata.role=worker`; anonymous access is revoked. Audio is deleted by the existing worker after result commit. The original remains in Drive.

## Publishing gate and document format

Automatic publication requires a nontrivial summary/transcript, timestamped segments, plausible final timestamps, and no dominant repeated segment. Failures become `needs_review` and remain out of public GitHub.

Documents contain YAML source metadata followed by:

1. Summary
2. Key Points
3. Action Items
4. Complete timestamped Transcript

Repository mapping:

| Course | Repository | Weekly expectation |
|---|---|---:|
| HRM-391 | `DrFunDip72/HRM-391` | Monday + Wednesday |
| PSE-390 | `DrFunDip72/PSE-390` | Monday + Wednesday |
| PHIL-201 | `DrFunDip72/PHIL-201` | Monday + Wednesday |
| STRAT-392 | `DrFunDip72/STRAT-392` | Wednesday |

The exporter verifies GitHub readback by SHA-256 before marking an ingestion `exported`.

## Scheduled tasks

- `ClassScribeDriveAutomation` — `SYSTEM`, startup plus hourly repetition. It imports only on class days/catch-up conditions and checks for completed exports every hour.
- `ClassScribeGitHubAudit` — `SYSTEM`, Thursday at 8:00 AM Mountain Time. It checks the current week for missing, unexpected, or duplicate dated notes and sends a generic HTML email report.

Install/repair from Administrator PowerShell:

```powershell
.\install-drive-automation-tasks.ps1 -StartAndVerify
```

Operator commands:

```powershell
.\.venv-worker\Scripts\python.exe .\class_scribe_automation.py parse "HRM 391 9-14.mp3"
.\.venv-worker\Scripts\python.exe .\class_scribe_automation.py run --force-import
.\.venv-worker\Scripts\python.exe .\class_scribe_automation.py audit --dry-run
Get-Content .\.worker-state\class-scribe-automation.log -Tail 50
```

## Credentials

- `.worker-secrets/rclone.conf` — Google Drive read-only OAuth token, rooted to `URecorder`.
- `.worker-secrets/github-course-export.token` — fine-grained GitHub token with Contents read/write on only the four course repositories.
- `.env.worker.local` — existing worker/Supabase and FluxPrompt configuration.

All are ignored. Never copy their values into logs, chat, GitHub, Vercel, or Supabase.

The currently authorized rclone connection uses rclone's shared Google OAuth client ID. rclone reports that this shared ID is being retired during 2026. The integration works now, but dependable long-term operation requires creating a personal Google OAuth desktop client and updating the rclone remote. Follow <https://rclone.org/drive/#making-your-own-client-id>, then reauthorize and rerun the task verification. Treat this as required near-term maintenance.

## Recovery

- If the computer or network is down, Drive retains the source and the next eligible/catch-up scan retries.
- If preparation/upload fails, the same Drive version remains eligible; small Storage parts use upsert on retry.
- If transcription fails, the ingestion is marked failed and the normal private result remains available for owner action.
- If GitHub is unavailable, `completed` remains durable and the next hourly pass retries.
- If a public path contains a different job UUID, publication stops at `needs_review` rather than overwriting it.

Do not manually delete `drive_ingestions` rows to retry. Diagnose the safe local log and repair the underlying Drive, queue, or GitHub condition first.
