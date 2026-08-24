# Class Scribe Web

Next.js 16 frontend for Class Scribe. It uses Supabase SSR for Auth and account data, uploads audio directly from the authenticated browser to private Supabase Storage, and registers a root service worker for user-opted persistent Web Push completion alerts.

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Required public environment names:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Run `npm run lint` and `npm run build` before deployment. The production project root in Vercel is this `web/` directory.
