# Class Scribe

Class Scribe is a deployed, account-based web app for turning class recordings into private transcripts, summaries, key points, and action items. Users can upload up to 20 audio or video recordings together; a Windows worker processes them one at a time with local AI.

- Live app: https://class-scribe-ruddy.vercel.app
- Supabase project: `class-transcriber` (`wmsotywnkqdajhmiultx`)
- Source: https://github.com/DrFunDip72/class-scribe

## How it works

```text
Authenticated browser
  -> local video-to-audio extraction when needed
  -> private Supabase Storage + durable Postgres queue
  -> outbound-only Windows worker
  -> faster-whisper small (CPU INT8)
  -> Ollama qwen3:4b
  -> private saved result in Supabase
  -> privacy-safe Web Push completion alert
  -> optional privacy-safe FluxPrompt completion email
```

The Next.js site runs on Vercel. For MP4, WebM, MOV, M4V, and MKV input, the browser strips the video and creates compact speech audio on the user's device. The original video never uploads. Audio goes directly to a private Supabase bucket without passing through a Vercel Function, and the local worker makes outbound HTTPS requests only. Uploaded audio is deleted after successful processing; results stay with the user's account. A signed-in user can opt into persistent browser/desktop pop-ups, completion email to the account address, or both. Result pages let the user copy just the study-guide summary, just the transcript, or everything together.

## Repository map

- `web/` — Next.js 16 TypeScript application
- `supabase/migrations/` — schema, RLS, storage, queue, and worker-role migrations
- `worker.py` — sequential local processor
- `worker-launcher.ps1` — Windows logon-task launcher
- `docs/` — product, operations, security, deployment, and test handoff

## Start locally

```powershell
cd web
npm install
Copy-Item .env.example .env.local
npm run dev
```

The public Supabase URL and publishable key belong in `web/.env.local`. Worker credentials belong only in the ignored root `.env.worker.local`; see [local worker operations](docs/LOCAL-WORKER.md).

## Documentation

- [Current status](docs/STATUS.md)
- [Product specification](docs/PRODUCT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database and storage](docs/DATABASE.md)
- [Local worker operations](docs/LOCAL-WORKER.md)
- [Deployment and recovery](docs/DEPLOYMENT.md)
- [Costs and limits](docs/COSTS-AND-LIMITS.md)
- [Security](docs/SECURITY.md)
- [Testing evidence](docs/TESTING.md)
- [Decision log](docs/DECISIONS.md)
