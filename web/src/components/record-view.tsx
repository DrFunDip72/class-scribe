"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, CircleStop, Loader2, Mic, MoonStar, Plus, Trash2, UploadCloud } from "lucide-react";
import { recordingSupported } from "@/lib/recording/use-recorder";
import { useClassRecorder } from "@/components/recorder-provider";
import { useWorkspace } from "@/components/workspace-provider";

const AUTO_STOP_CHOICES = [
  { value: "0", label: "No limit" },
  { value: "50", label: "50 minutes" },
  { value: "75", label: "75 minutes" },
  { value: "110", label: "110 minutes" },
  { value: "custom", label: "Custom…" },
] as const;

const MAX_CUSTOM_MINUTES = 360;

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
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supported = useSyncExternalStore(subscribeToNothing, recordingSupported, assumeSupported);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [limitChoice, setLimitChoice] = useState<string>("0");
  const [customMinutes, setCustomMinutes] = useState("90");

  // Leaving the Record screen dismisses the upload confirmation, so coming
  // back lands on the class picker ready for the next class.
  const { clearCompleted } = recorder;
  useEffect(() => clearCompleted, [clearCompleted]);

  // Default to whichever class was recorded most recently. That beats any
  // fixed order and needs no timetable to be set up.
  const lastUsedId = useMemo(
    () => workspace.jobs.find((job) => job.class_id)?.class_id ?? null,
    [workspace.jobs],
  );

  const classes = workspace.classes;
  const activeId = selectedId && classes.some((item) => item.id === selectedId)
    ? selectedId
    : (lastUsedId && classes.some((item) => item.id === lastUsedId) ? lastUsedId : classes[0]?.id ?? null);
  const active = classes.find((item) => item.id === activeId) ?? null;

  const customValue = Number(customMinutes);
  const customValid = Number.isFinite(customValue) && customValue >= 1 && customValue <= MAX_CUSTOM_MINUTES;
  const autoStopMinutes = limitChoice === "custom"
    ? (customValid ? customValue : null)
    : Number(limitChoice) || null;
  const blockedByCustom = limitChoice === "custom" && !customValid;

  if (recorder.stage === "recording") {
    return <section className="record-stage">
      <div className="record-live-head"><span className="recorder-dot" aria-hidden="true" /><span>Recording</span></div>
      <h1>{recorder.activeClassName ?? "Class"}</h1>
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

  // Shown from the moment recording stops until the upload settles, so the
  // class picker never reappears in between.
  if (recorder.stage === "saving") {
    const uploading = workspace.uploadState === "uploading";
    return <section className="record-stage">
      <Loader2 size={38} className="spin record-saving-icon" />
      <h1>Saving your recording</h1>
      <p className="record-meta">
        {uploading ? `Uploading · ${Math.round(workspace.uploadProgress * 100)}%` : "Preparing the audio"}
      </p>
      {uploading ? <div className="progress-track record-saving-progress">
        <span style={{ width: `${workspace.uploadProgress * 100}%` }} />
      </div> : null}
      <p className="record-hint">Keep the app open until this finishes.</p>
    </section>;
  }

  if (recorder.stage === "done" && recorder.completed) {
    const { completed } = recorder;
    return <section className="record-stage">
      <span className="record-done-icon"><CheckCircle2 size={34} /></span>
      <h1>Uploaded</h1>
      <p className="record-meta">
        {completed.className} · {completed.recordedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
      </p>
      <p className="record-hint">Your notes are being created. You can close the app.</p>
      <button type="button" className="button button-primary button-full button-large" onClick={recorder.clearCompleted}>
        <Mic size={19} /> Record another class
      </button>
      <Link className="button button-full button-secondary" href={completed.jobId ? `/jobs/${completed.jobId}` : "/recordings"}>
        See notes <ArrowRight size={17} />
      </Link>
    </section>;
  }

  function pickFiles(files: File[]) {
    if (!files.length) return;
    workspace.stageFiles(files);
    router.push("/upload");
  }

  if (!supported) {
    return <section className="page-section">
      <h1 className="page-title">Record a class</h1>
      <p className="empty-note">Recording isn’t available in this browser. Use the latest Chrome on Android, or <Link className="text-inline-link" href="/upload">upload a file</Link> instead.</p>
    </section>;
  }

  return <section className="page-section">
    <h1 className="page-title">Record a class</h1>
    <p className="page-subtitle">Pick the class, hit record, then lock your phone.</p>

    {recorder.error ? <p className="inline-alert error" role="alert">
      <AlertCircle size={16} /> {recorder.error}
    </p> : null}

    {!workspace.activeWorker ? <p className="inline-alert warning" role="status">
      <AlertCircle size={16} /> Processing is paused right now. Recordings still upload safely and your notes will be ready once it resumes.
    </p> : null}

    {recorder.recoverable.length ? <div className="recorder-recovery">
      <strong><AlertCircle size={15} /> Unfinished recording{recorder.recoverable.length === 1 ? "" : "s"} on this device</strong>
      {recorder.recoverable.map((session) => <div key={session.id} className="recorder-recovery-row">
        <div>
          <strong>{session.className}</strong>
          <small>{new Date(session.startedAt).toLocaleString()} · {formatSize(session.bytes)}</small>
        </div>
        <div className="recorder-recovery-actions">
          <button type="button" className="button button-small button-primary" disabled={recorder.busy} onClick={() => void recorder.uploadRecoverable(session)}>
            <UploadCloud size={15} /> Upload
          </button>
          <button type="button" className="ghost-button" disabled={recorder.busy} onClick={() => void recorder.discardRecoverable(session)} aria-label={`Discard ${session.className} recording`}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>)}
    </div> : null}

    {classes.length === 0
      ? <div className="empty-state">
        <Mic />
        <h3>Add your first class</h3>
        <p>Classes keep your recordings organised. Add as many as you need.</p>
        <Link className="button button-primary" href="/classes"><Plus size={17} /> Add a class</Link>
      </div>
      : <>
        <fieldset className="recorder-classes" disabled={recorder.busy}>
          <legend>Class</legend>
          <div className="recorder-class-options">
            {classes.map((item) => <label
              key={item.id}
              className={`recorder-class-option ${activeId === item.id ? "selected" : ""}`}
            >
              <input
                type="radio"
                name="recorder-class"
                value={item.id}
                checked={activeId === item.id}
                onChange={() => setSelectedId(item.id)}
              />
              <span>{item.name}</span>
            </label>)}
          </div>
        </fieldset>

        <div className="recorder-limit-group">
          <label className="recorder-limit">
            <span>Stop automatically after</span>
            <select value={limitChoice} disabled={recorder.busy} onChange={(event) => setLimitChoice(event.target.value)}>
              {AUTO_STOP_CHOICES.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
            </select>
          </label>
          {limitChoice === "custom" ? <label className="recorder-custom-limit">
            <span className="sr-only">Custom length in minutes</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_CUSTOM_MINUTES}
              value={customMinutes}
              disabled={recorder.busy}
              onChange={(event) => setCustomMinutes(event.target.value)}
              aria-invalid={!customValid}
            />
            <em>minutes</em>
          </label> : null}
          {blockedByCustom ? <p className="field-note">Enter between 1 and {MAX_CUSTOM_MINUTES} minutes.</p> : null}
        </div>

        <button
          type="button"
          className="button button-primary button-full button-large recorder-start"
          disabled={recorder.busy || blockedByCustom || !active}
          onClick={() => { if (active) recorder.start({ target: active, autoStopMinutes }); }}
        >
          {recorder.busy ? <><Loader2 size={19} className="spin" /> Working…</> : <><Mic size={19} /> Start recording</>}
        </button>

        <p className="record-alt"><Link className="text-inline-link" href="/classes">Manage classes</Link></p>
      </>}

    {/* Picking here keeps the file dialog inside the click that opens it. */}
    <input
      ref={fileInputRef}
      className="sr-only"
      type="file"
      multiple
      accept=".mp3,.m4a,.wav,.flac,.ogg,.webm,.mp4,.mov,.m4v,.mkv,audio/*,video/mp4,video/webm,video/quicktime,video/x-m4v,video/x-matroska"
      onChange={(event) => pickFiles(Array.from(event.target.files ?? []))}
    />
    <p className="record-alt">
      <button type="button" className="text-inline-link" onClick={() => fileInputRef.current?.click()}>
        Upload a file instead
      </button>
    </p>
  </section>;
}
