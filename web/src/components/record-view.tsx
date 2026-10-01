"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, CircleStop, Loader2, Mic, MoonStar, Trash2, UploadCloud } from "lucide-react";
import { courseName, coursesForToday, type CourseCode } from "@/lib/courses";
import { recordingSupported } from "@/lib/recording/use-recorder";
import { useClassRecorder } from "@/components/recorder-provider";
import { useWorkspace } from "@/components/workspace-provider";

const AUTO_STOP_CHOICES = [
  { value: 0, label: "No limit" },
  { value: 50, label: "50 min" },
  { value: 75, label: "75 min" },
  { value: 110, label: "110 min" },
] as const;

const subscribeToNothing = () => () => {};
const assumeSupported = () => true;

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

export function RecordView() {
  const recorder = useClassRecorder();
  const workspace = useWorkspace();
  const supported = useSyncExternalStore(subscribeToNothing, recordingSupported, assumeSupported);
  const { meeting, other } = coursesForToday();
  const showsTodayBadge = meeting.length > 0 && other.length > 0;
  const [courseCode, setCourseCode] = useState<CourseCode>((meeting[0] ?? other[0]).code);
  const [autoStopMinutes, setAutoStopMinutes] = useState(0);

  // 2. Recording — a full-screen state with nothing competing for attention.
  if (recorder.status === "recording") {
    return <section className="record-stage recording">
      <div className="record-live-head">
        <span className="recorder-dot" aria-hidden="true" />
        <span>Recording</span>
      </div>
      <h1>{recorder.activeCourse ? courseName(recorder.activeCourse) : "Class"}</h1>
      <p className="record-timer">{formatElapsed(recorder.elapsedMs)}</p>
      <p className="record-meta">
        {formatSize(recorder.storedBytes)} saved
        {recorder.autoStopMinutes ? ` · stops after ${recorder.autoStopMinutes} min` : ""}
      </p>
      <p className="record-hint">
        <MoonStar size={16} /> Safe to lock your screen. Keep Class Scribe open and don’t swipe it away.
      </p>
      <button type="button" className="button button-primary button-full button-large" onClick={recorder.stop}>
        <CircleStop size={19} /> Finish and upload
      </button>
    </section>;
  }

  // 3. Done — exactly two next steps.
  if (recorder.completed) {
    const { completed } = recorder;
    return <section className="record-stage done">
      <span className="record-done-icon"><CheckCircle2 size={34} /></span>
      <h1>Uploaded</h1>
      <p className="record-meta">
        {courseName(completed.courseCode)} · {completed.recordedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
      </p>
      <p className="record-hint">Your notes are being created. You can close the app.</p>
      <button type="button" className="button button-primary button-full button-large" onClick={recorder.clearCompleted}>
        <Mic size={19} /> Record another class
      </button>
      {completed.jobId
        ? <Link className="button button-full button-secondary" href={`/jobs/${completed.jobId}`}>
          See notes <ArrowRight size={17} />
        </Link>
        : <Link className="button button-full button-secondary" href="/recordings">
          See all notes <ArrowRight size={17} />
        </Link>}
    </section>;
  }

  if (!supported) {
    return <section className="page-section">
      <h1 className="page-title">Record a class</h1>
      <p className="empty-note">Recording isn’t available in this browser. Use the latest Chrome on Android, or <Link className="text-inline-link" href="/upload">upload a file</Link> instead.</p>
    </section>;
  }

  // 1. Pick a class and start.
  return <section className="page-section">
    <h1 className="page-title">Record a class</h1>
    <p className="page-subtitle">Pick the class, hit record, then lock your phone.</p>

    {recorder.error ? <p className="inline-alert error" role="alert">
      <AlertCircle size={16} /> {recorder.error}
    </p> : null}

    {!workspace.activeWorker ? <p className="inline-alert warning" role="status">
      <AlertCircle size={16} /> The transcription computer is offline. Recordings still upload and will process when it’s back.
    </p> : null}

    {recorder.recoverable.length ? <div className="recorder-recovery">
      <strong><AlertCircle size={15} /> Unfinished recording{recorder.recoverable.length === 1 ? "" : "s"} on this device</strong>
      {recorder.recoverable.map((session) => <div key={session.id} className="recorder-recovery-row">
        <div>
          <strong>{courseName(session.courseCode)}</strong>
          <small>{new Date(session.startedAt).toLocaleString()} · {formatSize(session.bytes)}</small>
        </div>
        <div className="recorder-recovery-actions">
          <button type="button" className="button button-small button-primary" disabled={recorder.busy} onClick={() => void recorder.uploadRecoverable(session)}>
            <UploadCloud size={15} /> Upload
          </button>
          <button type="button" className="ghost-button" disabled={recorder.busy} onClick={() => void recorder.discardRecoverable(session)} aria-label={`Discard ${courseName(session.courseCode)} recording`}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>)}
    </div> : null}

    <fieldset className="recorder-classes" disabled={recorder.busy}>
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
      <select value={autoStopMinutes} disabled={recorder.busy} onChange={(event) => setAutoStopMinutes(Number(event.target.value))}>
        {AUTO_STOP_CHOICES.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </select>
    </label>

    <button
      type="button"
      className="button button-primary button-full button-large recorder-start"
      disabled={recorder.busy}
      onClick={() => recorder.start({ courseCode, autoStopMinutes: autoStopMinutes || null })}
    >
      {recorder.busy
        ? <><Loader2 size={19} className="spin" /> Working…</>
        : <><Mic size={19} /> Start recording</>}
    </button>

    <p className="record-alt"><Link className="text-inline-link" href="/upload">Upload a file instead</Link></p>
  </section>;
}
