"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AlertCircle, CircleStop, Loader2, Mic, MoonStar, Trash2, UploadCloud } from "lucide-react";
import {
  courseName,
  coursesForToday,
  recordingFilename,
  type CourseCode,
} from "@/lib/courses";
import {
  assembleSession,
  deleteSession,
  listRecoverableSessions,
  markFinalized,
  type RecordingSession,
} from "@/lib/recording/recording-store";
import { extensionForMimeType, recordingSupported, useRecorder } from "@/lib/recording/use-recorder";

const AUTO_STOP_CHOICES = [
  { value: 0, label: "No limit" },
  { value: 50, label: "50 min" },
  { value: 75, label: "75 min" },
  { value: 110, label: "110 min" },
] as const;

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Feature detection must not run during server rendering, where MediaRecorder
// does not exist. Assuming support on the server keeps the markup stable.
const subscribeToNothing = () => () => {};
const assumeSupported = () => true;

export type RecordingHandoff = { file: File; courseCode: CourseCode; recordedAt: Date };

export function ClassRecorder({
  onRecordingReady,
  busy,
}: {
  onRecordingReady: (handoff: RecordingHandoff) => Promise<boolean>;
  busy: boolean;
}) {
  const supported = useSyncExternalStore(subscribeToNothing, recordingSupported, assumeSupported);
  const { meeting, other } = coursesForToday();
  const showsTodayBadge = meeting.length > 0 && other.length > 0;
  const [courseCode, setCourseCode] = useState<CourseCode>((meeting[0] ?? other[0]).code);
  const [autoStopMinutes, setAutoStopMinutes] = useState<number>(0);
  const [recoverable, setRecoverable] = useState<RecordingSession[]>([]);
  const [handingOff, setHandingOff] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);

  const handOff = useCallback(async (session: RecordingSession) => {
    setHandingOff(true);
    setHandoffError(null);
    try {
      const { blob } = await assembleSession(session.id);
      const recordedAt = new Date(session.startedAt);
      const file = new File(
        [blob],
        recordingFilename(session.courseCode, extensionForMimeType(session.mimeType), recordedAt),
        { type: session.mimeType, lastModified: session.startedAt },
      );
      const accepted = await onRecordingReady({ file, courseCode: session.courseCode, recordedAt });
      if (accepted) {
        // Only drop the local copy once the queue has accepted the upload.
        await markFinalized(session.id);
        await deleteSession(session.id);
        setRecoverable((current) => current.filter((item) => item.id !== session.id));
      } else {
        setRecoverable((current) => current.some((item) => item.id === session.id)
          ? current
          : [session, ...current]);
        setHandoffError("The upload did not finish. The recording is still saved on this device.");
      }
    } catch (caught) {
      setHandoffError(caught instanceof Error ? caught.message : "This recording could not be prepared.");
    } finally {
      setHandingOff(false);
    }
  }, [onRecordingReady]);

  const recorder = useRecorder({ onFinished: (session) => { void handOff(session); } });

  useEffect(() => {
    void listRecoverableSessions().then(setRecoverable).catch(() => {});
  }, []);

  async function discardRecoverable(session: RecordingSession) {
    await deleteSession(session.id);
    setRecoverable((current) => current.filter((item) => item.id !== session.id));
  }

  if (!supported) {
    return <section className="recorder-card">
      <div className="card-heading"><div><h2>Record a class</h2><p>Recording is not available in this browser. Use the latest Chrome on Android, or upload a file below.</p></div></div>
    </section>;
  }

  const recording = recorder.status === "recording";
  const starting = recorder.status === "starting";
  const finishing = recorder.status === "finishing" || handingOff;
  const locked = recording || starting || finishing || busy;
  const message = recorder.error ?? handoffError;

  return <section className="recorder-card">
    <div className="card-heading">
      <div>
        <h2>Record a class</h2>
        <p>Pick the class, hit record, and lock your phone. The recording keeps running with the screen off.</p>
      </div>
    </div>

    {message ? <p className="inline-alert error" role="alert"><AlertCircle size={16} /> {message}</p> : null}

    {recoverable.length ? <div className="recorder-recovery">
      <strong><AlertCircle size={15} /> Unfinished recording{recoverable.length === 1 ? "" : "s"} on this device</strong>
      {recoverable.map((session) => <div key={session.id} className="recorder-recovery-row">
        <div>
          <strong>{courseName(session.courseCode)}</strong>
          <small>{new Date(session.startedAt).toLocaleString()} · {formatSize(session.bytes)}</small>
        </div>
        <div className="recorder-recovery-actions">
          <button type="button" className="button button-small button-primary" disabled={locked} onClick={() => void handOff(session)}>
            <UploadCloud size={15} /> Upload
          </button>
          <button type="button" className="ghost-button" disabled={locked} onClick={() => void discardRecoverable(session)} aria-label={`Discard ${courseName(session.courseCode)} recording`}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>)}
    </div> : null}

    {recording ? <div className="recorder-live">
      <div className="recorder-live-head">
        <span className="recorder-dot" aria-hidden="true" />
        <div>
          <strong>{courseName(courseCode)}</strong>
          <small>{formatSize(recorder.storedBytes)} saved{autoStopMinutes ? ` · stops after ${autoStopMinutes} min` : ""}</small>
        </div>
      </div>
      <p className="recorder-timer" role="timer">{formatElapsed(recorder.elapsedMs)}</p>
      <p className="recorder-hint"><MoonStar size={15} /> Safe to lock the screen. Keep Class Scribe open and don’t swipe it away.</p>
      <button type="button" className="button button-primary button-full" onClick={recorder.stop}>
        <CircleStop size={17} /> Finish and upload
      </button>
    </div> : <>
      <fieldset className="recorder-classes" disabled={locked}>
        <legend>Class</legend>
        <div className="recorder-class-options">
          {[...meeting, ...other].map((course) => <label
            key={course.code}
            className={`recorder-class-option ${courseCode === course.code ? "selected" : ""}`}
          >
            <input
              type="radio"
              name="recorder-course"
              value={course.code}
              checked={courseCode === course.code}
              onChange={() => setCourseCode(course.code)}
            />
            <span>{course.name}</span>
            {/* On Wednesdays every course meets, so the badge would mark all four. */}
            {showsTodayBadge && meeting.some((item) => item.code === course.code) ? <em>Today</em> : null}
          </label>)}
        </div>
      </fieldset>

      <label className="recorder-limit">
        <span>Stop automatically after</span>
        <select
          value={autoStopMinutes}
          disabled={locked}
          onChange={(event) => setAutoStopMinutes(Number(event.target.value))}
        >
          {AUTO_STOP_CHOICES.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
        </select>
      </label>

      <button
        type="button"
        className="button button-primary button-full recorder-start"
        disabled={locked}
        onClick={() => void recorder.start({ courseCode, autoStopMinutes: autoStopMinutes || null })}
      >
        {starting || finishing
          ? <><Loader2 size={17} className="spin" /> {finishing ? "Preparing recording" : "Starting"}</>
          : <><Mic size={17} /> Start recording</>}
      </button>
    </>}
  </section>;
}
