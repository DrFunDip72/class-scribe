"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertCircle, Archive, ArchiveRestore, ArrowRight, Check, CheckCheck, ClipboardCheck, Clock3, FileAudio, LoaderCircle, RotateCcw } from "lucide-react";
import { COURSES, courseName, type CourseCode } from "@/lib/courses";
import { getTranscriptionTier } from "@/lib/transcription-tiers";
import { useWorkspace, type Job, type RecordingState } from "@/components/workspace-provider";

type Filter = "todo" | "done" | "archived" | "all";

/**
 * Recordings made in the app are named `<COURSE>_<YYYY-MM-DD>.<ext>`, so the
 * course can be read straight off the filename. A dedicated column on
 * `transcription_jobs` would be sturdier and is the planned follow-up; until
 * then uploaded files simply fall into "Other recordings".
 */
function courseOf(job: Job): CourseCode | null {
  const name = job.original_filename.toUpperCase();
  return COURSES.find((course) => name.startsWith(course.code))?.code ?? null;
}

function lectureDateOf(job: Job) {
  const match = job.original_filename.match(/(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  return new Date(job.created_at).toISOString().slice(0, 10);
}

function readableDate(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return "Today";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function relativeTime(value: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function copiedLabel(state: RecordingState | null) {
  if (!state) return null;
  if (state.everything_copied_at) return "Everything copied";
  if (state.summary_copied_at && state.transcript_copied_at) return "Summary + transcript copied";
  if (state.summary_copied_at) return "Summary copied";
  if (state.transcript_copied_at) return "Transcript copied";
  return null;
}

function statusLabel(job: Job, state: RecordingState | null) {
  if (state?.archived_at) return "Archived";
  if (state?.done_at) return "Done";
  if (job.status === "uploading") return "Uploading";
  if (job.status === "queued") return "Waiting";
  if (job.status === "transcribing") return "Transcribing";
  if (job.status === "summarizing") return "Creating notes";
  if (job.status === "completed") return "Ready";
  return "Needs attention";
}

function progressLabel(job: Job) {
  if (job.status === "uploading") return "Waiting for this upload to finish";
  if (job.status === "queued") return "Waiting to start";
  if (job.status === "transcribing") return "Creating your transcript";
  if (job.status === "summarizing") return "Creating your study notes";
  if (job.status === "completed") return "Ready to review";
  if (job.error_code === "upload_failed") return "Upload interrupted — upload this recording again";
  return "We couldn't finish this recording";
}

export function RecordingsView() {
  const workspace = useWorkspace();
  const [filter, setFilter] = useState<Filter>("todo");
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => ({
    todo: workspace.jobs.filter((job) => !job.recording_user_states?.done_at && !job.recording_user_states?.archived_at).length,
    done: workspace.jobs.filter((job) => job.recording_user_states?.done_at && !job.recording_user_states?.archived_at).length,
    archived: workspace.jobs.filter((job) => job.recording_user_states?.archived_at).length,
    all: workspace.jobs.length,
  }), [workspace.jobs]);

  const visible = useMemo(() => workspace.jobs.filter((job) => {
    const state = job.recording_user_states;
    if (filter === "todo") return !state?.done_at && !state?.archived_at;
    if (filter === "done") return Boolean(state?.done_at) && !state?.archived_at;
    if (filter === "archived") return Boolean(state?.archived_at);
    return true;
  }), [workspace.jobs, filter]);

  // Course groups keep their configured order; anything unrecognised trails.
  const groups = useMemo(() => {
    const byCourse = new Map<string, { title: string; dates: Map<string, Job[]> }>();
    for (const job of visible) {
      const course = courseOf(job);
      const key = course ?? "__other";
      if (!byCourse.has(key)) {
        byCourse.set(key, { title: course ? courseName(course) : "Other recordings", dates: new Map() });
      }
      const group = byCourse.get(key)!;
      const dateKey = lectureDateOf(job);
      if (!group.dates.has(dateKey)) group.dates.set(dateKey, []);
      group.dates.get(dateKey)!.push(job);
    }
    const order = [...COURSES.map((course) => course.code as string), "__other"];
    return order
      .filter((key) => byCourse.has(key))
      .map((key) => {
        const group = byCourse.get(key)!;
        return {
          key,
          title: group.title,
          count: [...group.dates.values()].reduce((total, list) => total + list.length, 0),
          dates: [...group.dates.entries()].sort((a, b) => b[0].localeCompare(a[0])),
        };
      });
  }, [visible]);

  // Marking done clears any archive, and archiving implies done. Both match
  // the behaviour the previous dashboard shipped with.
  async function toggleDone(job: Job) {
    setError(await workspace.saveRecordingState(job, job.recording_user_states?.done_at
      ? { done_at: null, archived_at: null }
      : { done_at: new Date().toISOString(), archived_at: null }));
  }

  async function toggleArchive(job: Job) {
    setError(await workspace.saveRecordingState(job, job.recording_user_states?.archived_at
      ? { archived_at: null }
      : {
        done_at: job.recording_user_states?.done_at ?? new Date().toISOString(),
        archived_at: new Date().toISOString(),
      }));
  }

  const filters: Array<{ value: Filter; label: string; count: number }> = [
    { value: "todo", label: "To do", count: counts.todo },
    { value: "done", label: "Done", count: counts.done },
    { value: "archived", label: "Archived", count: counts.archived },
    { value: "all", label: "All", count: counts.all },
  ];

  return <section className="page-section">
    <h1 className="page-title">Your notes</h1>
    <p className="page-subtitle">Grouped by class, newest lecture first.</p>

    <div className="history-filters" aria-label="Filter recordings">
      {filters.map((item) => <button
        key={item.value}
        type="button"
        aria-pressed={filter === item.value}
        className={filter === item.value ? "active" : ""}
        onClick={() => setFilter(item.value)}
      >{item.label}<span>{item.count}</span></button>)}
    </div>

    {error ? <p className="inline-alert error" role="alert"><AlertCircle size={16} />{error}</p> : null}

    {workspace.loading
      ? <div className="empty-state compact"><LoaderCircle className="spin" /><p>Loading your recordings…</p></div>
      : workspace.jobs.length === 0
        ? <div className="empty-state"><FileAudio /><h3>No recordings yet</h3><p>Record a class and it will appear here.</p></div>
        : groups.length === 0
          ? <div className="empty-state compact"><CheckCheck /><h3>Nothing in this view</h3><p>Choose another filter.</p></div>
          : <div className="course-list">{groups.map((group) => <section className="course-group" key={group.key}>
            <header className="course-heading"><strong>{group.title}</strong><small>{group.count} recording{group.count === 1 ? "" : "s"}</small></header>
            {group.dates.map(([dateKey, dateJobs]) => <div className="date-group" key={dateKey}>
              <h3 className="date-heading">{readableDate(dateKey)}</h3>
              <div className="job-list">{dateJobs.map((job) => {
                const state = job.recording_user_states;
                const copied = copiedLabel(state);
                const busy = workspace.savingJobIds.includes(job.id);
                const tier = getTranscriptionTier(job.transcription_tier);
                return <article className={`job-row ${state?.done_at ? "done" : ""} ${state?.archived_at ? "archived" : ""}`} key={job.id}>
                  <div className={`job-status-icon ${job.status} ${state?.done_at ? "handled" : ""}`}>
                    {state?.done_at ? <CheckCheck size={18} />
                      : job.status === "completed" ? <Check size={18} />
                        : job.status === "failed" ? <AlertCircle size={18} />
                          : job.status === "queued" ? <Clock3 size={18} />
                            : <LoaderCircle className="spin" size={18} />}
                  </div>
                  <div className="job-info">
                    <div className="job-title">
                      <strong>{job.original_filename}</strong>
                      <span className={`status-pill status-${job.status}`}>{statusLabel(job, state)}</span>
                      <span className={`tier-pill tier-${tier.value}`}>{tier.label}</span>
                    </div>
                    <small>{progressLabel(job)} · {relativeTime(job.created_at)}</small>
                    {copied && <span className="copy-status"><ClipboardCheck size={13} />{copied}</span>}
                    {job.status !== "completed" && job.status !== "failed" && <div className="progress-track slim"><span style={{ width: `${job.progress}%` }} /></div>}
                  </div>
                  {job.status === "completed" ? <div className="job-actions">
                    <Link className="row-action" href={`/jobs/${job.id}`}>Open <ArrowRight size={15} /></Link>
                    <button className={`row-action state-action ${state?.done_at ? "active" : ""}`} type="button" disabled={busy} onClick={() => void toggleDone(job)}>
                      {state?.done_at ? <RotateCcw size={14} /> : <CheckCheck size={14} />}{state?.done_at ? "Undo" : "Done"}
                    </button>
                    {state?.done_at && <button className="row-action state-action" type="button" disabled={busy} onClick={() => void toggleArchive(job)}>
                      {state.archived_at ? <ArchiveRestore size={14} /> : <Archive size={14} />}{state.archived_at ? "Restore" : "Archive"}
                    </button>}
                  </div> : job.status === "failed" && job.attempt_count < 3
                    ? <button className="row-action" onClick={() => void workspace.retry(job.id).then(setError)}><RotateCcw size={14} /> Retry</button>
                    : <span className="percent">{job.progress}%</span>}
                </article>;
              })}</div>
            </div>)}
          </section>)}</div>}
  </section>;
}
