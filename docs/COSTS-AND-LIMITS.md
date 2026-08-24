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
| Web Push | Browser/vendor push services + local signing | $0 |

No paid AI API is used.

Web Push adds a few small Postgres rows per browser and delivery but no paid API or Vercel Function. Its practical limits are browser/OS policy and the existing Supabase database quota, not a per-notification bill. Delivery is best-effort: battery-saving, Focus/Do Not Disturb, revoked permission, browser background restrictions, or a vendor outage can delay or suppress the visible toast.

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

Direct audio files remain limited to 50 MB. A source video may be larger because the browser reads it from the local device, strips the video track, and uploads only 16 kHz mono AAC at 48 kbps. That rate is roughly 22 MB of codec data per hour plus small container overhead, so a typical 30-60 minute class should fit comfortably. The derived M4A is still rejected if it exceeds 50 MB; as a conservative rule, split unusually long recordings around two hours or more.

Because processed audio is deleted, storage capacity is primarily the live queue. A worst-case 20-file batch can still approach the full 1 GB Storage quota if every derived/direct audio file is near 50 MB, but ordinary class video now consumes audio-sized storage rather than video-sized storage. Upload and Supabase egress still count against the Free quotas.

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

### Browser video preparation

- Video sources are processed one at a time before upload; queue submission waits for all selected files to prepare and upload.
- Source data is read lazily with an 8 MiB cache, but the finished M4A output is held in browser memory before upload.
- Encoding time depends on the user's CPU, browser codec support, source resolution/codec, and recording length.
- MP4, WebM, MOV, M4V, and MKV containers are accepted, but an unsupported audio codec or a video with no audio track is rejected with a browser-side error.
- The open-source Mediabunny and AAC encoder packages add no usage fee.

### Browser notifications

- A user must explicitly grant permission from a button click; the website cannot bypass a browser denial.
- Each browser profile/device is a separate subscription. Clearing site data, disabling browser notifications, or rotating the VAPID key requires enabling again.
- Windows Chrome and Edge provide the intended over-other-applications experience. Operating-system Focus/Do Not Disturb settings always take precedence.
- On iPhone/iPad, Web Push requires installing the site to the Home Screen before permission can be requested. Platform support and behavior can change.
- Payloads are intentionally tiny and contain no private class content. Durable delivery rows are small but should be pruned later if volume becomes material.

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
