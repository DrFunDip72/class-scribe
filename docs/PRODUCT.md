# Product Specification

## Goal

Give students a simple account-based website that converts class recordings into saved transcripts, summaries, key points, and action items without paid AI inference.

## Core experience

1. Create an email/password account and enter the dashboard immediately; sign-up confirmation email is disabled.
2. Drag or select one to 20 audio or video class recordings.
3. Choose Fast, Balanced, or High transcription for the upload; the choice applies to every selected recording and shows a measured per-hour estimate.
4. Register the selected recordings, then prepare and upload them one at a time. As soon as one recording finishes uploading, make that logical recording available to the processing queue while later files continue uploading.
5. The owner's Windows computer processes the oldest job one at a time with the selected model.
6. Return to a dashboard showing plain-language progress and saved study notes; keep internal model names, raw pipeline stages, byte counts, and infrastructure terminology out of the normal client experience.
7. Optionally enable an email, a persistent browser pop-up, or both for the completed batch or each completed recording.
8. Click the alert to open the finished result, then copy the summary, transcript, or complete notes—or download everything as Markdown. Successful copy choices remain checked across devices.
9. Explicitly mark handled recordings done, track progress across the upload batch, and archive finished work without deleting its notes.
10. For the configured owner, accept a Monday/Wednesday recording from the `URecorder` Google Drive folder, reuse an existing matching upload or queue it automatically, and publish a validated summary-first note, structure-preserving formatted transcript, and verified public speech MP3 to the matching public course repository.

The same workflow must remain usable on a phone without pinch-zooming or horizontal scrolling. Narrow layouts stack dense controls, preserve readable labels, and provide touch targets of at least 44 by 44 CSS pixels.

## Constraints

- Typical recording: 30-60 minutes.
- Audio/video source size: may exceed 50 MB. Any source above 50 MB is prepared locally; practical limits are the device's browser, memory, disk, and available Supabase quota.
- Storage object maximum: 50 MB on Supabase Free. Prepared output is divided into 90-minute M4A parts, up to 32 parts and 1 GB total per logical recording.
- Video input: MP4, WebM, MOV, M4V, and MKV. The original source stays on the device; only derived audio parts upload.
- Direct audio input: MP3, M4A, WAV, FLAC, and OGG.
- Prepared output: mono 16 kHz AAC at 48 kbps in an M4A container, processed and uploaded one source/part at a time.
- Batch behavior: all logical jobs are registered before transfer so batch notifications remain accurate, but only a recording with a complete, validated part manifest can become `queued` and claimable.
- Current browser recommendation: an up-to-date Chrome or Edge, especially for less common source codecs.
- Audio is private and deleted after successful processing for normal users. The explicitly authorized owner-only Drive archive retains its original in Drive and publishes a metadata-stripped MP3 to the four public course repositories.
- Text results remain associated with the user.
- Processing pauses while the Windows computer is unavailable; queued work remains durable.
- Transcription tiers: Fast uses `small`/beam 1; Balanced uses `distil-large-v3`/beam 5 with previous-text conditioning disabled; High uses `medium.en`/beam 5. All run locally on CPU INT8, and Fast remains the default for old clients and existing jobs.
- Displayed estimates are rounded from this computer's PHIL 201 benchmark: about 10, 20, and 55 transcription minutes per recorded hour. Queue wait and summarization are additional and actual time varies.
- Email and browser notifications are independent opt-in channels. Browser pop-ups require browser plus operating-system permission. Completion is never coupled to successful notification delivery.
- Drive automation is owner-only, checks Drive hourly on Monday/Wednesday with one-day missed-scan catch-up, preserves the Drive source, and defaults to High transcription. Automated formatted-note and MP3 export is intentionally public only for HRM-391, PSE-390, STRAT-392, and PHIL-201.

## Required result

- Full transcript.
- A concise overview, usually 2-4 sentences and shorter when the source is extremely brief.
- Up to 14 scan-friendly key points in lecture order, emphasizing concepts, definitions, comparisons, and process steps without padding short lectures.
- Selective examples only when they materially clarify a concept.
- A final `Big takeaway` key point.
- Assignments/action items when present.
- Detected language and processing metadata.

## Result actions

- `Copy -> Summary` copies the overview, key points, and action items without the transcript.
- `Copy -> Transcript` copies only the title and full transcript.
- `Copy -> Everything` copies the complete study notes and transcript.
- `Download notes` continues to download everything as a Markdown file.
- A successful clipboard write records which target was copied. Copying `Everything` counts as both the summary and transcript for display purposes, but copying never marks a recording done automatically.
- `Mark done` is an explicit reversible check after the user has pasted or otherwise handled the recording. `Archive` hides a done recording from active work without deleting it; `Restore` and `Mark not done` are reversible.
- The dashboard defaults to `To do` and also provides `Done`, `Archived`, and `All` filters. Upload-batch headings report progress such as `8 of 12 done`, and `Archive done` hides every handled recording in that batch at once.
- On screens 640 CSS pixels wide or narrower, Copy choices open as a bottom action sheet that stays within the visible viewport and respects the device safe area. Tapping outside, the close control, or pressing Escape dismisses it.

## Completion notifications

- Default: one privacy-safe alert after every recording in an upload batch reaches a terminal state.
- Optional: one alert after each recording instead.
- Optional failure alerts remain enabled by default.
- The shared batch/per-recording and failure preferences apply to every enabled channel.
- Emails go only to the signed-in account address. They use a branded responsive HTML template with a generic sign-in link to the private dashboard.
- Emails and browser alerts contain no recording filename, transcript, summary, or signed media URL.
- Chrome or Edge on Windows is the recommended path. The browser may be closed after permission and subscription are established, subject to browser and operating-system background-notification settings.

## Deferred

- Speaker diarization and live transcription.
- Paid cloud inference fallback.
- Teams, sharing, billing, and subscriptions.

## Acceptance

The initial release is accepted when an authenticated production user can upload up to 20 recordings, select and later identify one of the three validated transcription tiers, locally reduce video or oversized audio without uploading the original, preserve one result across multipart processing, observe durable sequential processing, survive worker interruption through lease recovery, receive an opted-in completion alert, and privately retrieve saved results. Landing, authentication, dashboard, and result screens must also work at 320 CSS pixels without horizontal overflow or requiring the user to zoom out.
