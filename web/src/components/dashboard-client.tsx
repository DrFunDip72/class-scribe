"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Check, Clock3, FileAudio, LoaderCircle, Plus, RotateCcw, Server, Trash2, UploadCloud, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/database.types";

type Job = Database["public"]["Tables"]["transcription_jobs"]["Row"] & {
  transcription_results: { summary: string; key_points: string[] } | null;
};
type Worker = Database["public"]["Tables"]["worker_heartbeats"]["Row"];
type UploadState = "idle" | "uploading" | "creating";

const MAX_FILES = 20;
const MAX_BYTES = 50 * 1024 * 1024;
const acceptedExtensions = ["mp3", "m4a", "wav", "flac", "ogg", "webm", "mp4"];
const mimeByExtension: Record<string, string> = {
  mp3: "audio/mpeg", m4a: "audio/x-m4a", wav: "audio/wav", flac: "audio/flac",
  ogg: "audio/ogg", webm: "audio/webm", mp4: "audio/mp4",
};

function safeName(name: string) {
  const cleaned = name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^[_\.]+/, "").slice(-220);
  return cleaned || `recording_${Date.now()}.mp3`;
}

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function relativeTime(value: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function DashboardClient({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [label, setLabel] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadCount, setUploadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [checkedAt, setCheckedAt] = useState(0);

  const refresh = useCallback(async () => {
    const [jobResponse, workerResponse] = await Promise.all([
      supabase.from("transcription_jobs").select("*, transcription_results(summary, key_points)").order("created_at", { ascending: false }),
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
    setError(null); setSuccess(null);
    const combined = [...files, ...incoming];
    if (combined.length > MAX_FILES) { setError(`You can upload a maximum of ${MAX_FILES} recordings at once.`); return; }
    for (const file of incoming) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!acceptedExtensions.includes(ext)) { setError(`${file.name} is not a supported audio format.`); return; }
      if (file.size > MAX_BYTES) { setError(`${file.name} is larger than the free 50 MB file limit.`); return; }
      if (file.size === 0) { setError(`${file.name} is empty.`); return; }
    }
    setFiles(combined);
  }

  async function submitBatch() {
    if (!files.length || uploadState !== "idle") return;
    setUploadState("uploading"); setUploadCount(0); setError(null); setSuccess(null);
    const uploaded: string[] = [];
    const records: Array<{ job_id: string; original_filename: string; storage_path: string; size_bytes: number; mime_type: string }> = [];
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const jobId = crypto.randomUUID();
        const filename = safeName(file.name);
        const extension = filename.split(".").pop()?.toLowerCase() ?? "";
        const path = `${userId}/${jobId}/${filename}`;
        const mimeType = file.type && file.type !== "application/octet-stream" ? file.type : mimeByExtension[extension];
        const { error: uploadError } = await supabase.storage.from("recordings").upload(path, file, { contentType: mimeType, upsert: false });
        if (uploadError) throw uploadError;
        uploaded.push(path);
        records.push({ job_id: jobId, original_filename: filename, storage_path: path, size_bytes: file.size, mime_type: mimeType });
        setUploadCount(index + 1);
      }
      setUploadState("creating");
      const { error: queueError } = await supabase.rpc("create_upload_batch", { p_label: label.trim(), p_files: records as unknown as Json });
      if (queueError) throw queueError;
      setSuccess(`${files.length} recording${files.length === 1 ? "" : "s"} added to the queue.`);
      setFiles([]); setLabel(""); setUploadCount(0);
      if (inputRef.current) inputRef.current.value = "";
      await refresh();
    } catch (caught) {
      if (uploaded.length) await supabase.storage.from("recordings").remove(uploaded);
      setError(caught instanceof Error ? caught.message : "The upload could not be completed.");
    } finally { setUploadState("idle"); }
  }

  async function retry(jobId: string) {
    setError(null);
    const { error: retryError } = await supabase.rpc("retry_transcription_job", { p_job_id: jobId });
    if (retryError) setError(retryError.message); else await refresh();
  }

  const activeWorker = workers.find((worker) => checkedAt - new Date(worker.last_seen_at).getTime() < 45000);
  const queueCount = jobs.filter((job) => job.status === "queued").length;
  const completeCount = jobs.filter((job) => job.status === "completed").length;
  const selectedBytes = files.reduce((total, file) => total + file.size, 0);

  return <div className="dashboard-grid">
    <section className="dashboard-main">
      <div className="page-heading"><div><span className="section-kicker">Your workspace</span><h1>Lecture dashboard</h1><p>Upload class recordings and come back when your study notes are ready.</p></div>
        <div className={`worker-card ${activeWorker ? "online" : ""}`}><span className="worker-dot" /><div><strong>{activeWorker ? "Worker online" : "Worker offline"}</strong><small>{activeWorker ? activeWorker.state === "processing" ? "Processing a recording" : "Ready for recordings" : "Start your computer worker to process the queue"}</small></div></div>
      </div>

      <div className="upload-card">
        <div className="card-heading"><div><h2>New recordings</h2><p>Add up to 20 files. Each file can be up to 50 MB.</p></div><span>{files.length}/{MAX_FILES}{selectedBytes > 0 ? ` · ${formatBytes(selectedBytes)}` : ""}</span></div>
        <input ref={inputRef} className="sr-only" id="audio-input" type="file" multiple accept=".mp3,.m4a,.wav,.flac,.ogg,.webm,.mp4,audio/*" onChange={(event) => addFiles(Array.from(event.target.files ?? []))} />
        <label htmlFor="audio-input" className={`drop-zone ${dragging ? "dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)); }}>
          <span className="upload-icon"><UploadCloud size={24} /></span><strong>Drop audio files here</strong><small>or click to browse · MP3, M4A, WAV, FLAC, OGG, WebM, MP4</small>
        </label>
        {files.length > 0 && <div className="selected-files">{files.map((file, index) => <div className="selected-file" key={`${file.name}-${file.lastModified}`}><FileAudio size={17} /><div><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></div><button aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={16} /></button></div>)}</div>}
        {files.length > 0 && <div className="upload-footer"><label>Batch label <input value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Monday classes (optional)" /></label><button className="button button-primary" onClick={submitBatch} disabled={uploadState !== "idle"}>{uploadState === "idle" ? <><Plus size={17} /> Add to queue</> : <><LoaderCircle className="spin" size={17} />{uploadState === "uploading" ? `Uploading ${uploadCount}/${files.length}` : "Creating jobs…"}</>}</button></div>}
        {error && <p className="inline-alert error" role="alert"><AlertCircle size={16} />{error}</p>}
        {success && <p className="inline-alert success" role="status"><Check size={16} />{success}</p>}
      </div>

      <div className="history-section">
        <div className="card-heading"><div><h2>Recent recordings</h2><p>{completeCount} complete · {queueCount} waiting</p></div><button className="ghost-button" onClick={() => void refresh()}><RotateCcw size={14} /> Refresh</button></div>
        {loading ? <div className="empty-state compact"><LoaderCircle className="spin" /><p>Loading your recordings…</p></div> : jobs.length === 0 ? <div className="empty-state"><FileAudio /><h3>No recordings yet</h3><p>Your first upload will appear here.</p></div> : <div className="job-list">{jobs.map((job) => <article className="job-row" key={job.id}><div className={`job-status-icon ${job.status}`}>{job.status === "completed" ? <Check size={18} /> : job.status === "failed" ? <AlertCircle size={18} /> : job.status === "queued" ? <Clock3 size={18} /> : <LoaderCircle className="spin" size={18} />}</div><div className="job-info"><div className="job-title"><strong>{job.original_filename}</strong><span className={`status-pill status-${job.status}`}>{job.status}</span></div><small>{job.stage} · {relativeTime(job.created_at)} · {formatBytes(job.size_bytes)}</small>{job.status !== "completed" && job.status !== "failed" && <div className="progress-track slim"><span style={{ width: `${job.progress}%` }} /></div>}{job.error_message && <p className="job-error">{job.error_message}</p>}</div>{job.status === "completed" ? <Link className="row-action" href={`/jobs/${job.id}`}>View notes <ArrowRight size={15} /></Link> : job.status === "failed" && job.attempt_count < 3 ? <button className="row-action" onClick={() => void retry(job.id)}><RotateCcw size={14} /> Retry</button> : <span className="percent">{job.progress}%</span>}</article>)}</div>}
      </div>
    </section>
    <aside className="dashboard-aside">
      <div className="aside-card"><Server size={19} /><h3>How processing works</h3><ol><li><span>1</span>Your files upload privately.</li><li><span>2</span>Your computer takes the next job.</li><li><span>3</span>Audio is transcribed and summarized.</li><li><span>4</span>The original audio is deleted.</li></ol></div>
      <div className="aside-card privacy-card"><Trash2 size={19} /><h3>Audio retention</h3><p>Audio is kept only until a job succeeds. Your transcript and notes remain saved to your account.</p></div>
    </aside>
  </div>;
}
