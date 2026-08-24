# Security and Privacy

## Data classification

Recordings, filenames, transcripts, summaries, account IDs, and signed object URLs are private educational data.

## Controls in place

- Supabase email/password Auth and protected app routes.
- RLS on all exposed project tables.
- Private Storage with UUID-prefixed ownership policies.
- Browser validation plus authoritative database/bucket limits.
- Local video preprocessing: original MP4/WebM/MOV/M4V/MKV files never leave the user's device; only compact derived audio uploads.
- Lazy source reads and one-at-a-time conversion reduce browser memory pressure for large videos.
- Dedicated worker Auth role instead of a broad service-role key.
- Atomic queue claims, leases, capped retries, and duplicate-worker protection.
- Outbound-only local network design; Ollama stays on localhost.
- No transcript/credential/signed-URL logging.
- Local temporary cleanup and remote audio deletion after success.
- Ignored local environment, venv, model cache, temp, bootstrap, and build files.
- Opt-in, account-scoped Push API subscriptions protected by RLS.
- A local-only VAPID private key; Supabase and browsers receive only its public key.
- Privacy-safe push payloads with generic status text and no filename, transcript, summary, or signed URL.
- Opt-in completion email recipients constrained by RLS to the authenticated JWT's account email.
- A local-only FluxPrompt API key sent in the custom `api-key` header over outbound HTTPS; it never enters browser code, Vercel, or Supabase.
- Privacy-safe HTML email bodies with only generic status, a public dashboard URL, and no class content or signed link.
- Notification failure isolation: delivery retries cannot make a completed transcription fail.

## Advisor notes

Supabase reports warnings for the three authenticated SECURITY DEFINER functions. They are intentional narrow RPCs: anonymous execution is revoked, the user RPCs bind writes to `auth.uid()`, and the worker RPC checks protected JWT `app_metadata`.

Supabase also reports leaked-password protection disabled. That feature is not included on the Free plan. Use strong passwords; move to a plan that provides the feature before a high-risk/public launch.

Unused-index informational notices are expected while the new tables contain little data. Keep the foreign-key/history indexes until real usage establishes query patterns.

## Pre-public checklist

- Complete production Auth URL configuration.
- Because sign-up confirmation is disabled by owner decision, prioritize CAPTCHA and registration throttling before broad public promotion.
- Because confirmation is disabled, a registrant can opt an unverified address into completion mail. Keep access limited until CAPTCHA, sign-up throttling, and an approved email-ownership/abuse control are in place.
- Test two-account row and Storage isolation.
- Add an approved per-user daily submission policy before promoting this beyond limited personal/class use.
- Monitor Supabase Storage/egress/database usage.
- Confirm Vercel Hobby use remains personal and non-commercial.
- Obtain appropriate permission before uploading recordings containing other people's voices.
- Remember that extracted audio still contains the recording's speech and remains private educational data even though the video track was removed.

## Secret handling

Tracked examples contain names/placeholders only. Real values live in ignored `.env.local` / `.env.worker.local` files or platform settings. If any credential enters Git history or logs, revoke and replace it immediately rather than merely deleting the file.

The generated `.worker-secrets/vapid_private_key.pem` is also a secret. Keep it out of Git and ordinary cloud documents. Store any recovery copy in the same protected secret/password backup used for worker credentials. Rotating it is safe but invalidates all current push subscriptions.

The FluxPrompt API key belongs only in ignored `.env.worker.local` on the Windows worker. Do not store it in a notification payload or delivery error. If exposed, rotate it in FluxPrompt before restoring email delivery.
