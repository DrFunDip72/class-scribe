"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertCircle, CheckCheck, ChevronRight, Clock3, FileAudio, FolderInput, LoaderCircle, RotateCcw, X } from "lucide-react";
import { formatDuration, formatLectureDate, lectureDateFromFilename } from "@/lib/recording-title";
import { useWorkspace, type Job } from "@/components/workspace-provider";

type StatusFilter = "todo" | "done" | "archived" | "all";

const UNSORTED = "__unsorted";

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
  const [status, setStatus] = useState<StatusFilter>("todo");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<Job | null>(null);

  // The status filter decides the population; the class tabs then slice it, so
  // every tab count reflects the status currently selected.
  const byStatus = useMemo(() => workspace.jobs.filter((job) => {
    const state = job.recording_user_states;
    if (status === "todo") return !state?.done_at && !state?.archived_at;
    if (status === "done") return Boolean(state?.done_at) && !state?.archived_at;
    if (status === "archived") return Boolean(state?.archived_at);
    return true;
  }), [workspace.jobs, status]);

  const tabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const job of byStatus) {
      const key = job.class_id ?? UNSORTED;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const list: Array<{ key: string; label: string; count: number }> = [
      { key: "all", label: "All", count: byStatus.length },
      ...workspace.classes.map((item) => ({
        key: item.id,
        label: item.name,
        count: counts.get(item.id) ?? 0,
      })),
    ];
    // Unsorted only appears when something is actually waiting to be filed.
    if (counts.get(UNSORTED)) {
      list.push({ key: UNSORTED, label: "Unsorted", count: counts.get(UNSORTED) ?? 0 });
    }
    return list;
  }, [byStatus, workspace.classes]);

  const rows = useMemo(() => {
    const selected = classFilter === "all"
      ? byStatus
      : byStatus.filter((job) => (job.class_id ?? UNSORTED) === classFilter);

    const perClassDate = new Map<string, number>();
    for (const job of selected) {
      const key = `${job.class_id ?? UNSORTED}|${lectureDateFromFilename(job.original_filename, job.created_at)}`;
      perClassDate.set(key, (perClassDate.get(key) ?? 0) + 1);
    }

    return selected
      .map((job) => ({ job, dateKey: lectureDateFromFilename(job.original_filename, job.created_at) }))
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.job.created_at.localeCompare(a.job.created_at))
      .map(({ job, dateKey }) => {
        const className = job.classes?.name ?? null;
        // One class is implied by the tab; "All" needs the class on each row.
        const title = className
          ? (classFilter === "all" ? `${className} · ${formatLectureDate(dateKey)}` : formatLectureDate(dateKey))
          : job.original_filename;
        const duplicate = (perClassDate.get(`${job.class_id ?? UNSORTED}|${dateKey}`) ?? 0) > 1;
        return {
          job,
          title,
          time: className && duplicate
            ? new Date(job.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
            : null,
        };
      });
  }, [byStatus, classFilter]);

  async function moveTo(job: Job, classId: string | null) {
    setMoving(null);
    setError(await workspace.setJobClass(job.id, classId));
  }

  const statusFilters: Array<{ value: StatusFilter; label: string }> = [
    { value: "todo", label: "To do" },
    { value: "done", label: "Done" },
    { value: "archived", label: "Archived" },
    { value: "all", label: "All" },
  ];

  const activeTab = tabs.find((tab) => tab.key === classFilter) ?? tabs[0];

  return <section className="page-section">
    <h1 className="page-title">Your notes</h1>

    <div className="status-switch" role="group" aria-label="Filter by progress">
      {statusFilters.map((item) => <button
        key={item.value}
        type="button"
        aria-pressed={status === item.value}
        className={status === item.value ? "active" : ""}
        onClick={() => setStatus(item.value)}
      >{item.label}</button>)}
    </div>

    <div className="class-tabs" role="tablist" aria-label="Filter by class">
      {tabs.map((tab) => <button
        key={tab.key}
        type="button"
        role="tab"
        aria-selected={classFilter === tab.key}
        className={classFilter === tab.key ? "active" : ""}
        onClick={() => setClassFilter(tab.key)}
      >
        {tab.label}<span>{tab.count}</span>
      </button>)}
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
        : rows.length === 0
          ? <div className="empty-state compact">
            <CheckCheck />
            <h3>Nothing here</h3>
            <p>No {activeTab.key === "all" ? "" : `${activeTab.label} `}recordings in this view.</p>
          </div>
          : <ul className="note-list">{rows.map(({ job, title, time }) => {
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
              <div className="note-row-actions">
                {failed && job.attempt_count < 3
                  ? <button className="note-retry" type="button" onClick={() => void workspace.retry(job.id).then(setError)}>
                    <RotateCcw size={14} /> Try again
                  </button>
                  : null}
                {workspace.classes.length > 0
                  ? <button className="note-retry" type="button" onClick={() => setMoving(job)}>
                    <FolderInput size={14} /> {job.class_id ? "Move" : "Add to class"}
                  </button>
                  : null}
              </div>
              {!ready && !failed
                ? <div className="progress-track slim note-progress"><span style={{ width: `${job.progress}%` }} /></div>
                : null}
            </li>;
          })}</ul>}

    {moving ? <div className="sheet-backdrop" role="presentation" onClick={() => setMoving(null)}>
      <div className="sheet" role="dialog" aria-label="Move to class" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-heading">
          <strong>Move to class</strong>
          <button type="button" className="icon-button" aria-label="Close" onClick={() => setMoving(null)}><X size={16} /></button>
        </div>
        <div className="sheet-options">
          {workspace.classes.map((item) => <button
            key={item.id}
            type="button"
            className={moving.class_id === item.id ? "active" : ""}
            onClick={() => void moveTo(moving, item.id)}
          >{item.name}</button>)}
          {moving.class_id ? <button type="button" onClick={() => void moveTo(moving, null)}>Remove from class</button> : null}
        </div>
      </div>
    </div> : null}
  </section>;
}
