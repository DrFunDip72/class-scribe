# Product Specification

## Goal

Give students a simple account-based website that converts class recordings into saved transcripts, summaries, key points, and action items without paid AI inference.

## Core experience

1. Create an email/password account and enter the dashboard immediately; sign-up confirmation email is disabled.
2. Drag or select one to 20 class recordings.
3. Upload privately and leave them queued.
4. The owner's Windows computer processes the oldest job one at a time.
5. Return to a dashboard showing status and saved study notes.
6. Copy or download a completed result.

## Constraints

- Typical recording: 30-60 minutes.
- Maximum: 50 MB per file on Supabase Free.
- Formats: MP3, M4A, MP4, WAV, FLAC, OGG, and WebM when FFmpeg/PyAV can decode them.
- Audio is private and deleted after successful processing.
- Text results remain associated with the user.
- Processing pauses while the Windows computer is unavailable; queued work remains durable.

## Required result

- Full transcript.
- Concise summary.
- Key points.
- Assignments/action items when present.
- Detected language and processing metadata.

## Deferred

- Email delivery through the owner's agent-builder API caller.
- Speaker diarization and live transcription.
- Paid cloud inference fallback.
- Teams, sharing, billing, and subscriptions.

## Acceptance

The initial release is accepted when an authenticated production user can upload up to 20 recordings, observe durable sequential processing, survive worker interruption through lease recovery, and privately retrieve saved results.
