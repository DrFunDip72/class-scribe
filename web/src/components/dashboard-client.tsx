"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Archive, ArchiveRestore, ArrowRight, Check, CheckCheck, ClipboardCheck, Clock3, FileAudio, FileVideo, LoaderCircle, Plus, RotateCcw, Server, Trash2, UploadCloud, X } from "lucide-react";
import { NotificationSettings } from "@/components/notification-settings";
import { createClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/database.types";

type RecordingState = Database["public"]["Tables"]["recording_user_states"]["Row"];
type RecordingStateUpdate = Database["public"]["Tables"]["recording_user_states"]["Update"];
type Job = Database["public"]["Tables"]["transcription_jobs"]["Row"] & {
  transcription_results: { summary: string; key_points: string[] } | null;
  recording_user_states: RecordingState | null;
  upload_batches: { created_at: string; file_count: number; label: string | null } | null;
};
type Worker = Database["public"]["Tables"]["worker_heartbeats"]["Row"];
type UploadState = "idle" | "preparing" | "uploading" | "creating";
type HistoryFilter = "todo" | "done" | "archived" | "all";
type UploadPartRecord = { storage_path: string; size_bytes: number; mime_type: string; extension: string };
type UploadRecordingRecord = { job_id: string; original_filename: string; parts: UploadPartRecord[] };

const MAX_FILES = 20;
const MAX_BYTES = 50 * 1024 * 1024;
const videoExtensions = new Set(["mp4", "webm", "mov", "m4v", "mkv"]);
const acceptedExtensions = new Set(["mp3", "m4a", "wav", "flac", "ogg", ...videoExtensions]);
const mimeByExtension: Record<string, string> = {
  mp3: "audio/mpeg", m4a: "audio/x-m4a", wav: "audio/wav", flac: "audio/flac",
  ogg: "audio/ogg", webm: "audio/webm", mp4: "audio/mp4",
};

function safeName(name: string) {
  const cleaned = name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^[_\.]+/, "").slice(-220);
  return cleaned || `recording_${Date.now()}.mp3`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function extensionOf(file: File) {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

function isVideo(file: File) {
  return file.type.startsWith("video/") || videoExtensions.has(extensionOf(file));
}

function needsLocalPreparation(file: File) {
  return isVideo(file) || file.size > MAX_BYTES;
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

export function DashboardClient({ userId, userEmail }: { userId: string; userEmail: string }) {
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [label, setLabel] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadCount, setUploadCount] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [preparationProgress, setPreparationProgress] = useState(0);
  const [preparationIndex, setPreparationIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [checkedAt, setCheckedAt] = useState(0);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("todo");
  const [savingJobIds, setSavingJobIds] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    const [jobResponse, workerResponse] = await Promise.all([
      supabase
        .from("transcription_jobs")
        .select("*, transcription_results(summary, key_points), recording_user_states(*), upload_batches(created_at, file_count, label)")
        .order("created_at", { ascending: false }),
      supabase.from("worker_heartbeats").select("*").order("last_seen_at", { ascending: false }),
    ]);
    if (!jobResponse.error) setJobs(jobResponse.data as Job[]);
    if (!workerResponse.error) setWorkers(workerResponse.data);
    setCheckedAt(Date.now());
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  function addFiles(incoming: File[]) {
    setError(null);
    setSuccess(null);
    const combined = [...files, ...incoming];
    if (combined.length > MAX_FILES) { setError(`You can upload a maximum of ${MAX_FILES} recordings at once.`); return; }
    for (const file of incoming) {
      const ext = extensionOf(file);
      if (!acceptedExtensions.has(ext)) { setError(`${file.name} is not a supported recording format.`); return; }
      if (file.size === 0) { setError(`${file.name} is empty.`); return; }
    }
    setFiles(combined);
  }

  async function submitBatch() {
    if (!files.length || uploadState !== "idle") return;
    setUploadState("uploading");
    setUploadCount(0);
    setUploadProgress(0);
    setError(null);
    setSuccess(null);
    const uploaded: string[] = [];
    const records: UploadRecordingRecord[] = [];
    try {
      const { uploadRecordingPart } = await import("@/lib/storage/upload-recording");
      for (let index = 0; index < files.length; index += 1) {
        const sourceFile = files[index];
        const jobId = crypto.randomUUID();
        const parts: UploadPartRecord[] = [];

        const uploadPart = async (file: File, partIndex: number) => {
          if (file.size > MAX_BYTES) {
            throw new Error(`${sourceFile.name} produced an audio part larger than 50 MB.`);
          }
          const filename = safeName(file.name);
          const extension = filename.split(".").pop()?.toLowerCase() ?? "";
          const storageFilename = `part-${String(partIndex + 1).padStart(4, "0")}.${extension}`;
          const path = `${userId}/${jobId}/${storageFilename}`;
          const mimeType = file.type && file.type !== "application/octet-stream"
            ? file.type
            : mimeByExtension[extension];
          if (!mimeType) throw new Error(`${sourceFile.name} has an unsupported audio type.`);

          setUploadState("uploading");
          setUploadProgress(0);
          await uploadRecordingPart({
            supabase,
            path,
            file,
            contentType: mimeType,
            onProgress: setUploadProgress,
          });
          uploaded.push(path);
          parts.push({ storage_path: path, size_bytes: file.size, mime_type: mimeType, extension });
        };

        if (needsLocalPreparation(sourceFile)) {
          setUploadState("preparing");
          setPreparationIndex(index + 1);
          setPreparationProgress(0);
          const { extractAudioPartsForUpload } = await import("@/lib/media/extract-audio");
          for await (const part of extractAudioPartsForUpload(sourceFile, (progress) => {
            setUploadState("preparing");
            setPreparationProgress(progress);
          })) {
            await uploadPart(part.file, part.partIndex);
          }
        } else {
          await uploadPart(sourceFile, 0);
        }

        records.push({ job_id: jobId, original_filename: safeName(sourceFile.name), parts });
        setUploadCount(index + 1);
      }
      setUploadState("creating");
      const { error: queueError } = await supabase.rpc("create_upload_batch", { p_label: label.trim(), p_files: records as unknown as Json });
      if (queueError) throw queueError;
      setSuccess(`${files.length} recording${files.length === 1 ? "" : "s"} added to the queue.`);
      setFiles([]);
      setLabel("");
      setUploadCount(0);
      setUploadProgress(0);
      setPreparationProgress(0);
      setPreparationIndex(0);
      if (inputRef.current) inputRef.current.value = "";
      await refresh();
    } catch (caught) {
      if (uploaded.length) await supabase.storage.from("recordings").remove(uploaded);
      setError(caught instanceof Error ? caught.message : "The upload could not be completed.");
    } finally {
      setUploadState("idle");
    }
  }

  async function retry(jobId: string) {
    setError(null);
    const { error: retryError } = await supabase.rpc("retry_transcription_job", { p_job_id: jobId });
    if (retryError) setError(retryError.message); else await refresh();
  }

  async function saveRecordingState(job: Job, update: RecordingStateUpdate) {
    setHistoryError(null);
    setSavingJobIds((current) => [...current, job.id]);
    const { data, error: stateError } = await supabase
      .from("recording_user_states")
      .upsert({ job_id: job.id, user_id: userId, ...update }, { onConflict: "job_id" })
      .select()
      .single();
    setSavingJobIds((current) => current.filter((id) => id !== job.id));
    if (stateError) {
      setHistoryError(`Could not save the status for ${job.original_filename}. ${stateError.message}`);
      return;
    }
    setJobs((current) => current.map((item) => item.id === job.id ? { ...item, recording_user_states: data } : item));
  }

  async function toggleDone(job: Job) {
    if (job.recording_user_states?.done_at) {
      await saveRecordingState(job, { done_at: null, archived_at: null });
    } else {
      await saveRecordingState(job, { done_at: new Date().toISOString(), archived_at: null });
    }
  }

  async function toggleArchive(job: Job) {
    if (job.recording_user_states?.archived_at) {
      await saveRecordingState(job, { archived_at: null });
    } else {
      await saveRecordingState(job, {
        done_at: job.recording_user_states?.done_at ?? new Date().toISOString(),
        archived_at: new Date().toISOString(),
      });
    }
  }

  async function archiveDoneInBatch(batchId: string) {
    const jobIds = jobs
      .filter((job) => job.batch_id === batchId && job.recording_user_states?.done_at && !job.recording_user_states.archived_at)
      .map((job) => job.id);
    if (!jobIds.length) return;
    setHistoryError(null);
    setSavingJobIds((current) => [...new Set([...current, ...jobIds])]);
    const archivedAt = new Date().toISOString();
    const { data, error: archiveError } = await supabase
      .from("recording_user_states")
      .update({ archived_at: archivedAt })
      .in("job_id", jobIds)
      .select();
    setSavingJobIds((current) => current.filter((id) => !jobIds.includes(id)));
    if (archiveError) {
      setHistoryError(`Could not archive this batch. ${archiveError.message}`);
      return;
    }
    const states = new Map(data.map((item) => [item.job_id, item]));
    setJobs((current) => current.map((job) => states.has(job.id) ? { ...job, recording_user_states: states.get(job.id) ?? job.recording_user_states } : job));
  }

  const activeWorker = workers.find((worker) => checkedAt - new Date(worker.last_seen_at).getTime() < 45000);
  const queueCount = jobs.filter((job) => job.status === "queued").length;
  const completeCount = jobs.filter((job) => job.status === "completed").length;
  const selectedBytes = files.reduce((total, file) => total + file.size, 0);
  const todoCount = jobs.filter((job) => !job.recording_user_states?.archived_at && (job.status !== "completed" || !job.recording_user_states?.done_at)).length;
  const doneCount = jobs.filter((job) => job.recording_user_states?.done_at && !job.recording_user_states.archived_at).length;
  const archivedCount = jobs.filter((job) => job.recording_user_states?.archived_at).length;

  const visibleJobs = jobs.filter((job) => {
    const state = job.recording_user_states;
    if (historyFilter === "todo") return !state?.archived_at && (job.status !== "completed" || !state?.done_at);
    if (historyFilter === "done") return Boolean(state?.done_at && !state.archived_at);
    if (historyFilter === "archived") return Boolean(state?.archived_at);
    return true;
  });

  const batchGroups = visibleJobs.reduce<Array<{
    id: string;
    label: string;
    createdAt: string;
    totalCount: number;
    doneCount: number;
    archiveableCount: number;
    jobs: Job[];
  }>>((groups, job) => {
    let group = groups.find((item) => item.id === job.batch_id);
    if (!group) {
      const allBatchJobs = jobs.filter((item) => item.batch_id === job.batch_id);
      group = {
        id: job.batch_id,
        label: job.upload_batches?.label || `Upload from ${new Date(job.upload_batches?.created_at ?? job.created_at).toLocaleDateString()}`,
        createdAt: job.upload_batches?.created_at ?? job.created_at,
        totalCount: job.upload_batches?.file_count ?? allBatchJobs.length,
        doneCount: allBatchJobs.filter((item) => item.recording_user_states?.done_at).length,
        archiveableCount: allBatchJobs.filter((item) => item.recording_user_states?.done_at && !item.recording_user_states.archived_at).length,
        jobs: [],
      };
      groups.push(group);
    }
    group.jobs.push(job);
    return groups;
  }, []);

  const filters: Array<{ value: HistoryFilter; label: string; count: number }> = [
    { value: "todo", label: "To do", count: todoCount },
    { value: "done", label: "Done", count: doneCount },
    { value: "archived", label: "Archived", count: archivedCount },
    { value: "all", label: "All", count: jobs.length },
  ];

  return <div className="dashboard-grid">
    <section className="dashboard-main">
      <div className="page-heading"><div><span className="section-kicker">Your workspace</span><h1>Lecture dashboard</h1><p>Upload class recordings and come back when your study notes are ready.</p></div>
        <div className={`worker-card ${activeWorker ? "online" : ""}`}><span className="worker-dot" /><div><strong>{activeWorker ? "Worker online" : "Worker offline"}</strong><small>{activeWorker ? activeWorker.state === "processing" ? "Processing a recording" : "Ready for recordings" : "Start your computer worker to process the queue"}</small></div></div>
      </div>

      <div className="upload-card">
        <div className="card-heading"><div><h2>New recordings</h2><p>Add up to 20 files. Large audio and video become compact speech audio on this device before upload.</p></div><span>{files.length}/{MAX_FILES}{selectedBytes > 0 ? ` · ${formatBytes(selectedBytes)}` : ""}</span></div>
        <input ref={inputRef} className="sr-only" id="audio-input" type="file" multiple disabled={uploadState !== "idle"} accept=".mp3,.m4a,.wav,.flac,.ogg,.webm,.mp4,.mov,.m4v,.mkv,audio/*,video/mp4,video/webm,video/quicktime,video/x-m4v,video/x-matroska" onChange={(event) => addFiles(Array.from(event.target.files ?? []))} />
        <label htmlFor="audio-input" aria-disabled={uploadState !== "idle"} className={`drop-zone ${dragging ? "dragging" : ""} ${uploadState !== "idle" ? "disabled" : ""}`} onDragEnter={(event) => { event.preventDefault(); if (uploadState === "idle") setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); if (uploadState === "idle") addFiles(Array.from(event.dataTransfer.files)); }}>
          <span className="upload-icon"><UploadCloud size={24} /></span><strong>Drop recordings here</strong><small>Audio plus MP4, WebM, MOV, M4V, and MKV video</small>
        </label>
        {files.length > 0 && <div className="selected-files">{files.map((file, index) => <div className="selected-file" key={`${file.name}-${file.lastModified}`}>{isVideo(file) ? <FileVideo size={17} /> : <FileAudio size={17} />}<div><strong>{file.name}</strong><small>{formatBytes(file.size)}{needsLocalPreparation(file) ? " · compresses locally" : ""}</small></div><button aria-label={`Remove ${file.name}`} disabled={uploadState !== "idle"} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={16} /></button></div>)}</div>}
        {uploadState === "preparing" && <div className="preparation-status" role="status"><div><span>Preparing compact audio from recording {preparationIndex} of {files.length}</span><strong>{Math.round(preparationProgress * 100)}%</strong></div><div className="progress-track"><span style={{ width: `${preparationProgress * 100}%` }} /></div><small>The original recording stays on this device. Very long classes are divided automatically.</small></div>}
        {uploadState === "uploading" && <div className="preparation-status" role="status"><div><span>Uploading recording {Math.min(uploadCount + 1, files.length)} of {files.length}</span><strong>{Math.round(uploadProgress * 100)}%</strong></div><div className="progress-track"><span style={{ width: `${uploadProgress * 100}%` }} /></div><small>Large uploads resume automatically after brief connection interruptions.</small></div>}
        {files.length > 0 && <div className="upload-footer"><label>Batch label <input value={label} maxLength={80} disabled={uploadState !== "idle"} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Monday classes (optional)" /></label><button className="button button-primary" onClick={submitBatch} disabled={uploadState !== "idle"}>{uploadState === "idle" ? <><Plus size={17} /> Add to queue</> : <><LoaderCircle className="spin" size={17} />{uploadState === "preparing" ? `Preparing ${preparationIndex}/${files.length}` : uploadState === "uploading" ? `Uploading ${Math.min(uploadCount + 1, files.length)}/${files.length}` : "Creating jobs…"}</>}</button></div>}
        {error && <p className="inline-alert error" role="alert"><AlertCircle size={16} />{error}</p>}
        {success && <p className="inline-alert success" role="status"><Check size={16} />{success}</p>}
      </div>

      <NotificationSettings userId={userId} accountEmail={userEmail} />

      <div className="history-section">
        <div className="card-heading history-heading"><div><h2>Your recordings</h2><p>{completeCount} complete · {queueCount} waiting</p></div><button className="ghost-button" onClick={() => void refresh()}><RotateCcw size={14} /> Refresh</button></div>
        <div className="history-filters" aria-label="Recording history filters">
          {filters.map((filter) => <button key={filter.value} type="button" aria-pressed={historyFilter === filter.value} className={historyFilter === filter.value ? "active" : ""} onClick={() => setHistoryFilter(filter.value)}>{filter.label}<span>{filter.count}</span></button>)}
        </div>
        {historyError && <p className="inline-alert error history-alert" role="alert"><AlertCircle size={16} />{historyError}</p>}
        {loading
          ? <div className="empty-state compact"><LoaderCircle className="spin" /><p>Loading your recordings…</p></div>
          : jobs.length === 0
            ? <div className="empty-state"><FileAudio /><h3>No recordings yet</h3><p>Your first upload will appear here.</p></div>
            : batchGroups.length === 0
              ? <div className="empty-state compact"><CheckCheck /><h3>Nothing in this view</h3><p>Choose another filter to see your recordings.</p></div>
              : <div className="batch-list">{batchGroups.map((batch) => <section className="batch-group" key={batch.id}>
                <header className="batch-heading">
                  <div><strong>{batch.label}</strong><small>{batch.doneCount} of {batch.totalCount} done · {relativeTime(batch.createdAt)}</small></div>
                  {batch.archiveableCount > 0 && historyFilter !== "archived" && <button className="ghost-button batch-archive" type="button" disabled={batch.jobs.some((job) => savingJobIds.includes(job.id))} onClick={() => void archiveDoneInBatch(batch.id)}><Archive size={14} /> Archive done</button>}
                </header>
                <div className="job-list">{batch.jobs.map((job) => {
                  const recordingState = job.recording_user_states;
                  const copyLabel = copiedLabel(recordingState);
                  const busy = savingJobIds.includes(job.id);
                  return <article className={`job-row ${recordingState?.done_at ? "done" : ""} ${recordingState?.archived_at ? "archived" : ""}`} key={job.id}>
                    <div className={`job-status-icon ${job.status} ${recordingState?.done_at ? "handled" : ""}`}>{recordingState?.done_at ? <CheckCheck size={18} /> : job.status === "completed" ? <Check size={18} /> : job.status === "failed" ? <AlertCircle size={18} /> : job.status === "queued" ? <Clock3 size={18} /> : <LoaderCircle className="spin" size={18} />}</div>
                    <div className="job-info">
                      <div className="job-title"><strong>{job.original_filename}</strong><span className={`status-pill status-${job.status}`}>{recordingState?.archived_at ? "archived" : recordingState?.done_at ? "done" : job.status}</span></div>
                      <small>{job.stage} · {relativeTime(job.created_at)} · {formatBytes(job.size_bytes)}</small>
                      {copyLabel && <span className="copy-status"><ClipboardCheck size={13} />{copyLabel}</span>}
                      {job.status !== "completed" && job.status !== "failed" && <div className="progress-track slim"><span style={{ width: `${job.progress}%` }} /></div>}
                      {job.error_message && <p className="job-error">{job.error_message}</p>}
                    </div>
                    {job.status === "completed" ? <div className="job-actions">
                      <Link className="row-action" href={`/jobs/${job.id}`}>View notes <ArrowRight size={15} /></Link>
                      <button className={`row-action state-action ${recordingState?.done_at ? "active" : ""}`} type="button" disabled={busy} onClick={() => void toggleDone(job)}>{recordingState?.done_at ? <RotateCcw size={14} /> : <CheckCheck size={14} />}{recordingState?.done_at ? "Undo" : "Done"}</button>
                      {recordingState?.done_at && <button className="row-action state-action" type="button" disabled={busy} onClick={() => void toggleArchive(job)}>{recordingState.archived_at ? <ArchiveRestore size={14} /> : <Archive size={14} />}{recordingState.archived_at ? "Restore" : "Archive"}</button>}
                    </div> : job.status === "failed" && job.attempt_count < 3 ? <button className="row-action" onClick={() => void retry(job.id)}><RotateCcw size={14} /> Retry</button> : <span className="percent">{job.progress}%</span>}
                  </article>;
                })}</div>
              </section>)}</div>}
      </div>
    </section>
    <aside className="dashboard-aside">
      <div className="aside-card"><Server size={19} /><h3>How processing works</h3><ol><li><span>1</span>Video becomes compact audio locally.</li><li><span>2</span>Only audio uploads privately.</li><li><span>3</span>Your computer creates the notes.</li><li><span>4</span>The uploaded audio is deleted.</li></ol></div>
      <div className="aside-card privacy-card"><Trash2 size={19} /><h3>Media retention</h3><p>Original videos never upload. Temporary audio is kept only until a job succeeds; transcripts and notes remain in your account.</p></div>
    </aside>
  </div>;
}
