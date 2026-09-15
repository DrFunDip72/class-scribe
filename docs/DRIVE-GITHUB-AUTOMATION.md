# Google Drive to GitHub Automation

## Objective

The owner records a Monday/Wednesday class, saves the audio in the Google Drive folder `URecorder` with a recognizable class and lecture date, and takes no further action. The Windows computer imports it, reuses the existing private Class Scribe queue, and publishes one summary-first Markdown document to the matching public course repository after transcription passes an integrity check.

## Live flow

```text
URecorder in jmaximum72@gmail.com
  -> Google Drive for desktop streamed G: view + read-only cloud fallback
  -> owner-session logon/hourly Monday/Wednesday read
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
PSE 9-14.m4a
PHIL_201 class 9.14.mp3
philo 201 9-14.m4a
strategy 392 sept-16-2026 pt2.mp3
```

Accepted course aliases include `HRM 391`, `PSE 390`, standalone `PSE`, `STRAT 392`, `STRATEGY 392`, `PHIL 201`, `PHILO 201`, `PHILOSOPHY 201`, and standalone `Phil`/`Philo`/`Philosophy`, with spaces, `_`, `-`, or punctuation between components. Dates may be ISO, US numeric, abbreviated/full month names, two-digit years, or month/day without a year. A missing year is inferred from Drive modification time. Explicit `part` or `pt` suffixes are supported.

The parser refuses an ambiguous/missing class or date. It accepts the configured schedule—HRM/PSE/PHIL on Monday or Wednesday and STRAT on Wednesday—plus an observed one-day-early filename label. The weekly audit maps that label to the following scheduled class day for coverage while preserving the owner’s date in the note path. Other schedule mismatches still produce one generic attention notice instead of being guessed or published publicly.

## Duplicate handling and cutover

- The active desktop source derives a stable identity from the normalized path under `URecorder`; version identity adds the modification timestamp. Prior rclone rows retain their Google file IDs.
- Repeated hourly scans are idempotent.
- Before hydrating, the importer compares the parsed class/date/part against eligible existing owner jobs and checks filename/size compatibility against prior rclone ingestions. A single matching browser-created job is linked instead of retranscribed; multiple matches require review.
- The initial cutover is midnight Mountain Time on 2026-09-14. Both source modification time and parsed lecture date must meet it during scheduled discovery, so touched cloud metadata cannot make an older lecture eligible. Explicit exact-path backfills bypass the cutover.
- A file changed after import is a new Drive version, but GitHub refuses to overwrite a different Class Scribe UUID at an occupied path.

## Preparation and queue handoff

`class_scribe_automation.py` lists the first-party Drive desktop view at `G:\My Drive\URecorder` and the existing read-only cloud view. It merges them by case-insensitive relative path, uses the newest metadata version, and prefers a local hydrated source on an exact tie. If either view is temporarily unavailable, the other continues discovery; both must fail before the scan fails. It ignores files changed within the last ten minutes, copies/downloads each eligible source into an isolated temporary directory, and confirms desktop size and modification time do not change during hydration. Native FFmpeg then discards video, creates mono 16 kHz 48 kbps AAC/M4A, and segments at ten minutes. Ten-minute output is normally well below 6 MB, allowing individual retry through standard private Storage upload while preserving the existing 50 MB/object and 32-part database limits.

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

## AI repository index

Each public course repository has a root `AGENTS.md` titled `AI Repository Index — <course>`. AI coding/research agents should read it before using the archive. It defines the dated lecture path patterns, document-section semantics, transcript-first evidence hierarchy, timestamp citation method, uncertainty rules, and safe edit boundaries. The indexes instruct agents to enumerate `notes/` dynamically rather than depend on a static transcript catalog, so no index update is required when the exporter adds a lecture. HRM’s index explicitly excludes its Week 1 primer from transcript counts.

## Scheduled tasks

- `ClassScribeDriveDesktopAutomation` — owner interactive principal, owner logon plus hourly repetition. The `G:` mount requires this signed-in session. It imports only on class days/catch-up conditions and checks for completed exports every hour.
- `ClassScribeGitHubAudit` — `SYSTEM`, Thursday at 8:00 AM Mountain Time. It checks the current week for missing, unexpected, or duplicate dated notes and sends a generic HTML email report.

The continuously running `AudioTranscriberWorker` remains a pre-login `SYSTEM` task. Therefore already-queued work continues even if the owner later signs out; only discovery of new Drive desktop files waits for the next login.

Install/repair from Administrator PowerShell:

```powershell
.\install-drive-automation-tasks.ps1 -StartAndVerify
```

Operator commands:

```powershell
.\.venv-worker\Scripts\python.exe .\class_scribe_automation.py parse "HRM 391 9-14.mp3"
.\.venv-worker\Scripts\python.exe .\class_scribe_automation.py run --force-import
.\.venv-worker\Scripts\python.exe .\class_scribe_automation.py import-path "HRM 391 9-8.m4a" --force-new
.\.venv-worker\Scripts\python.exe .\class_scribe_automation.py audit --dry-run
Get-Content .\.worker-state\class-scribe-automation.log -Tail 50
```

`import-path` is the narrow historical-recovery path. It considers only the exact case-insensitive relative path supplied by the owner, still requires the Drive file to be at least ten minutes old, and bypasses the initial cutover and weekday rule only for that explicit source. Use `--force-new` only when a matching Class Scribe result is known to be unusable and a fresh transcription is required. It does not delete or overwrite the older private result; the normal quality gate still controls GitHub publication.

## Credentials

- `.worker-secrets/github-course-export.token` — fine-grained GitHub token with Contents read/write on only the four course repositories.
- `.env.worker.local` — existing worker/Supabase and FluxPrompt configuration.

All are ignored. Never copy their values into logs, chat, GitHub, Vercel, or Supabase.

Google Drive for desktop manages the primary Google login; Class Scribe receives no Google password. The ignored `.worker-secrets/rclone.conf` supplies the current read-only cloud fallback while `DRIVE_IMPORT_SOURCE=hybrid`. It prevents a cloud file missed by the `G:` mirror from being lost, but its retiring shared OAuth client is not a permanent credential strategy. Replace it with an owner-created Google OAuth desktop client before Google disables the shared client; after that replacement is verified, revoke the old authorization.

The 2026 rclone shared-client retirement cannot interrupt files already visible through the desktop source. Hybrid discovery still works from `G:` if the cloud fallback fails, and from cloud if the desktop view lags or is unavailable. Complete discovery requires at least one healthy source.

## Recovery

- If the computer or network is down, Drive retains the source and the next eligible/catch-up scan retries after the owner logs into Windows and Drive for desktop reconnects.
- If `G:` is missing, the importer exits without queueing partial work. Start Drive for desktop or sign in, then run the importer again.
- If preparation/upload fails, the same Drive version remains eligible; small Storage parts use upsert on retry.
- If transcription fails, the ingestion is marked failed and the normal private result remains available for owner action.
- If GitHub is unavailable, `completed` remains durable and the next hourly pass retries.
- If a public path contains a different job UUID, publication stops at `needs_review` rather than overwriting it.
- For an owner-approved older or off-schedule source, use the exact-path operator command instead of lowering the global cutoff or schedule rules.

Do not manually delete `drive_ingestions` rows to retry. Diagnose the safe local log and repair the underlying Drive, queue, or GitHub condition first.
