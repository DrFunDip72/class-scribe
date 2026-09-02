# Product Specification

## Goal

Give students a simple account-based website that converts class recordings into saved transcripts, summaries, key points, and action items without paid AI inference.

## Core experience

1. Create an email/password account and enter the dashboard immediately; sign-up confirmation email is disabled.
2. Drag or select one to 20 audio or video class recordings.
3. Let the browser compress oversized audio or strip video locally, divide very long output into upload-safe parts, then upload only compact audio privately and leave one logical recording queued.
4. The owner's Windows computer processes the oldest job one at a time.
5. Return to a dashboard showing status and saved study notes.
6. Optionally enable an email, a persistent browser pop-up, or both for the completed batch or each completed recording.
7. Click the alert to open the finished result, then copy the summary, transcript, or complete notes—or download everything as Markdown. Successful copy choices remain checked across devices.
8. Explicitly mark handled recordings done, track progress across the upload batch, and archive finished work without deleting its notes.

The same workflow must remain usable on a phone without pinch-zooming or horizontal scrolling. Narrow layouts stack dense controls, preserve readable labels, and provide touch targets of at least 44 by 44 CSS pixels.

## Constraints

- Typical recording: 30-60 minutes.
- Audio/video source size: may exceed 50 MB. Any source above 50 MB is prepared locally; practical limits are the device's browser, memory, disk, and available Supabase quota.
- Storage object maximum: 50 MB on Supabase Free. Prepared output is divided into 90-minute M4A parts, up to 32 parts and 1 GB total per logical recording.
- Video input: MP4, WebM, MOV, M4V, and MKV. The original source stays on the device; only derived audio parts upload.
- Direct audio input: MP3, M4A, WAV, FLAC, and OGG.
- Prepared output: mono 16 kHz AAC at 48 kbps in an M4A container, processed and uploaded one source/part at a time.
- Current browser recommendation: an up-to-date Chrome or Edge, especially for less common source codecs.
- Audio is private and deleted after successful processing.
- Text results remain associated with the user.
- Processing pauses while the Windows computer is unavailable; queued work remains durable.
- Email and browser notifications are independent opt-in channels. Browser pop-ups require browser plus operating-system permission. Completion is never coupled to successful notification delivery.

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

The initial release is accepted when an authenticated production user can upload up to 20 recordings, locally reduce video or oversized audio without uploading the original, preserve one result across multipart processing, observe durable sequential processing, survive worker interruption through lease recovery, receive an opted-in completion alert, and privately retrieve saved results. Landing, authentication, dashboard, and result screens must also work at 320 CSS pixels without horizontal overflow or requiring the user to zoom out.
