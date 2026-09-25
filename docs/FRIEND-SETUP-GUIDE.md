# Class Scribe — Clean Installation and Claude Handoff

This guide is for installing a new, independent Class Scribe deployment for another person. It must not connect to Justin's Supabase project, Vercel project, worker account, email provider, Google Drive, or course repositories.

The recommended first milestone is only the core transcription service:

```text
user account + web upload
  -> private Supabase Storage and FIFO queue
  -> one outbound-only Windows worker
  -> local faster-whisper transcription
  -> local Ollama summary
  -> private saved result in the user's account
```

Do not enable the Google Drive importer, public GitHub course archive, FluxPrompt email, GitHub outage monitor, OpenWhispr API, or other owner-specific automations during the initial build. They are optional later phases.

## What to give the new owner

Send these two things:

1. The source repository: `https://github.com/DrFunDip72/class-scribe`
2. The ready-to-paste Claude prompt near the end of this document.

The new owner should fork the repository into their own GitHub account before making changes. A fork prevents their deployment, secrets, documentation, and future changes from being mixed with the original production system.

## Core technology stack

| Layer | Technology | Responsibility |
|---|---|---|
| Source control | GitHub | Own fork, change history, and deployment source |
| Website | Next.js 16, React 19, TypeScript, Tailwind CSS | Authentication UI, uploads, dashboard, and results |
| Web hosting | Vercel | Hosts only the Next.js application |
| Authentication | Supabase Auth | Email/password accounts and sessions |
| Database | Supabase Postgres | Durable FIFO jobs, results, user state, leases, and worker heartbeat |
| File storage | Private Supabase Storage | Temporary direct audio or prepared multipart audio |
| Large uploads | `tus-js-client` | Resumable uploads for unstable connections |
| Browser media preparation | Mediabunny | Removes video and compresses oversized audio before upload |
| Local runtime | Windows 10/11, Python 3.12 | Runs the private queue worker |
| Audio decoding | FFmpeg | Converts queued parts to mono 16 kHz audio for inference |
| Transcription | `faster-whisper` 1.2.1 / CTranslate2 CPU INT8 | Fast `small`, Balanced `distil-large-v3`, or High `medium.en` |
| Summaries | Ollama with `qwen3:4b` | Produces private summaries, key points, and action items locally |
| Startup/recovery | Windows Task Scheduler | Runs Ollama and the worker at boot, before login, and after failures |

Vercel never receives the recording and performs no transcription. The browser uploads directly to private Supabase Storage. The Windows worker makes outbound HTTPS requests only; no router port, public tunnel, or inbound firewall opening is needed.

## Cost posture

The core can begin at $0/month using GitHub Free, Supabase Free, and Vercel Hobby plus local CPU inference. The owner still supplies the computer, disk space, electricity, and internet connection. Vercel Hobby is for personal, non-commercial use, and Supabase Free has database, Storage, egress, and inactivity limits that can change. Review current provider pricing and `docs/COSTS-AND-LIMITS.md` before inviting substantial usage or charging customers:

- https://vercel.com/pricing
- https://supabase.com/pricing
- https://github.com/pricing

## Initial-build boundary

Build and verify these features first:

- Independent GitHub fork.
- Independent Supabase project.
- Independent Vercel project and URL.
- Sign-up, sign-in, password reset, and protected dashboard.
- Private uploads and resumable multipart uploads.
- FIFO processing by one Windows worker.
- Fast, Balanced, and High transcription choices.
- Ollama-generated summary, key points, and action items.
- Saved private results and copy/download controls.
- Dependable Windows startup task.
- One real end-to-end recording test.

Leave these disabled until the core test passes:

- FluxPrompt completion email.
- Web Push notifications. The code and schema may remain installed, but notification acceptance testing is a later phase.
- GitHub Actions worker-outage monitoring.
- Google Drive `URecorder` import.
- Public course-note and MP3 publication.
- Weekly course-coverage audit.
- The separate OpenWhispr/Speaches API.
- Notion or other third-party integrations.

The optional systems are already represented in the codebase and migrations. Not configuring their credentials keeps them inactive.

## Human checkpoints

Claude can perform the installation and tests from the checked-out repository, but the new owner must personally complete or approve:

- Creating or signing into GitHub, Supabase, and Vercel accounts.
- Forking the repository into the correct GitHub account.
- Approving browser-based CLI logins.
- Creating the Supabase project and retaining its database password.
- Entering secret values locally or in provider dashboards.
- Approving the Windows Administrator/UAC prompt for the startup task.
- Granting permission to record and process other people's voices.

Do not paste passwords, database passwords, secret/service-role keys, or access tokens into an AI chat. Enter them directly into the provider dashboard, a hidden terminal prompt, or an ignored local file.

## Hardware and operating-system assumptions

The tracked worker is configured for Windows and CPU inference. Use Windows 10 or 11, a modern multi-core 64-bit CPU, at least 16 GB RAM, and at least 15 GB of free disk space for Python packages and local models. More CPU cores improve speed. This installation does not configure GPU inference.

The computer must remain powered on, awake, and online to process jobs. Vercel and Supabase stay online when the computer is off, but recordings remain safely queued until the worker returns.

## Installation order

Follow this order. Do not start the web app or push migrations until the repository is linked to the new owner's projects and the environment-variable names are verified.

### 1. Fork and clone

Fork `DrFunDip72/class-scribe` in the new owner's GitHub account, then clone that fork under the Windows user's Desktop. The current startup launcher derives the interactive user's model-cache path from this layout.

```powershell
Set-Location "$env:USERPROFILE\Desktop"
git clone https://github.com/<NEW_GITHUB_OWNER>/class-scribe.git
Set-Location class-scribe
git remote -v
```

Confirm `origin` points to the new owner's fork. Never place secrets in the fork.

### 2. Install prerequisites

Install:

- Git.
- Node.js 20.9 or newer. Use a current LTS release.
- Python 3.12 x64.
- FFmpeg and FFprobe.
- Ollama for Windows.
- Vercel CLI.
- Supabase CLI, either as a pinned project dependency or through its official Windows Scoop bucket. The examples below use `npx supabase`; drop `npx` when using the global Scoop installation.

On Windows, Claude can install the main prerequisites with WinGet after the owner reviews the package list:

```powershell
winget install --exact --id Git.Git --accept-package-agreements --accept-source-agreements
winget install --exact --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
winget install --exact --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
winget install --exact --id Gyan.FFmpeg --accept-package-agreements --accept-source-agreements
winget install --exact --id Ollama.Ollama --accept-package-agreements --accept-source-agreements
npm install --global vercel
```

Open a new PowerShell window after installation so PATH changes are visible. Supabase's official Windows global install uses Scoop; using `npx supabase` avoids requiring another package manager for a one-computer setup.

Useful verification commands:

```powershell
git --version
node --version
npm --version
py -3.12 --version
ffmpeg -version
ffprobe -version
ollama --version
vercel --version
npx supabase --version
```

Next.js 16 requires Node.js 20.9 or newer. Official references:

- Next.js requirements: https://nextjs.org/docs/app/getting-started/installation
- Supabase CLI: https://supabase.com/docs/guides/local-development/cli/getting-started
- Vercel CLI: https://vercel.com/docs/cli
- Ollama for Windows: https://ollama.com/download/windows
- faster-whisper: https://github.com/SYSTRAN/faster-whisper

### 3. Create and configure the new Supabase project

Create a new hosted Supabase project. Record these values without committing them:

- Project reference.
- Project URL: `https://<PROJECT_REF>.supabase.co`.
- Publishable key beginning with `sb_publishable_`.
- Database password.

Link this repository and apply its committed migrations:

```powershell
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase migration list
npx supabase db push
npx supabase migration list
```

Do not run `supabase db reset --linked`; that command is destructive. Future database changes must use new committed forward migrations.

The migrations create the private `recordings` bucket, database tables, RLS policies, RPCs, worker role checks, multipart upload support, and notification/outbox tables. The newest Supabase projects require explicit Data API grants; use the committed migrations rather than manually recreating tables in the dashboard.

Run Supabase security and performance advisors after the push. Review results against `docs/SECURITY.md`; do not “fix” an intentional narrow `SECURITY DEFINER` function by broadening access.

Official migration workflow: https://supabase.com/docs/guides/deployment/database-migrations

### 4. Configure Supabase Auth

In Supabase Authentication settings:

- Enable email/password sign-up.
- Disable anonymous sign-ins.
- Set the production Site URL after Vercel supplies it.
- Add production redirects for `/auth/confirm` and `/reset-password`.
- Add `http://localhost:3000/**` for local development.

The current product has **Confirm Email disabled**. That is convenient for a small private deployment, but it means an email address is not verified. For a broader public deployment, enable confirmation or add CAPTCHA/rate limiting before launch.

### 5. Create the dedicated worker user

The worker must use a normal Supabase Auth user with protected `app_metadata.role = "worker"`. Do not put a Supabase secret/service-role key on the worker.

Recommended operator path:

1. Generate a unique worker email and a long random password.
2. In Supabase Authentication, create the user and mark it confirmed.
3. In the Supabase SQL editor, set only that user's protected app metadata:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"role":"worker"}'::jsonb
where lower(email) = lower('<WORKER_EMAIL>');
```

4. Verify exactly one row:

```sql
select id, email, raw_app_meta_data ->> 'role' as role
from auth.users
where lower(email) = lower('<WORKER_EMAIL>');
```

The result must show `role = worker`. Store the worker email/password only in the ignored `.env.worker.local` file. The tracked `bootstrap-worker-auth.py` contains original-install defaults and must not be run unchanged against a new owner's environment.

### 6. Configure the website locally

Install the pinned web dependencies and create the ignored environment file:

```powershell
Set-Location web
npm ci
Copy-Item .env.example .env.local
```

Put only these values in `web/.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<NEW_PROJECT_PUBLISHABLE_KEY>
```

These two values are intended for browser use. Never add a secret/service-role key or worker password to a `NEXT_PUBLIC_` variable.

Verify before deployment:

```powershell
npm run lint
npm run build
npm run dev
```

Open `http://localhost:3000`, create a normal test account, sign in, and confirm the dashboard loads. Stop the development server before continuing.

### 7. Deploy the website to a new Vercel project

The Vercel project root is the repository's `web` directory. Either import the fork through the Vercel dashboard and set Root Directory to `web`, or deploy from that directory with the CLI:

```powershell
Set-Location web
vercel login
vercel whoami
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
vercel deploy --prod
```

Add the same environment-variable names for Preview and Development if those environments will be used. Enter values only at the hidden prompts or in Vercel's settings.

After Vercel gives the production URL:

1. Update Supabase Auth's Site URL and allowed redirects.
2. Put that URL in the worker's `SITE_URL` and `VAPID_SUBJECT` settings.
3. Open `/`, `/login`, `/signup`, and `/dashboard` on the deployed site.

Official Vercel flow: https://vercel.com/docs/projects/deploy-from-cli

### 8. Install the local AI worker

Return to the repository root:

```powershell
Set-Location ..
py -3.12 -m venv .venv-worker
.\.venv-worker\Scripts\python.exe -m pip install --upgrade pip
.\.venv-worker\Scripts\python.exe -m pip install -r worker-requirements.txt
ollama pull qwen3:4b
Copy-Item .env.worker.example .env.worker.local
```

Configure `.env.worker.local` with the new project and worker identity:

```dotenv
SUPABASE_URL=https://<PROJECT_REF>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<NEW_PROJECT_PUBLISHABLE_KEY>
WORKER_EMAIL=<DEDICATED_WORKER_EMAIL>
WORKER_PASSWORD=<DEDICATED_RANDOM_PASSWORD>
WORKER_ID=<UNIQUE_MACHINE_NAME>
OLLAMA_MODEL=qwen3:4b
OLLAMA_URL=http://127.0.0.1:11434
POLL_SECONDS=8
SITE_URL=https://<NEW_VERCEL_DOMAIN>
VAPID_SUBJECT=https://<NEW_VERCEL_DOMAIN>
FLUXPROMPT_API_KEY=
```

Leave the FluxPrompt key blank during the initial build. Do not configure Drive-import variables yet.

The first use of each faster-whisper tier downloads its model from Hugging Face. Claude may pre-cache all three after confirming sufficient disk space:

```powershell
@'
from faster_whisper import WhisperModel
for model_name in ("small", "distil-large-v3", "medium.en"):
    print(f"Caching {model_name}...")
    WhisperModel(model_name, device="cpu", compute_type="int8")
print("All transcription models are cached.")
'@ | .\.venv-worker\Scripts\python.exe -
```

Run the local smoke test:

```powershell
.\.venv-worker\Scripts\python.exe verify-local-stack.py verification-sample.mp3
```

It must produce a transcript and an Ollama summary without contacting a paid AI API.

### 9. Install dependable Windows startup

From the repository root:

```powershell
.\install-worker-task.ps1
```

Approve the Administrator prompt. The installer registers `AudioTranscriberWorker` as a hidden `SYSTEM` task with startup, logon, and five-minute recovery triggers. It supervises Ollama and the Python worker and prevents duplicate cross-session workers.

Verify:

```powershell
Get-ScheduledTask -TaskName AudioTranscriberWorker
Get-ScheduledTaskInfo -TaskName AudioTranscriberWorker
Invoke-WebRequest https://<NEW_VERCEL_DOMAIN>/api/worker-health
```

The task should be `Running`, and the health route should return HTTP 200 with `{"status":"online"}` after the heartbeat appears.

### 10. Run the acceptance test

Use a disposable normal user account, not the worker account:

1. Sign in to the deployed website.
2. Upload `verification-sample.mp3` using Fast.
3. Confirm the job changes from upload to waiting, transcription, notes creation, and Ready.
4. Open the result and verify transcript, summary, key points, and copy/download actions.
5. Confirm the dashboard still shows the saved result after signing out and back in.
6. Confirm the corresponding private Storage object is deleted after success.
7. Confirm another normal account cannot read the first account's rows or Storage objects.

Do not call the installation complete until this path passes:

```text
browser -> private Storage -> durable queue -> local Whisper -> local Ollama
        -> saved private result -> source-object deletion -> authenticated result page
```

## Secret and identifier placement

| Value | Correct location | Never place in |
|---|---|---|
| Supabase project URL | Vercel env, `web/.env.local`, `.env.worker.local` | Hard-coded fork changes |
| Supabase publishable key | Vercel env, `web/.env.local`, `.env.worker.local` | No restriction beyond normal config, but do not confuse it with a secret key |
| Supabase secret/service-role key | Temporary admin operation only, if truly required | Browser, Vercel public env, worker env, Git, chat, logs |
| Worker password | `.env.worker.local` | Vercel, Git, chat, logs |
| VAPID private key | `.worker-secrets/` | Supabase, Vercel, Git, chat |
| FluxPrompt key | `.env.worker.local`, optional later | Browser, Supabase, Vercel, Git, chat |
| GitHub export token | `.worker-secrets/`, optional later | Initial build, Git, chat |

Before every commit, run:

```powershell
git status --short
git check-ignore -v .env.worker.local .worker-secrets web/.env.local
```

## Optional phases after the core passes

### Phase 2 — Browser notifications

The worker can generate a VAPID key and publish only the public key. Verify notification permission and delivery on a real browser/device. Losing the private VAPID key requires users to subscribe again.

### Phase 3 — Email notifications

Choose an email provider or create a new FluxPrompt Email Agent owned by the new operator. Never reuse Justin's API key or flow. Set the provider configuration only in `.env.worker.local`, restart the worker, and test an owner-approved address.

### Phase 4 — External worker monitoring

Personalize `.github/workflows/worker-health-monitor.yml` for the new production URL and GitHub owner. Confirm repository visibility and GitHub Actions billing implications before enabling it. GitHub scheduled workflows are best-effort, not a prompt outage SLA.

### Phase 5 — Drive and course-archive automation

Treat this as a separate project. The tracked implementation contains Justin-specific course codes, schedules, repository mappings, owner email assumptions, and public-publication rules. Before enabling it, Claude must redesign those values for the new owner, choose whether notes/audio are private or public, obtain recording consent, provision a least-privileged GitHub token, and run a dry audit. See `docs/DRIVE-GITHUB-AUTOMATION.md` only after the private core is accepted.

### Phase 6 — OpenWhispr/Speaches

This is a separate private OpenAI-compatible transcription endpoint and is not used by Class Scribe. Do not install it unless the new owner independently needs that API. See `docs/OPENWHISPR.md`.

## Ready-to-paste Claude prompt

Give Claude access to the new owner's fork on the Windows computer, then paste this prompt:

```text
Your goal is to install a completely independent Class Scribe transcription service from this repository for its new owner.

Read these files completely before acting:
1. AGENTS.md
2. docs/FRIEND-SETUP-GUIDE.md
3. docs/PRODUCT.md
4. docs/ARCHITECTURE.md
5. docs/DATABASE.md
6. docs/LOCAL-WORKER.md
7. docs/SECURITY.md
8. docs/DEPLOYMENT.md

This is a clean installation, not maintenance of Justin's production deployment. Never connect to or reuse any existing DrFunDip72 Supabase project, Vercel project, worker user, API key, Google Drive, FluxPrompt flow, GitHub course repository, domain, project reference, or secret. Search for owner-specific defaults before provisioning and replace only what the new installation requires.

Initial scope is the private core only:
- the new owner's GitHub fork;
- a new Supabase project with committed migrations, Auth, private Storage, RLS, queue, and a dedicated least-privileged worker user;
- a new Vercel project rooted at web/;
- the Windows Python worker with FFmpeg, faster-whisper CPU INT8, and Ollama qwen3:4b;
- the SYSTEM startup/recovery task;
- one verified end-to-end upload, transcription, summary, saved result, and source deletion.

Do not initially enable or customize FluxPrompt email, Web Push acceptance, GitHub outage monitoring, Google Drive ingestion, public course repositories/audio, weekly audits, OpenWhispr/Speaches, Notion, or other integrations. Their code may remain present but unconfigured.

Work autonomously within that scope. Use committed migrations; do not recreate the schema by hand and never reset a linked remote database. Preserve RLS and private Storage. Use the Supabase publishable key in browser/worker configuration and never put a secret/service-role key in NEXT_PUBLIC variables, the worker environment, Git, logs, or chat. The worker must authenticate as its own normal Auth user with app_metadata.role=worker.

Before running migrations or starting the app, verify the Git remote belongs to the new owner, verify the linked Supabase project, verify the linked Vercel project, and compare required environment-variable names without printing their values. Pause only for unavoidable human checkpoints: account creation/login, secret entry, recording consent, or Windows UAC. Tell the owner exactly what to click or enter, then continue after confirmation.

Use Python 3.12 for .venv-worker, install pinned requirements, install/verify FFmpeg and Ollama, pull qwen3:4b, cache the three Whisper models, run the local stack smoke test, and install AudioTranscriberWorker as SYSTEM. Keep the computer outbound-only; do not open ports, add a public tunnel, or expose Ollama.

Verify proportionally at every boundary: migration list/advisors, npm lint/build, local login, Vercel production pages, worker heartbeat, scheduled-task configuration, and a real end-to-end sample. Create a second temporary normal account to prove cross-account row and Storage isolation, then remove disposable test data safely. Do not claim completion without evidence.

Keep documentation current. Record exactly what was configured and tested without recording credentials. Finish with: production URL, GitHub repository URL, Supabase project name/reference, worker task state, model list, acceptance-test outcome, optional features deliberately left disabled, and any owner action still required.
```

## Completion checklist

- [ ] `origin` belongs to the new owner.
- [ ] New Supabase project linked; all migrations applied.
- [ ] RLS and private `recordings` bucket verified.
- [ ] New normal user can sign in.
- [ ] Dedicated worker user has protected `app_metadata.role=worker`.
- [ ] No secret/service-role key exists in browser or worker configuration.
- [ ] Vercel project uses `web/` and the new Supabase public values.
- [ ] Production Auth URLs point to the new domain.
- [ ] Python 3.12 virtual environment and pinned worker requirements installed.
- [ ] FFmpeg, Ollama, `qwen3:4b`, and all three Whisper models verified.
- [ ] `AudioTranscriberWorker` runs as `SYSTEM` with recovery triggers.
- [ ] Production worker-health route reports online.
- [ ] End-to-end sample completes and is saved privately.
- [ ] Processed Storage media is deleted.
- [ ] Two-account isolation test passes.
- [ ] Optional owner-specific automations remain disabled.
- [ ] Ignored secret files are not tracked.

## Ongoing operation

- Keep the Windows computer powered on and prevent sleep during processing.
- Allow Windows to start automatically after power restoration if the hardware supports that BIOS/UEFI setting.
- Pull reviewed repository updates, run tests, and use forward database migrations.
- Back up the VAPID private key only after browser notifications are enabled.
- Never commit local environments, tokens, private keys, recordings, transcripts, or model caches.
- Obtain consent and follow school/workplace rules before recording or sharing other people's voices.
