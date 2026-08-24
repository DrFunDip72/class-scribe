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

## Recovery

- Web: restore/promote the last verified Vercel deployment.
- Database: apply a forward corrective migration; do not reset production.
- Worker: stop the task, restore the last verified commit, reinstall pinned dependencies if necessary, restart, and confirm a fresh heartbeat.
- Replacement computer: install Python/FFmpeg/Ollama, clone, recreate the venv, pull both models, restore `.worker-secrets/vapid_private_key.pem` from a secure backup, provision a new worker Auth identity, register the task, verify, then revoke the old identity.

If the VAPID private key cannot be restored, let the replacement worker generate one. It will publish the new public key and remove subscriptions signed for the old key. Users must then enable notifications again on each browser.

Email recovery also requires restoring `FLUXPROMPT_API_KEY` to the replacement computer's ignored `.env.worker.local`. The other email settings have tracked defaults. Restart the worker and run `worker.py --test-email <approved-address>` before relying on automatic mail. Pending events remain in Supabase while the worker or FluxPrompt is unavailable.

Queued jobs survive web/worker restarts in Supabase. Expired worker leases are automatically recovered on the next claim.
