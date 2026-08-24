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
| Startup task | `AudioTranscriberWorker` |

Python 3.14 also exists. Always invoke `.venv-worker\Scripts\python.exe`.

## Configuration

Copy `.env.worker.example` to ignored `.env.worker.local`. Populate the Supabase URL, publishable key, and dedicated worker email/password. Do not use a service-role key and do not commit the file.

`bootstrap-worker-auth.py` creates local bootstrap material for an administrator to provision the dedicated Auth row with `app_metadata.role=worker`. Its generated JSON and local environment are ignored. Revoke the old Auth identity before provisioning a replacement computer.

## Commands

```powershell
# Stack smoke test
\.venv-worker\Scripts\python.exe verify-local-stack.py verification-sample.mp3

# Process at most one queued job
\.venv-worker\Scripts\python.exe worker.py --once

# Task state
Get-ScheduledTask -TaskName AudioTranscriberWorker
Get-ScheduledTaskInfo -TaskName AudioTranscriberWorker

# Restart
Stop-ScheduledTask -TaskName AudioTranscriberWorker
Start-ScheduledTask -TaskName AudioTranscriberWorker
```

The launcher starts Ollama in a hidden window if needed, waits for it, and starts the worker. A named Windows mutex causes a second launch to log a safe message and exit 0.

## Normal operation

- Idle polling interval: 8 seconds.
- One active job.
- Heartbeat is sent while idle and at progress changes.
- Lease: 20 minutes, refreshed during work.
- Maximum attempts: 3.
- Temporary audio: `.worker-temp`, removed in `finally`.
- Completed source object: deleted only after result and completion event are saved.

## Troubleshooting

- **Website says worker offline:** confirm the task is Running, Ollama responds at `127.0.0.1:11434`, and the computer is awake/online.
- **Worker auth error:** verify the worker Auth user still exists, its `app_metadata.role` is `worker`, and local credentials match.
- **Job stays queued:** inspect heartbeat first, then run `worker.py --once` in a terminal.
- **Ollama unavailable:** run `& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" serve`.
- **Model missing:** run `& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" pull qwen3:4b`.

Do not expose Ollama, add port forwarding, or create a public tunnel.
