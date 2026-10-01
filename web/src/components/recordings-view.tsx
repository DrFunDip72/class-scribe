"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertCircle, CheckCheck, ChevronRight, Clock3, FileAudio, LoaderCircle, RotateCcw } from "lucide-react";
import { COURSES, courseName } from "@/lib/courses";
import { courseFromFilename, formatDuration, formatLectureDate, lectureDateFromFilename } from "@/lib/recording-title";
import { useWorkspace, type Job } from "@/components/workspace-provider";

type Filter = "todo" | "done" | "archived" | "all";

const OTHER_KEY = "__other";

function subtitle(job: Job) {
  if (job.status === "completed") {
    const length = formatDuration(job.duration_seconds);
    return length ? `Ready · ${length}` : "Ready";
  }
  if (job.status === "uploading") return "Finishing upload";
  if (job.status === "queued") return "Waiting to start";
  if (job.status === "transcribing") return "Creating your transcript";
  if (job.status === "summarizing") return "Creating your study notes";
  if (job.error_code === "upload_failed") return "Upload interrupted";
  return "Couldn’t be finished";
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

  /**
   * One section per class, newest lecture first. The row's own title is the
   * lecture date, so a separate date subheading would only repeat it. A time is
   * appended only when a class has more than one recording on the same day.
   */
  const groups = useMemo(() => {
    const byCourse = new Map<string, { title: string; rows: Array<{ job: Job; dateKey: string }> }>();
    for (const job of visible) {
      const course = courseFromFilename(job.original_filename);
      const key = course ?? OTHER_KEY;
      if (!byCourse.has(key)) {
        byCourse.set(key, { title: course ? courseName(course) : "Other recordings", rows: [] });
      }
      byCourse.get(key)!.rows.push({ job, dateKey: lectureDateFromFilename(job.original_filename, job.created_at) });
    }

    const order = [...COURSES.map((course) => course.code as string), OTHER_KEY];
    return order.filter((key) => byCourse.has(key)).map((key) => {
      const group = byCourse.get(key)!;
      const perDate = new Map<string, number>();
      for (const row of group.rows) perDate.set(row.dateKey, (perDate.get(row.dateKey) ?? 0) + 1);
      const rows = [...group.rows]
        .sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.job.created_at.localeCompare(a.job.created_at))
        .map(({ job, dateKey }) => ({
          job,
          title: key === OTHER_KEY ? job.original_filename : formatLectureDate(dateKey),
          time: key !== OTHER_KEY && (perDate.get(dateKey) ?? 0) > 1
            ? new Date(job.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
            : null,
        }));
      return { key, title: group.title, count: rows.length, rows };
    });
  }, [visible]);

  const filters: Array<{ value: Filter; label: string; count: number }> = [
    { value: "todo", label: "To do", count: counts.todo },
    { value: "done", label: "Done", count: counts.done },
    { value: "archived", label: "Archived", count: counts.archived },
    { value: "all", label: "All", count: counts.all },
  ];

  return <section className="page-section">
    <h1 className="page-title">Your notes</h1>

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
        ? <div className="empty-state">
          <FileAudio />
          <h3>No recordings yet</h3>
          <p>Record a class and it will appear here.</p>
          <ol className="next-steps">
            <li><span>1</span>Your recording uploads securely and privately.</li>
            <li><span>2</span>Processing starts as soon as the upload finishes.</li>
            <li><span>3</span>Your transcript and study notes appear here.</li>
            <li><span>4</span>You can get an email or pop-up when they&rsquo;re ready.</li>
          </ol>
          <Link className="button button-primary" href="/record">Record a class</Link>
        </div>
        : groups.length === 0
          ? <div className="empty-state compact"><CheckCheck /><h3>Nothing in this view</h3><p>Choose another filter.</p></div>
          : <div className="course-list">{groups.map((group) => <section className="course-group" key={group.key}>
            <header className="course-heading">
              <strong>{group.title}</strong>
              <small>{group.count}</small>
            </header>
            <ul className="note-list">{group.rows.map(({ job, title, time }) => {
              const state = job.recording_user_states;
              const ready = job.status === "completed";
              const failed = job.status === "failed";
              const inner = <>
                <span className={`note-icon ${ready ? "ready" : failed ? "failed" : "working"}`}>
                  {state?.done_at ? <CheckCheck size={17} />
                    : ready ? <FileAudio size={17} />
                      : failed ? <AlertCircle size={17} />
                        : job.status === "queued" ? <Clock3 size={17} />
                          : <LoaderCircle className="spin" size={17} />}
                </span>
                <span className="note-text">
                  <strong>{title}{time ? <em> · {time}</em> : null}</strong>
                  <small>{subtitle(job)}</small>
                </span>
                {ready
                  ? <ChevronRight size={18} className="note-chevron" />
                  : failed ? null : <span className="note-percent">{job.progress}%</span>}
              </>;

              return <li key={job.id} className={`note-row ${state?.done_at ? "done" : ""}`}>
                {ready
                  ? <Link href={`/jobs/${job.id}`} className="note-link">{inner}</Link>
                  : <div className="note-link">{inner}</div>}
                {failed && job.attempt_count < 3
                  ? <button className="note-retry" type="button" onClick={() => void workspace.retry(job.id).then(setError)}>
                    <RotateCcw size={14} /> Try again
                  </button>
                  : null}
                {!ready && !failed
                  ? <div className="progress-track slim note-progress"><span style={{ width: `${job.progress}%` }} /></div>
                  : null}
              </li>;
            })}</ul>
          </section>)}</div>}
  </section>;
}
