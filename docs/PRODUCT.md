# Product Specification

## Goal

Give students a simple account-based website that converts class recordings into saved transcripts, summaries, key points, and action items without paid AI inference.

## Core experience

1. Create an email/password account and enter the dashboard immediately; sign-up confirmation email is disabled.
2. Drag or select one to 20 audio or video class recordings.
3. Let the browser strip video locally when needed, then upload only the compact audio privately and leave it queued.
4. The owner's Windows computer processes the oldest job one at a time.
5. Return to a dashboard showing status and saved study notes.
6. Copy or download a completed result.

## Constraints

- Typical recording: 30-60 minutes.
- Direct audio maximum: 50 MB per file on Supabase Free.
- Video input: MP4, WebM, MOV, M4V, and MKV. The original source may exceed 50 MB because it stays on the device; its extracted audio must be 50 MB or less.
- Direct audio input: MP3, M4A, WAV, FLAC, and OGG.
- Video output: mono 16 kHz AAC at 48 kbps in an M4A container, processed one source at a time.
- Current browser recommendation: an up-to-date Chrome or Edge, especially for less common source codecs.
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

The initial release is accepted when an authenticated production user can upload up to 20 recordings, locally reduce video to audio without uploading the original, observe durable sequential processing, survive worker interruption through lease recovery, and privately retrieve saved results.
