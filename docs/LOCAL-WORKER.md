# Local Worker Operations

## Installed configuration

| Component | Configuration |
|---|---|
| Python | 3.12.10 in `.venv-worker` |
| FFmpeg | 9.0 |
| faster-whisper | 1.2.1 |
| CTranslate2 | 4.8.1, CPU INT8 |
| Whisper tiers | Fast `small`; Balanced `distil-large-v3`; High `medium.en` |
| Ollama | 0.33.3 |
| Summary model | `qwen3:4b` |
| Startup task | `AudioTranscriberWorker`, running as Windows `SYSTEM` |
| Worker version | `1.5.0` |
| Push library | `pywebpush` 2.4.0 |
| Email transport | FluxPrompt Email Agent over outbound HTTPS |

Python 3.14 also exists. Always invoke `.venv-worker\Scripts\python.exe`.

## Configuration

Copy `.env.worker.example` to ignored `.env.worker.local`. Populate the Supabase URL, publishable key, and dedicated worker email/password. Do not use a service-role key and do not commit the file.

`VAPID_SUBJECT` identifies the Web Push sender and defaults to the production site URL. On its first authenticated start, the worker creates `.worker-secrets/vapid_private_key.pem`, publishes only the corresponding public key to Supabase, and restricts the local file permissions where Windows permits. Back up this private key securely with the worker credentials. Losing or replacing it invalidates existing browser subscriptions; users must enable notifications again.

`FLUXPROMPT_API_KEY` is the only required email secret. Add it to ignored `.env.worker.local`; never add it to Vercel, Supabase, a `NEXT_PUBLIC_` variable, Git, logs, or chat. `FLUXPROMPT_API_URL`, `FLUXPROMPT_FLOW_ID`, and `SITE_URL` have production defaults in `.env.worker.example`. Restart the startup task after changing the file. With no key, transcription and Web Push continue normally and opted-in email events wait durably.

FFmpeg is required for worker-side decoding. The worker checks optional `FFMPEG_PATH`, the process PATH, the owner's standard WinGet FFmpeg package location, and common machine-wide locations. This works under the `SYSTEM` startup task even though that account has a different profile. The worker passes decoded NumPy audio to `faster-whisper`; it does not load PyAV, whose unsigned native extension is blocked by Windows Smart App Control on this computer.

Whisper selection comes from the validated tier stored on each job, not an environment variable. Fast uses `small`/beam 1 with automatic language detection; Balanced uses `distil-large-v3`/beam 5 with English fixed and previous-text conditioning disabled; High uses `medium.en`/beam 5 with English fixed. The worker holds only the current model in memory and unloads it when the next FIFO job requires another tier.

`bootstrap-worker-auth.py` creates local bootstrap material for an administrator to provision the dedicated Auth row with `app_metadata.role=worker`. Its generated JSON and local environment are ignored. Revoke the old Auth identity before provisioning a replacement computer.

## Commands

```powershell
# Stack smoke test
\.venv-worker\Scripts\python.exe verify-local-stack.py verification-sample.mp3

# Compare three local transcriber configurations against the same retained audio
\.venv-worker\Scripts\python.exe compare_transcribers.py "C:\path\to\retained-class.m4a"

# Compare the current High tier with larger/faster next-generation candidates
\.venv-worker\Scripts\python.exe compare_transcribers.py --suite next-gen "C:\path\to\retained-class.m4a"

# Process at most one queued job
\.venv-worker\Scripts\python.exe worker.py --once

# Send the branded three-recording sample (requires FLUXPROMPT_API_KEY)
\.venv-worker\Scripts\python.exe worker.py --test-email you@example.com

# Task state
Get-ScheduledTask -TaskName AudioTranscriberWorker
Get-ScheduledTaskInfo -TaskName AudioTranscriberWorker

# Install or repair unattended startup (run once from Administrator PowerShell)
.\install-worker-task.ps1

# Apply the SYSTEM identity immediately, only when the queue is idle
.\install-worker-task.ps1 -RestartRunning

# Restart
Stop-ScheduledTask -TaskName AudioTranscriberWorker
Start-ScheduledTask -TaskName AudioTranscriberWorker
```

The default `production` comparison suite decodes the source once, then runs `small`/beam 1, `small.en`/beam 5, and `medium.en`/beam 5 sequentially on CPU INT8. The `next-gen` suite runs `medium.en`, `distil-large-v3`, and `turbo`; all use beam 5 and fixed English, while Distil disables previous-text conditioning as recommended for that model. The tool never contacts Supabase and writes transcripts, segment metadata, timing, timestamp-overrun warnings, and pairwise word-sequence agreement only to ignored `.transcriber-benchmarks/`. Agreement between models is not correctness; listen to the retained source and review names, technical vocabulary, quiet speech, cross-talk, repetitions, and invented speech before choosing a production model. The first run may download uncached models, so rerun after downloads finish for comparable cached timing. Never commit the source recording or benchmark output. For a long benchmark, first confirm the production queue is idle and disable/stop the scheduled worker to avoid CPU contention; re-enable and start it afterward.

The installer registers three independent triggers: Windows startup, user logon, and a five-minute repeating recovery trigger. It runs under the built-in `SYSTEM` service account, so no user sign-in or stored Windows password is required. The task starts missed runs when available, allows 999 one-minute Task Scheduler restarts, has no execution time limit, and ignores overlapping triggers. A normal repair preserves an already-running worker; use `-RestartRunning` only while the queue is idle when the new task identity must take effect immediately.

The launcher is also a persistent supervisor. It starts Ollama in a hidden process if needed, verifies both the local API and Ollama's `llama-server.exe` inference runner, starts the queue worker, and relaunches it after any exit. The runner check prevents a partially installed Ollama process from claiming jobs and consuming their retry attempts. Because `SYSTEM` has a different Windows profile, the launcher explicitly points Ollama at the owner's existing `.ollama\models` directory and `HF_HOME` at the owner's verified faster-whisper cache rather than downloading duplicate models. A cross-process launcher lock, a global cross-session Windows worker mutex, and atomic database claiming prevent duplicate processing.

Supervisor-only events and exit codes are written to ignored `.worker-state\worker-launcher.log`. The log does not contain credentials, transcript text, summaries, signed links, or authorization headers.

For planned maintenance, disable the recurring task before stopping it; otherwise the five-minute recovery trigger will start it again:

```powershell
Disable-ScheduledTask -TaskName AudioTranscriberWorker
Stop-ScheduledTask -TaskName AudioTranscriberWorker

# Re-enable after maintenance
Enable-ScheduledTask -TaskName AudioTranscriberWorker
Start-ScheduledTask -TaskName AudioTranscriberWorker
```

An Ollama installer cannot replace files held by the detached `SYSTEM`-owned runtime. For an Ollama repair or upgrade, use the launcher's ignored maintenance marker so the task itself stops that process:

```powershell
New-Item -ItemType File -Path .\.worker-state\ollama-maintenance.pause -Force
Stop-ScheduledTask -TaskName AudioTranscriberWorker
Start-ScheduledTask -TaskName AudioTranscriberWorker
# After the maintenance run exits, disable the task while running the signed installer.
Disable-ScheduledTask -TaskName AudioTranscriberWorker

# After installation:
Remove-Item -LiteralPath .\.worker-state\ollama-maintenance.pause
Enable-ScheduledTask -TaskName AudioTranscriberWorker
Start-ScheduledTask -TaskName AudioTranscriberWorker
```

Confirm the installer is official and Authenticode-valid before running it. Do not leave the maintenance marker in place; every later task start will intentionally stop Ollama and exit until it is removed.

## Normal operation

- Idle polling interval: 8 seconds.
- One active job.
- Jobs remain FIFO even when tiers differ. Switching tiers unloads the current Whisper model before loading the next one; the selected tier never changes queue priority.
- Batch uploads may contain non-claimable `uploading` placeholders while the browser sends later files. The worker still claims only `queued` jobs, so no worker restart or configuration change is required for progressive uploads.
- Heartbeat is sent while idle and at progress changes.
- Lease: 20 minutes, refreshed during work.
- Maximum attempts: 3.
- Temporary downloaded/decoded audio: `.worker-temp`, removed in `finally`.
- Multipart jobs: parts download and transcribe in order, timestamps are offset into one result, and only one part is processed locally at a time.
- Completed source objects: every remote part is deleted only after the result and completion event are saved.
- Push deliveries: durable, attempted separately after result commit, up to three attempts with exponential backoff.
- Email deliveries: durable, recheck opt-in immediately before sending, then call FluxPrompt separately with up to three attempts and exponential backoff.
- Expired browser subscriptions: removed automatically after a push provider returns HTTP 404 or 410.
- Summary output: a brief overview (usually 2-4 sentences), up to 14 ordered concept/definition/process points without padding, selective examples, a final `Big takeaway`, and only genuine action items. The fallback sentence extractor preserves common titles such as `Dr.` instead of truncating the takeaway. Single-section recordings skip the consolidation pass.

## Drive and GitHub automation

`ClassScribeDriveDesktopAutomation` is separate from the continuously running inference worker. It runs under the owner at Windows logon and hourly because the Google Drive desktop `G:` mount is user-session scoped. It scans `URecorder` only on Monday/Wednesday or one missed-day catch-up and checks completed ingestions for GitHub export every hour. The main `AudioTranscriberWorker` and Thursday 8:00 AM `ClassScribeGitHubAudit` remain under `SYSTEM`. Repair the automation tasks with `install-drive-automation-tasks.ps1 -StartAndVerify` from Administrator PowerShell; that installer also removes the obsolete `ClassScribeDriveAutomation` task.

Safe automation logs are under `.worker-state/class-scribe-automation.log`; task installation/status evidence is under `.worker-state/`. Credentials are ignored under `.worker-secrets/`. Full operations and recovery are in `docs/DRIVE-GITHUB-AUTOMATION.md`.

## Owner outage notification

The external monitor is `.github/workflows/worker-health-monitor.yml`; it does not run on this computer and uses no AI. Every five minutes it checks `https://class-scribe-ruddy.vercel.app/api/worker-health`. A heartbeat older than 10 minutes makes the route unavailable. After three checks, the workflow opens one `worker-offline` GitHub issue assigned to `DrFunDip72`, and closes it when health returns.

GitHub must be configured to email issue assignments for the owner account. Confirm the account's notification email is verified and repository issue notifications are enabled. Use the workflow's `Run workflow` control for a non-destructive live check; a real outage/recovery drill requires planned worker maintenance.

The public route exposes only `online` or `offline`. It contains no filename, transcript, summary, account identifier, worker identifier, timestamp, queue count, or signed URL.

## Troubleshooting

- **Website says worker offline:** confirm the task is Running, Ollama responds at `127.0.0.1:11434`, and the computer is awake/online.
- **Task is not using SYSTEM or has fewer than three triggers:** open Administrator PowerShell in the repository and rerun `.\install-worker-task.ps1`.
- **Worker repeatedly exits:** inspect only `.worker-state\worker-launcher.log`, the task result, and safe worker error output. Do not redirect private transcript or credential data into persistent logs.
- **Worker auth error:** verify the worker Auth user still exists, its `app_metadata.role` is `worker`, and local credentials match.
- **Job stays queued:** inspect heartbeat first, then run `worker.py --once` in a terminal.
- **Ollama unavailable:** confirm both `ollama.exe` and `lib\ollama\llama-server.exe` exist under `$env:LOCALAPPDATA\Programs\Ollama`. If the runner is missing, repair Ollama with the official signed installer using the maintenance procedure above. Otherwise run `& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" serve`.
- **Model missing:** run `& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" pull qwen3:4b`.
- **FFmpeg unavailable:** run `Get-Command ffmpeg`; if the `SYSTEM` task still cannot find it, set the exact executable path as `FFMPEG_PATH` in ignored `.env.worker.local`, then restart the task.
- **No browser pop-up:** verify worker version `1.3.0`, confirm `notification_configuration` contains `web_push`, check the account enabled notifications on that browser, and inspect `push_notification_deliveries` for the safe error message.
- **No completion email:** confirm the account enabled Email, verify `FLUXPROMPT_API_KEY` is set locally, restart the startup task, and inspect only the safe state/error metadata in `completion_events`. Do not log the recipient, HTML body, API key, or API response body.
- **Private push key replaced:** restart the worker, then ask each user to disable and re-enable notifications on every desired device.

Do not expose Ollama, add port forwarding, or create a public tunnel.

The separate private-Tailscale OpenWhispr/Speaches service has its own container and recovery task. It is not managed by `AudioTranscriberWorker`; see `docs/OPENWHISPR.md`.
