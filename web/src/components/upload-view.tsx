"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Check, FileAudio, FileVideo, LoaderCircle, Plus, UploadCloud, X } from "lucide-react";
import { getTranscriptionTier } from "@/lib/transcription-tiers";
import { isVideo, needsLocalPreparation, useWorkspace } from "@/components/workspace-provider";

const MAX_FILES = 20;
const acceptedExtensions = new Set(["mp3", "m4a", "wav", "flac", "ogg", "webm", "mp4", "mov", "m4v", "mkv"]);

function uploadItemLabel(status: string, progress: number) {
  if (status === "waiting") return "Waiting to upload";
  if (status === "preparing") return `Preparing · ${Math.round(progress * 100)}%`;
  if (status === "uploading") return `Uploading · ${Math.round(progress * 100)}%`;
  if (status === "queued") return "Uploaded · processing can begin";
  return "Upload interrupted";
}

export function UploadView() {
  const workspace = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [label, setLabel] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const idle = workspace.uploadState === "idle";

  function addFiles(incoming: File[]) {
    setError(null);
    setSuccess(null);
    const combined = [...files, ...incoming];
    if (combined.length > MAX_FILES) { setError(`You can upload a maximum of ${MAX_FILES} recordings at once.`); return; }
    for (const file of incoming) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!acceptedExtensions.has(ext)) { setError(`${file.name} is not a supported recording format.`); return; }
      if (file.size === 0) { setError(`${file.name} is empty.`); return; }
    }
    setFiles(combined);
  }

  async function start() {
    if (!files.length || !idle) return;
    setError(null);
    setSuccess(null);
    const result = await workspace.submitBatch({ files, label, tier: workspace.defaultTier });
    if (result.queued > 0) {
      const tier = getTranscriptionTier(workspace.defaultTier);
      setSuccess(`${result.queued} recording${result.queued === 1 ? " is" : "s are"} on the way with ${tier.label} quality.${result.failed ? ` ${result.failed} did not finish.` : ""}`);
      setFiles([]);
      setLabel("");
      if (inputRef.current) inputRef.current.value = "";
    }
    if (result.message) setError(result.message);
  }

  return <section className="page-section">
    <Link className="back-link" href="/record"><ArrowLeft size={15} /> Record</Link>
    <h1 className="page-title">Upload recordings</h1>
    <p className="page-subtitle">
      Up to {MAX_FILES} audio or video files, using your {getTranscriptionTier(workspace.defaultTier).label} quality
      setting. <Link className="text-inline-link" href="/settings">Change it</Link>.
    </p>

    <input
      ref={inputRef}
      className="sr-only"
      id="audio-input"
      type="file"
      multiple
      disabled={!idle}
      accept=".mp3,.m4a,.wav,.flac,.ogg,.webm,.mp4,.mov,.m4v,.mkv,audio/*,video/mp4,video/webm,video/quicktime,video/x-m4v,video/x-matroska"
      onChange={(event) => addFiles(Array.from(event.target.files ?? []))}
    />
    <label
      htmlFor="audio-input"
      aria-disabled={!idle}
      className={`drop-zone ${dragging ? "dragging" : ""} ${idle ? "" : "disabled"}`}
      onDragEnter={(event) => { event.preventDefault(); if (idle) setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); if (idle) addFiles(Array.from(event.dataTransfer.files)); }}
    >
      <span className="upload-icon"><UploadCloud size={24} /></span>
      <strong>Choose recordings</strong>
      <small>Audio plus MP4, WebM, MOV, M4V, and MKV video</small>
    </label>

    {files.length > 0 ? <div className="selected-files">{files.map((file, index) => {
      const item = workspace.uploadItems[index];
      return <div className={`selected-file ${item ? `upload-${item.status}` : ""}`} key={`${file.name}-${file.lastModified}-${index}`}>
        {item?.status === "queued" ? <Check size={17} /> : item?.status === "failed" ? <AlertCircle size={17} /> : isVideo(file) ? <FileVideo size={17} /> : <FileAudio size={17} />}
        <div>
          <strong>{file.name}</strong>
          <small>{item ? uploadItemLabel(item.status, item.progress) : needsLocalPreparation(file) ? "Will be prepared before upload" : "Ready to upload"}</small>
          {item && ["preparing", "uploading"].includes(item.status) ? <div className="progress-track slim"><span style={{ width: `${item.progress * 100}%` }} /></div> : null}
        </div>
        <button aria-label={`Remove ${file.name}`} disabled={!idle} onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}><X size={16} /></button>
      </div>;
    })}</div> : null}

    {files.length > 0 ? <div className="upload-footer">
      <label>Group name <input value={label} maxLength={80} disabled={!idle} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Monday classes (optional)" /></label>
      <button className="button button-primary" onClick={() => void start()} disabled={!idle}>
        {idle ? <><Plus size={17} /> Start upload</> : <><LoaderCircle className="spin" size={17} /> Sending {workspace.preparationIndex}/{workspace.batchCount}</>}
      </button>
    </div> : null}

    {error && <p className="inline-alert error" role="alert"><AlertCircle size={16} />{error}</p>}
    {success && <p className="inline-alert success" role="status"><Check size={16} />{success}</p>}
  </section>;
}
