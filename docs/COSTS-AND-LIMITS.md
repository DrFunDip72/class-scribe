# Costs and Limits

**Checked:** 2026-08-23. Platform limits can change; verify official pricing before expanding use.

## Current monthly cost

| Component | Plan | Current cost |
|---|---|---:|
| Vercel | Hobby | $0 |
| Supabase | Free | $0 |
| GitHub | Free | $0 |
| faster-whisper / CTranslate2 | Local open-source runtime | $0 |
| Ollama / qwen3:4b | Local runtime/model | $0 |
| Local computer | Existing hardware | Electricity only |
| Custom domain | Not used | $0 |
| Email delivery | Deferred | $0 |

No paid AI API is used.

## Limits that matter

### Supabase Free

- 50,000 monthly active users.
- 500 MB database-size quota (read-only behavior above quota).
- 1 GB file Storage.
- 5 GB egress and 5 GB cached egress per month.
- 50 MB maximum upload on Free; the app and bucket both enforce this.
- Two active free projects per eligible account/organization context.
- Low-activity free projects may be paused after about seven days and can be restored from the dashboard.
- Leaked-password protection is not included on Free.

Class recordings are commonly larger than 50 MB when uncompressed. Export as MP3/M4A at speech-friendly bitrate before upload. Because processed audio is deleted, storage capacity is primarily the live queue. A worst-case 20-file batch can approach the full 1 GB Storage quota, so avoid submitting 20 files near 50 MB each. Twelve short compressed videos should normally be much smaller, but actual file sizes determine usage.

### Vercel Hobby

- Personal, non-commercial use only.
- 100 GB typical monthly Fast Data Transfer guideline.
- 1,000,000 Edge Requests and 1,000,000 Function Invocations included.
- 4 active CPU-hours, 360 GB-hours provisioned memory, and up to 60-second configured Function duration.
- 100 deployments per day, one concurrent build.
- Hobby service can pause when included usage is exhausted.

This app does not upload audio to Vercel or run AI in Functions, so its heaviest work does not consume Vercel compute.

### GitHub Free

- Unlimited public/private repositories and collaborators.
- 2,000 Actions minutes per month for private-repository hosted runners.
- 500 MB GitHub Packages storage.

This project does not require GitHub Actions to operate.

### Local worker

- One recording at a time by design.
- Processing stops while the computer is off, asleep, offline, or signed out before the task starts.
- Queue durability is cloud-hosted, so work waits safely.
- CPU inference duration depends on recording length/audio quality; benchmark real 30- and 60-minute classes before estimating completion times.

## Cost triggers

Do not enable these without an explicit new decision: Vercel Pro, Supabase Pro/add-ons, paid email service, custom domain, cloud AI APIs, cloud GPU workers, or paid overages.

## Official references

- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/billing-on-supabase
- https://supabase.com/docs/guides/storage/uploads/file-limits
- https://supabase.com/docs/guides/platform/free-project-pausing
- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/limits/fair-use-guidelines
- https://docs.github.com/en/get-started/learning-about-github/githubs-plans
