# Deployment and Recovery

## Production resources

- Vercel URL: https://class-scribe-ruddy.vercel.app
- Vercel project ID: `prj_hhjU0dQL2pTWWxjNq4A1EqkDVYq7`
- Vercel team: `justin-maxwells-projects` (Hobby)
- Supabase project: `class-transcriber`
- Supabase ref: `wmsotywnkqdajhmiultx`
- GitHub: https://github.com/DrFunDip72/class-scribe

## Web deployment

`web/` is the Vercel project root. Its only runtime configuration is the public Supabase project URL and publishable key. They are browser-visible identifiers, not secrets. Prefer Vercel environment-variable settings for future deployments; never add worker credentials, the FluxPrompt API key, or the VAPID private key.

The connected file-upload deployment path did not inherit project environment settings during the 2026-08-28 release check. For that path, include an ephemeral `.env.production` in the deployment payload containing only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, sourced from ignored `web/.env.local`; never commit it. A Vercel build can report Ready while middleware still returns HTTP 500 if these values are absent, so always open `/login` after the alias moves and inspect current-deployment runtime logs. Normal Git/CLI deployment should instead use Vercel-managed environment variables.

`public/sw.js` must be served from the site root and `manifest.webmanifest` must remain reachable. Web Push requires HTTPS in production; Vercel provides it automatically. Do not cache the service-worker script with an immutable policy.

Before deployment:

```powershell
cd web
npm ci
npm run lint
npm run build
```

## Required Supabase Auth URLs

In `Authentication -> URL Configuration`:

- Site URL: `https://class-scribe-ruddy.vercel.app`
- Allowed: `https://class-scribe-ruddy.vercel.app/auth/confirm`
- Allowed: `https://class-scribe-ruddy.vercel.app/reset-password`
- Development: `http://localhost:3000/**`

Update this list if the primary domain changes.

## Database changes

Add a timestamped migration under `supabase/migrations/`, review grants/RLS, apply it to the selected project, then run both Supabase advisors. Use a forward corrective migration for rollback.

## Worker-outage monitor

The production health boundary is `GET /api/worker-health`. HTTP 200 with `{"status":"online"}` means a non-offline Supabase heartbeat is no more than 10 minutes old; HTTP 503 means offline or unknown. The response is deliberately public and Boolean-only so the GitHub monitor needs no Supabase or Vercel secret.

`.github/workflows/worker-health-monitor.yml` checks it every five minutes using a standard public-repository runner. It opens one assigned `worker-offline` issue after three failed checks and closes it after recovery. A monthly `monitor-keepalive` branch update prevents the schedule from being disabled after 60 inactive days. Do not move the repository to private without first reviewing GitHub Actions minute billing, and do not change the workflow to a larger runner.

Verify after deployment:

```powershell
Invoke-WebRequest https://class-scribe-ruddy.vercel.app/api/worker-health
gh workflow run worker-health-monitor.yml
gh run list --workflow worker-health-monitor.yml --limit 3
```

The owner must keep GitHub issue-assignment email notifications enabled. GitHub schedules are best-effort and may be delayed; this is an operational alert, not a real-time availability SLA.

## Recovery

- Web: restore/promote the last verified Vercel deployment.
- Database: apply a forward corrective migration; do not reset production.
- Worker: disable and stop the task, restore the last verified commit, reinstall pinned dependencies if necessary, run `.\install-worker-task.ps1` from Administrator PowerShell, confirm the task uses `SYSTEM` with three triggers, and confirm a fresh heartbeat.
- Replacement computer: install Python/FFmpeg/Ollama, clone, recreate the venv, pull both models, restore `.worker-secrets/vapid_private_key.pem` from a secure backup, provision a new worker Auth identity, register the task, verify, then revoke the old identity.

If the VAPID private key cannot be restored, let the replacement worker generate one. It will publish the new public key and remove subscriptions signed for the old key. Users must then enable notifications again on each browser.

Email recovery also requires restoring `FLUXPROMPT_API_KEY` to the replacement computer's ignored `.env.worker.local`. The other email settings have tracked defaults. Restart the worker and run `worker.py --test-email <approved-address>` before relying on automatic mail. Pending events remain in Supabase while the worker or FluxPrompt is unavailable.

Queued jobs survive web/worker restarts in Supabase. Expired worker leases are automatically recovered on the next claim.

## Unattended Windows recovery

`install-worker-task.ps1` is the authoritative task definition. It may be rerun safely to repair configuration drift. It requires administrator approval because the worker runs as `SYSTEM` before any user signs in. The persistent launcher and the task's one-minute restart policy recover process crashes; the repeating five-minute trigger recovers the task if its normal restart attempts are bypassed.

The Windows task can start only after Windows itself boots. For recovery after a building power outage, configure the computer firmware/BIOS setting commonly named `Restore on AC Power Loss` or `AC Back` to power on. That firmware setting is machine-specific and is not changed by this repository.
