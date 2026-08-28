# Local Worker Operations

## Installed configuration

| Component | Configuration |
|---|---|
| Python | 3.12.10 in `.venv-worker` |
| FFmpeg | 9.0 |
| faster-whisper | 1.2.1 |
| CTranslate2 | 4.8.1, CPU INT8 |
| Whisper | `small` |
| Ollama | 0.32.15 |
| Summary model | `qwen3:4b` |
| Startup task | `AudioTranscriberWorker`, running as Windows `SYSTEM` |
| Worker version | `1.3.1` |
| Push library | `pywebpush` 2.4.0 |
| Email transport | FluxPrompt Email Agent over outbound HTTPS |

Python 3.14 also exists. Always invoke `.venv-worker\Scripts\python.exe`.

## Configuration

Copy `.env.worker.example` to ignored `.env.worker.local`. Populate the Supabase URL, publishable key, and dedicated worker email/password. Do not use a service-role key and do not commit the file.

`VAPID_SUBJECT` identifies the Web Push sender and defaults to the production site URL. On its first authenticated start, the worker creates `.worker-secrets/vapid_private_key.pem`, publishes only the corresponding public key to Supabase, and restricts the local file permissions where Windows permits. Back up this private key securely with the worker credentials. Losing or replacing it invalidates existing browser subscriptions; users must enable notifications again.

`FLUXPROMPT_API_KEY` is the only required email secret. Add it to ignored `.env.worker.local`; never add it to Vercel, Supabase, a `NEXT_PUBLIC_` variable, Git, logs, or chat. `FLUXPROMPT_API_URL`, `FLUXPROMPT_FLOW_ID`, and `SITE_URL` have production defaults in `.env.worker.example`. Restart the startup task after changing the file. With no key, transcription and Web Push continue normally and opted-in email events wait durably.

`bootstrap-worker-auth.py` creates local bootstrap material for an administrator to provision the dedicated Auth row with `app_metadata.role=worker`. Its generated JSON and local environment are ignored. Revoke the old Auth identity before provisioning a replacement computer.

## Commands

```powershell
# Stack smoke test
\.venv-worker\Scripts\python.exe verify-local-stack.py verification-sample.mp3

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

The installer registers three independent triggers: Windows startup, user logon, and a five-minute repeating recovery trigger. It runs under the built-in `SYSTEM` service account, so no user sign-in or stored Windows password is required. The task starts missed runs when available, allows 999 one-minute Task Scheduler restarts, has no execution time limit, and ignores overlapping triggers. A normal repair preserves an already-running worker; use `-RestartRunning` only while the queue is idle when the new task identity must take effect immediately.

The launcher is also a persistent supervisor. It starts Ollama in a hidden process if needed, waits for the local API, starts the queue worker, and relaunches it after any exit. Because `SYSTEM` has a different Windows profile, the launcher explicitly points Ollama at the owner's existing `.ollama\models` directory rather than downloading another model. A cross-process launcher lock, a global cross-session Windows worker mutex, and atomic database claiming prevent duplicate processing.

Supervisor-only events and exit codes are written to ignored `.worker-state\worker-launcher.log`. The log does not contain credentials, transcript text, summaries, signed links, or authorization headers.

For planned maintenance, disable the recurring task before stopping it; otherwise the five-minute recovery trigger will start it again:

```powershell
Disable-ScheduledTask -TaskName AudioTranscriberWorker
Stop-ScheduledTask -TaskName AudioTranscriberWorker

# Re-enable after maintenance
Enable-ScheduledTask -TaskName AudioTranscriberWorker
Start-ScheduledTask -TaskName AudioTranscriberWorker
```

## Normal operation

- Idle polling interval: 8 seconds.
- One active job.
- Heartbeat is sent while idle and at progress changes.
- Lease: 20 minutes, refreshed during work.
- Maximum attempts: 3.
- Temporary audio: `.worker-temp`, removed in `finally`.
- Completed source object: deleted only after result and completion event are saved.
- Push deliveries: durable, attempted separately after result commit, up to three attempts with exponential backoff.
- Email deliveries: durable, recheck opt-in immediately before sending, then call FluxPrompt separately with up to three attempts and exponential backoff.
- Expired browser subscriptions: removed automatically after a push provider returns HTTP 404 or 410.
- Summary output: a brief overview (usually 2-4 sentences), up to 14 ordered concept/definition/process points without padding, selective examples, a final `Big takeaway`, and only genuine action items. Single-section recordings skip the consolidation pass.

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
- **Ollama unavailable:** run `& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" serve`.
- **Model missing:** run `& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" pull qwen3:4b`.
- **No browser pop-up:** verify worker version `1.3.0`, confirm `notification_configuration` contains `web_push`, check the account enabled notifications on that browser, and inspect `push_notification_deliveries` for the safe error message.
- **No completion email:** confirm the account enabled Email, verify `FLUXPROMPT_API_KEY` is set locally, restart the startup task, and inspect only the safe state/error metadata in `completion_events`. Do not log the recipient, HTML body, API key, or API response body.
- **Private push key replaced:** restart the worker, then ask each user to disable and re-enable notifications on every desired device.

Do not expose Ollama, add port forwarding, or create a public tunnel.
