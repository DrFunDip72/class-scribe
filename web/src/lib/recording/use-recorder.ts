"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CourseCode } from "@/lib/courses";
import { appendChunk, createSession, type RecordingSession } from "@/lib/recording/recording-store";

/**
 * A timeslice short enough that a crash costs seconds, long enough that the
 * IndexedDB write rate stays trivial over a 75-minute lecture.
 */
const TIMESLICE_MS = 5_000;

/** Speech-rate Opus. The upload pipeline re-encodes to mono 16 kHz 48 kbps AAC. */
const AUDIO_BITS_PER_SECOND = 48_000;

/**
 * MP4/AAC first. Recent Chrome can record it directly, which keeps a lecture
 * under the 50 MB object limit and lets it upload with no browser re-encode at
 * all. It also avoids re-reading a MediaRecorder WebM, whose streaming header
 * carries no duration. WebM/Opus remains the fallback and still converts
 * cleanly through the existing preparation path.
 */
const CANDIDATE_MIME_TYPES = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
];

export type RecorderStatus = "idle" | "starting" | "recording" | "finishing";

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export function extensionForMimeType(mimeType: string) {
  return mimeType.startsWith("audio/mp4") ? "m4a" : "webm";
}

/**
 * MediaRecorder reports its type with codec parameters, such as
 * `audio/mp4;codecs=mp4a.40.2`. Supabase Storage's allowed-type list and the
 * `queue_uploaded_recording` RPC both match exactly, so the parameters must be
 * dropped before the file reaches either.
 */
export function baseMimeType(mimeType: string) {
  return mimeType.split(";")[0].trim().toLowerCase();
}

export function recordingSupported() {
  return typeof navigator !== "undefined"
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof MediaRecorder !== "undefined"
    && typeof indexedDB !== "undefined"
    && pickMimeType() !== null;
}

/**
 * `onFinished` fires from the MediaRecorder stop event once every captured
 * timeslice is durably stored, which keeps the completion handoff out of a
 * React effect.
 */
export function useRecorder(options: { onFinished?: (session: RecordingSession) => void } = {}) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [session, setSession] = useState<RecordingSession | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [storedBytes, setStoredBytes] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const sessionRef = useRef<RecordingSession | null>(null);
  const chunkIndexRef = useRef(0);
  // Serializes IndexedDB writes so chunks are stored in recorded order.
  const writeChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const autoStopAtRef = useRef<number | null>(null);
  const autoStopTimerRef = useRef<number | null>(null);
  const stoppingRef = useRef(false);
  const onFinishedRef = useRef(options.onFinished);

  useEffect(() => { onFinishedRef.current = options.onFinished; });

  const releaseWakeLock = useCallback(() => {
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    if (sentinel) void sentinel.release().catch(() => {});
  }, []);

  const acquireWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
    } catch {
      // A denied wake lock is not fatal; recording continues with the screen off.
    }
  }, []);

  const teardown = useCallback(() => {
    if (autoStopTimerRef.current !== null) {
      window.clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    autoStopAtRef.current = null;
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    releaseWakeLock();
  }, [releaseWakeLock]);

  useEffect(() => teardown, [teardown]);

  // Display only. Background throttling of this interval is harmless because
  // stop decisions are made from timestamps inside `ondataavailable`.
  useEffect(() => {
    if (status !== "recording" || !session) return;
    const startedAt = session.startedAt;
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 1_000);
    return () => window.clearInterval(timer);
  }, [status, session]);

  // Android drops the screen wake lock whenever the page is hidden.
  useEffect(() => {
    if (status !== "recording") return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !wakeLockRef.current) void acquireWakeLock();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [status, acquireWakeLock]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || stoppingRef.current) return;
    stoppingRef.current = true;
    setStatus("finishing");
    if (recorder.state !== "inactive") recorder.stop();
  }, []);

  const start = useCallback(async (options: { courseCode: CourseCode; autoStopMinutes: number | null }) => {
    if (recorderRef.current) return;
    setError(null);
    setStatus("starting");
    stoppingRef.current = false;
    chunkIndexRef.current = 0;
    writeChainRef.current = Promise.resolve();

    const mimeType = pickMimeType();
    if (!mimeType) {
      setStatus("idle");
      setError("This browser cannot record audio. Try the latest Chrome on Android.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          // Tuned for a lecture room rather than a phone call: echo cancellation
          // and noise suppression are built for near-field speech and remove
          // audible detail from a distant speaker.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });
    } catch (caught) {
      setStatus("idle");
      const name = caught instanceof DOMException ? caught.name : "";
      setError(name === "NotAllowedError"
        ? "Microphone access was blocked. Allow the microphone for Class Scribe and try again."
        : "The microphone could not be opened. Close other recording apps and try again.");
      return;
    }

    // Best effort: keeps the browser from evicting stored chunks mid-lecture.
    try { await navigator.storage?.persist?.(); } catch { /* not required */ }

    let created: RecordingSession;
    try {
      created = await createSession({
        courseCode: options.courseCode,
        mimeType,
        autoStopMinutes: options.autoStopMinutes,
      });
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setStatus("idle");
      setError("This device would not allow Class Scribe to store the recording.");
      return;
    }

    const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
    recorderRef.current = recorder;
    streamRef.current = stream;
    sessionRef.current = created;
    autoStopAtRef.current = options.autoStopMinutes
      ? created.startedAt + options.autoStopMinutes * 60_000
      : null;

    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      const index = chunkIndexRef.current;
      chunkIndexRef.current += 1;
      writeChainRef.current = writeChainRef.current
        .then(() => appendChunk(created.id, index, event.data))
        .then((updated) => {
          sessionRef.current = updated;
          setStoredBytes(updated.bytes);
        })
        .catch(() => {
          setError("The device ran out of room for this recording. Stop and upload what you have.");
        });

      // Authoritative auto-stop. This event keeps firing while the screen is
      // off because it is driven by the capture pipeline, not by a JS timer.
      const stopAt = autoStopAtRef.current;
      if (stopAt !== null && Date.now() >= stopAt) stop();
    };

    recorder.onerror = () => {
      setError("Recording stopped unexpectedly. Upload what was captured so far.");
      stop();
    };

    stream.getAudioTracks().forEach((track) => {
      track.onended = () => {
        setError("The microphone was disconnected. Upload what was captured so far.");
        stop();
      };
    });

    recorder.onstop = () => {
      void (async () => {
        try {
          await writeChainRef.current;
        } catch {
          // Already surfaced by the append handler.
        }
        teardown();
        const finished = sessionRef.current;
        setSession(finished ? { ...finished } : null);
        setStatus("idle");
        stoppingRef.current = false;
        if (finished) onFinishedRef.current?.(finished);
      })();
    };

    recorder.start(TIMESLICE_MS);
    setSession(created);
    setStoredBytes(0);
    setElapsedMs(0);
    setStatus("recording");
    void acquireWakeLock();

    // Backstop in case timeslice events stall.
    if (options.autoStopMinutes) {
      autoStopTimerRef.current = window.setTimeout(stop, options.autoStopMinutes * 60_000 + 2_000);
    }
  }, [acquireWakeLock, stop, teardown]);

  return { status, session, elapsedMs, storedBytes, error, setError, start, stop };
}
