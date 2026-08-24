# Security and Privacy

## Data classification

Recordings, filenames, transcripts, summaries, account IDs, and signed object URLs are private educational data.

## Controls in place

- Supabase email/password Auth and protected app routes.
- RLS on all exposed project tables.
- Private Storage with UUID-prefixed ownership policies.
- Browser validation plus authoritative database/bucket limits.
- Dedicated worker Auth role instead of a broad service-role key.
- Atomic queue claims, leases, capped retries, and duplicate-worker protection.
- Outbound-only local network design; Ollama stays on localhost.
- No transcript/credential/signed-URL logging.
- Local temporary cleanup and remote audio deletion after success.
- Ignored local environment, venv, model cache, temp, bootstrap, and build files.

## Advisor notes

Supabase reports warnings for the three authenticated SECURITY DEFINER functions. They are intentional narrow RPCs: anonymous execution is revoked, the user RPCs bind writes to `auth.uid()`, and the worker RPC checks protected JWT `app_metadata`.

Supabase also reports leaked-password protection disabled. That feature is not included on the Free plan. Use strong passwords; move to a plan that provides the feature before a high-risk/public launch.

Unused-index informational notices are expected while the new tables contain little data. Keep the foreign-key/history indexes until real usage establishes query patterns.

## Pre-public checklist

- Complete production Auth URL configuration.
- Because sign-up confirmation is disabled by owner decision, prioritize CAPTCHA and registration throttling before broad public promotion.
- Test two-account row and Storage isolation.
- Add an approved per-user daily submission policy before promoting this beyond limited personal/class use.
- Monitor Supabase Storage/egress/database usage.
- Confirm Vercel Hobby use remains personal and non-commercial.
- Obtain appropriate permission before uploading recordings containing other people's voices.

## Secret handling

Tracked examples contain names/placeholders only. Real values live in ignored `.env.local` / `.env.worker.local` files or platform settings. If any credential enters Git history or logs, revoke and replace it immediately rather than merely deleting the file.
