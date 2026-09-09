"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Archive, ArchiveRestore, ArrowRight, Check, CheckCheck, ClipboardCheck, Clock3, FileAudio, FileVideo, LoaderCircle, Plus, RotateCcw, Sparkles, Trash2, UploadCloud, X } from "lucide-react";
import { NotificationSettings } from "@/components/notification-settings";
import { createClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/database.types";
import { getTranscriptionTier, TRANSCRIPTION_TIERS, type TranscriptionTier } from "@/lib/transcription-tiers";

type RecordingState = Database["public"]["Tables"]["recording_user_states"]["Row"];
type RecordingStateUpdate = Database["public"]["Tables"]["recording_user_states"]["Update"];
type Job = Database["public"]["Tables"]["transcription_jobs"]["Row"] & {
  transcription_results: { summary: string; key_points: string[] } | null;
  recording_user_states: RecordingState | null;
  upload_batches: { created_at: string; file_count: number; label: string | null } | null;
};
type Worker = Database["public"]["Tables"]["worker_heartbeats"]["Row"];
type UploadState = "idle" | "starting" | "preparing" | "uploading";
type UploadItemStatus = "waiting" | "preparing" | "uploading" | "queued" | "failed";
type UploadItem = { jobId: string; name: string; status: UploadItemStatus; progress: number };
type HistoryFilter = "todo" | "done" | "archived" | "all";
type UploadPartRecord = { storage_path: string; size_bytes: number; mime_type: string; extension: string };
type PendingUploadRecord = { job_id: string; original_filename: string; transcription_tier: TranscriptionTier };

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

function uploadItemLabel(item: UploadItem) {
  if (item.status === "waiting") return "Waiting to upload";
  if (item.status === "preparing") return `Preparing · ${Math.round(item.progress * 100)}%`;
  if (item.status === "uploading") return `Uploading · ${Math.round(item.progress * 100)}%`;
  if (item.status === "queued") return "Uploaded · processing can begin";
  return "Upload interrupted";
}

function jobStatusLabel(job: Job, state: RecordingState | null) {
  if (state?.archived_at) return "Archived";
  if (state?.done_at) return "Done";
  if (job.status === "uploading") return "Uploading";
  if (job.status === "queued") return "Waiting";
  if (job.status === "transcribing") return "Transcribing";
  if (job.status === "summarizing") return "Creating notes";
  if (job.status === "completed") return "Ready";
  return "Needs attention";
}

function jobProgressLabel(job: Job) {
  if (job.status === "uploading") return "Waiting for this upload to finish";
  if (job.status === "queued") return "Waiting to start";
  if (job.status === "transcribing") return "Creating your transcript";
  if (job.status === "summarizing") return "Creating your study notes";
  if (job.status === "completed") return "Ready to review";
  if (job.error_code === "upload_failed") return "Upload interrupted — select this recording again to retry";
  return "We couldn't finish this recording";
}

export function DashboardClient({ userId, userEmail }: { userId: string; userEmail: string }) {
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [label, setLabel] = useState("");
  const [transcriptionTier, setTranscriptionTier] = useState<TranscriptionTier>("fast");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
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

  function updateUploadItem(jobId: string, update: Partial<UploadItem>) {
    setUploadItems((current) => current.map((item) => item.jobId === jobId ? { ...item, ...update } : item));
  }

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
    const batchFiles = [...files];
    const pendingRecords: PendingUploadRecord[] = batchFiles.map((file) => ({
      job_id: crypto.randomUUID(),
      original_filename: safeName(file.name),
      transcription_tier: transcriptionTier,
    }));
    setUploadItems(pendingRecords.map((record, index) => ({
      jobId: record.job_id,
      name: batchFiles[index].name,
      status: "waiting",
      progress: 0,
    })));
    setUploadState("starting");
    setUploadProgress(0);
    setError(null);
    setSuccess(null);
    let queuedCount = 0;
    let failedCount = 0;
    let batchStarted = false;
    const settledJobIds = new Set<string>();
    try {
      const { error: batchError } = await supabase.rpc("begin_upload_batch", {
        p_label: label.trim(),
        p_files: pendingRecords as unknown as Json,
      });
      if (batchError) throw batchError;
      batchStarted = true;
      await refresh();

      const { uploadRecordingPart } = await import("@/lib/storage/upload-recording");
      for (let index = 0; index < batchFiles.length; index += 1) {
        const sourceFile = batchFiles[index];
        const jobId = pendingRecords[index].job_id;
        setPreparationIndex(index + 1);
        const uploaded: string[] = [];
        const parts: UploadPartRecord[] = [];
        try {
          const uploadPart = async (file: File, partIndex: number) => {
            if (file.size > MAX_BYTES) {
              throw new Error(`${sourceFile.name} could not be prepared for upload.`);
            }
            const filename = safeName(file.name);
            const extension = filename.split(".").pop()?.toLowerCase() ?? "";
            const storageFilename = `part-${String(partIndex + 1).padStart(4, "0")}.${extension}`;
            const path = `${userId}/${jobId}/${storageFilename}`;
            const mimeType = file.type && file.type !== "application/octet-stream"
              ? file.type
              : mimeByExtension[extension];
            if (!mimeType) throw new Error(`${sourceFile.name} is not a supported recording format.`);

            setUploadState("uploading");
            setUploadProgress(0);
            updateUploadItem(jobId, { status: "uploading", progress: 0 });
            await uploadRecordingPart({
              supabase,
              path,
              file,
              contentType: mimeType,
              onProgress: (progress) => {
                setUploadProgress(progress);
                updateUploadItem(jobId, { status: "uploading", progress });
              },
            });
            uploaded.push(path);
            parts.push({ storage_path: path, size_bytes: file.size, mime_type: mimeType, extension });
          };

          if (needsLocalPreparation(sourceFile)) {
            setUploadState("preparing");
            setPreparationIndex(index + 1);
            setPreparationProgress(0);
            updateUploadItem(jobId, { status: "preparing", progress: 0 });
            const { extractAudioPartsForUpload } = await import("@/lib/media/extract-audio");
            for await (const part of extractAudioPartsForUpload(sourceFile, (progress) => {
              setUploadState("preparing");
              setPreparationProgress(progress);
              updateUploadItem(jobId, { status: "preparing", progress });
            })) {
              await uploadPart(part.file, part.partIndex);
            }
          } else {
            await uploadPart(sourceFile, 0);
          }

          const { error: queueError } = await supabase.rpc("queue_uploaded_recording", {
            p_job_id: jobId,
            p_parts: parts as unknown as Json,
          });
          if (queueError) throw queueError;

          queuedCount += 1;
          settledJobIds.add(jobId);
          updateUploadItem(jobId, { status: "queued", progress: 1 });
          await refresh();
        } catch (fileError) {
          failedCount += 1;
          if (uploaded.length) await supabase.storage.from("recordings").remove(uploaded);
          await supabase.rpc("fail_recording_upload", { p_job_id: jobId });
          settledJobIds.add(jobId);
          updateUploadItem(jobId, { status: "failed", progress: 0 });
          setError(fileError instanceof Error ? `${sourceFile.name}: ${fileError.message}` : `${sourceFile.name} did not finish uploading.`);
          await refresh();
        }
      }
      const selectedTier = getTranscriptionTier(transcriptionTier);
      if (queuedCount > 0) {
        setSuccess(`${queuedCount} recording${queuedCount === 1 ? " is" : "s are"} on the way with ${selectedTier.label} quality.${failedCount ? ` ${failedCount} did not finish uploading.` : " You can leave this page."}`);
      }
      setFiles([]);
      setLabel("");
      setUploadProgress(0);
      setPreparationProgress(0);
      setPreparationIndex(0);
      if (inputRef.current) inputRef.current.value = "";
      await refresh();
      setUploadItems([]);
    } catch (caught) {
      if (batchStarted) {
        await Promise.all(pendingRecords
          .filter((record) => !settledJobIds.has(record.job_id))
          .map((record) => supabase.rpc("fail_recording_upload", { p_job_id: record.job_id })));
        await refresh();
      }
      setUploadItems([]);
      setError(caught instanceof Error ? caught.message : "We couldn't start this upload. Please try again.");
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
  const activeCount = jobs.filter((job) => ["uploading", "queued", "transcribing", "summarizing"].includes(job.status)).length;
  const completeCount = jobs.filter((job) => job.status === "completed").length;
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
      <div className="page-heading"><div><span className="section-kicker">Your workspace</span><h1>My recordings</h1><p>Upload your classes and come back when your notes are ready.</p></div>
        <div className={`worker-card ${activeWorker ? "online" : ""}`}><span className="worker-dot" /><div><strong>{activeWorker ? "Service ready" : "Service unavailable"}</strong><small>{activeWorker ? activeWorker.state === "processing" ? "Creating class notes now" : "Recordings will process automatically" : "Uploads are saved and will wait safely"}</small></div></div>
      </div>

      <div className="upload-card">
        <div className="card-heading"><div><h2>Add recordings</h2><p>Choose up to 20 audio or video files. Each recording starts processing as soon as its upload finishes.</p></div><span>{files.length}/{MAX_FILES}</span></div>
        <fieldset className="transcription-tier-picker" disabled={uploadState !== "idle"}>
          <legend>Transcription quality <span>Applies to every recording in this upload</span></legend>
          <div className="tier-options">
            {TRANSCRIPTION_TIERS.map((tier) => <label className={`tier-option ${transcriptionTier === tier.value ? "selected" : ""}`} key={tier.value}>
              <input type="radio" name="transcription-tier" value={tier.value} checked={transcriptionTier === tier.value} onChange={() => setTranscriptionTier(tier.value)} />
              <span className="tier-option-heading"><strong>{tier.label}</strong>{tier.value === "balanced" ? <em>Recommended</em> : null}</span>
              <small>{tier.estimate}</small>
              <span>{tier.description}</span>
            </label>)}
          </div>
          <p>Times are estimates and may vary with recording length and sound quality.</p>
        </fieldset>
        <input ref={inputRef} className="sr-only" id="audio-input" type="file" multiple disabled={uploadState !== "idle"} accept=".mp3,.m4a,.wav,.flac,.ogg,.webm,.mp4,.mov,.m4v,.mkv,audio/*,video/mp4,video/webm,video/quicktime,video/x-m4v,video/x-matroska" onChange={(event) => addFiles(Array.from(event.target.files ?? []))} />
        <label htmlFor="audio-input" aria-disabled={uploadState !== "idle"} className={`drop-zone ${dragging ? "dragging" : ""} ${uploadState !== "idle" ? "disabled" : ""}`} onDragEnter={(event) => { event.preventDefault(); if (uploadState === "idle") setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); if (uploadState === "idle") addFiles(Array.from(event.dataTransfer.files)); }}>
          <span className="upload-icon"><UploadCloud size={24} /></span><strong>Drop recordings here</strong><small>Audio plus MP4, WebM, MOV, M4V, and MKV video</small>
        </label>
        {files.length > 0 ? <div className="selected-files">{files.map((file, index) => {
          const uploadItem = uploadItems[index];
          return <div className={`selected-file ${uploadItem ? `upload-${uploadItem.status}` : ""}`} key={`${file.name}-${file.lastModified}-${index}`}>
            {uploadItem?.status === "queued" ? <Check size={17} /> : uploadItem?.status === "failed" ? <AlertCircle size={17} /> : isVideo(file) ? <FileVideo size={17} /> : <FileAudio size={17} />}
            <div><strong>{file.name}</strong><small>{uploadItem ? uploadItemLabel(uploadItem) : needsLocalPreparation(file) ? "Will be prepared before upload" : "Ready to upload"}</small>{uploadItem && ["preparing", "uploading"].includes(uploadItem.status) ? <div className="progress-track slim"><span style={{ width: `${uploadItem.progress * 100}%` }} /></div> : null}</div>
            <button aria-label={`Remove ${file.name}`} disabled={uploadState !== "idle"} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={16} /></button>
          </div>;
        })}</div> : null}
        {uploadState === "starting" ? <div className="preparation-status" role="status"><div><span>Getting your uploads ready</span><LoaderCircle className="spin" size={17} /></div><small>Your files will begin one at a time.</small></div> : null}
        {uploadState === "preparing" ? <div className="preparation-status" role="status"><div><span>Preparing recording {preparationIndex} of {files.length}</span><strong>{Math.round(preparationProgress * 100)}%</strong></div><div className="progress-track"><span style={{ width: `${preparationProgress * 100}%` }} /></div><small>Finished recordings can begin processing while the rest continue uploading.</small></div> : null}
        {uploadState === "uploading" ? <div className="preparation-status" role="status"><div><span>Uploading recording {preparationIndex} of {files.length}</span><strong>{Math.round(uploadProgress * 100)}%</strong></div><div className="progress-track"><span style={{ width: `${uploadProgress * 100}%` }} /></div><small>Finished recordings can begin processing while the rest continue uploading.</small></div> : null}
        {files.length > 0 ? <div className="upload-footer"><label>Group name <input value={label} maxLength={80} disabled={uploadState !== "idle"} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Monday classes (optional)" /></label><button className="button button-primary" onClick={submitBatch} disabled={uploadState !== "idle"}>{uploadState === "idle" ? <><Plus size={17} /> Start upload</> : <><LoaderCircle className="spin" size={17} />{uploadState === "starting" ? "Getting ready…" : `Sending ${preparationIndex}/${files.length}`}</>}</button></div> : null}
        {error && <p className="inline-alert error" role="alert"><AlertCircle size={16} />{error}</p>}
        {success && <p className="inline-alert success" role="status"><Check size={16} />{success}</p>}
      </div>

      <NotificationSettings userId={userId} accountEmail={userEmail} />

      <div className="history-section">
        <div className="card-heading history-heading"><div><h2>Your recordings</h2><p>{completeCount} ready · {activeCount} in progress</p></div><button className="ghost-button" onClick={() => void refresh()}><RotateCcw size={14} /> Refresh</button></div>
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
                  const tier = getTranscriptionTier(job.transcription_tier);
                  return <article className={`job-row ${recordingState?.done_at ? "done" : ""} ${recordingState?.archived_at ? "archived" : ""}`} key={job.id}>
                    <div className={`job-status-icon ${job.status} ${recordingState?.done_at ? "handled" : ""}`}>{recordingState?.done_at ? <CheckCheck size={18} /> : job.status === "completed" ? <Check size={18} /> : job.status === "failed" ? <AlertCircle size={18} /> : job.status === "queued" ? <Clock3 size={18} /> : <LoaderCircle className="spin" size={18} />}</div>
                    <div className="job-info">
                      <div className="job-title"><strong>{job.original_filename}</strong><span className={`status-pill status-${job.status}`}>{jobStatusLabel(job, recordingState)}</span><span className={`tier-pill tier-${tier.value}`}>{tier.label}</span></div>
                      <small>{jobProgressLabel(job)} · {relativeTime(job.created_at)}</small>
                      {copyLabel && <span className="copy-status"><ClipboardCheck size={13} />{copyLabel}</span>}
                      {job.status !== "completed" && job.status !== "failed" && <div className="progress-track slim"><span style={{ width: `${job.progress}%` }} /></div>}
                      {job.status === "failed" ? <p className="job-error">{job.error_code === "upload_failed" ? "Select the recording again above to retry the upload." : job.attempt_count < 3 ? "Try processing this recording again." : "Upload this recording again if you want another attempt."}</p> : null}
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
      <div className="aside-card"><Sparkles size={19} /><h3>What happens next</h3><ol><li><span>1</span>Each recording uploads securely.</li><li><span>2</span>Processing starts as soon as that file is ready.</li><li><span>3</span>Your transcript and study notes appear here.</li><li><span>4</span>You can receive an email or pop-up.</li></ol></div>
      <div className="aside-card privacy-card"><Trash2 size={19} /><h3>Your recordings stay private</h3><p>Uploaded recordings are private and removed after your notes are ready. Your transcript and study notes stay in your account.</p></div>
    </aside>
  </div>;
}
