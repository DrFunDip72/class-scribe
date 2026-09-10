# OpenWhispr API Operations

## Purpose

This is a separate OpenAI-compatible transcription API for the owner's private Tailscale network. It is not the Class Scribe queue worker.

| Component | Configuration |
|---|---|
| Endpoint | `http://100.79.197.76:8000/v1` |
| Runtime | Docker Desktop / WSL 2 |
| Container | `openwhispr-speaches` |
| Image | `ghcr.io/speaches-ai/speaches:latest-cpu` |
| Required model | `Systran/faster-whisper-base.en` |
| Container restart policy | `unless-stopped` |
| Windows recovery task | `OpenWhisprServerSupervisor` |

The container binds only to the computer's Tailscale IPv4 address. `127.0.0.1:8000` is therefore not expected to answer. Do not add router port forwarding or bind this API to a public interface.

## Startup and recovery

Docker Desktop remains a per-user application. `install-openwhispr-task.ps1` registers a hidden task for the owner with owner-logon and five-minute recovery triggers. `StartWhenAvailable` causes a missed recovery run to execute after the owner's Windows session becomes available. The task runs `openwhispr-supervisor.ps1`, which:

1. Exits immediately when the required model is already available from `/v1/models`.
2. Starts Docker Desktop when its engine is unavailable and waits up to 90 seconds.
3. Starts the existing `openwhispr-speaches` container when needed.
4. Waits up to 60 seconds for the required model endpoint.

The supervisor never creates or replaces the container. Its generic operational log is stored in ignored `.openwhispr-state/` and contains no audio, transcripts, request bodies, or credentials.

Because Docker Desktop belongs to the owner's interactive Windows profile, this task guarantees recovery after that owner signs in; it does not claim pre-login service availability. The separate Class Scribe task runs as `SYSTEM` and remains independent.

## Commands

```powershell
# Install or repair the recovery task
.\install-openwhispr-task.ps1

# Check task and container state
Get-ScheduledTask -TaskName OpenWhisprServerSupervisor
docker inspect openwhispr-speaches --format '{{.State.Status}} {{.HostConfig.RestartPolicy.Name}}'

# Check the private model endpoint
Invoke-RestMethod http://100.79.197.76:8000/v1/models

# Run one recovery check immediately
.\openwhispr-supervisor.ps1
```

## Troubleshooting

- If port 8000 is unavailable but Tailscale is online, run the supervisor once and inspect only `.openwhispr-state/supervisor.log`.
- If Docker never becomes ready, open Docker Desktop interactively and inspect its diagnostics. The recurring task will retry in five minutes.
- If the container is missing, restore it deliberately from its recorded configuration; the supervisor will not silently create a replacement from a floating image tag.
- If `/v1/models` responds but the required model is absent, inspect the container's model volume and logs.
- Running this small API concurrently with Class Scribe is allowed, but simultaneous inference shares CPU and can increase fan noise and processing time.
