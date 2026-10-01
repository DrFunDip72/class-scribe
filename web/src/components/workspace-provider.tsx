"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/database.types";
import type { TranscriptionTier } from "@/lib/transcription-tiers";

export type RecordingState = Database["public"]["Tables"]["recording_user_states"]["Row"];
export type Job = Database["public"]["Tables"]["transcription_jobs"]["Row"] & {
  transcription_results: { summary: string; key_points: string[] } | null;
  recording_user_states: RecordingState | null;
  upload_batches: { created_at: string; file_count: number; label: string | null } | null;
};
export type Worker = Database["public"]["Tables"]["worker_heartbeats"]["Row"];

export type UploadState = "idle" | "starting" | "preparing" | "uploading";
export type UploadItemStatus = "waiting" | "preparing" | "uploading" | "queued" | "failed";
export type UploadItem = { jobId: string; name: string; status: UploadItemStatus; progress: number };
export type BatchInput = { files: File[]; label: string; tier: TranscriptionTier };
export type BatchResult = { ok: boolean; queued: number; failed: number; jobIds: string[]; message?: string };

type UploadPartRecord = { storage_path: string; size_bytes: number; mime_type: string; extension: string };
type PendingUploadRecord = { job_id: string; original_filename: string; transcription_tier: TranscriptionTier };

const MAX_BYTES = 50 * 1024 * 1024;
const videoExtensions = new Set(["mp4", "webm", "mov", "m4v", "mkv"]);
const mimeByExtension: Record<string, string> = {
  mp3: "audio/mpeg", m4a: "audio/x-m4a", wav: "audio/wav", flac: "audio/flac",
  ogg: "audio/ogg", webm: "audio/webm", mp4: "audio/mp4",
};

export function safeName(name: string) {
  const cleaned = name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^[_.]+/, "").slice(-220);
  return cleaned || `recording_${Date.now()}.mp3`;
}

export function extensionOf(file: File) {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

export function isVideo(file: File) {
  return file.type.startsWith("video/") || videoExtensions.has(extensionOf(file));
}

export function needsLocalPreparation(file: File) {
  return isVideo(file) || file.size > MAX_BYTES;
}

type WorkspaceValue = {
  userId: string;
  userEmail: string;
  jobs: Job[];
  workers: Worker[];
  loading: boolean;
  refresh: () => Promise<void>;
  activeWorker: Worker | null;
  defaultTier: TranscriptionTier;
  saveDefaultTier: (tier: TranscriptionTier) => Promise<void>;
  uploadState: UploadState;
  uploadItems: UploadItem[];
  uploadProgress: number;
  preparationProgress: number;
  preparationIndex: number;
  batchCount: number;
  submitBatch: (input: BatchInput) => Promise<BatchResult>;
  retry: (jobId: string) => Promise<string | null>;
  saveRecordingState: (job: Job, update: Database["public"]["Tables"]["recording_user_states"]["Update"]) => Promise<string | null>;
  savingJobIds: string[];
  /**
   * Files chosen on the Record screen and carried to the Upload screen. The
   * picker must open from a real user gesture, so it cannot be triggered after
   * navigating; picking first and navigating second keeps it to one tap.
   */
  stagedFiles: File[];
  stageFiles: (files: File[]) => void;
  addStagedFiles: (files: File[]) => void;
  removeStagedFile: (index: number) => void;
  clearStagedFiles: () => void;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}

/**
 * Holds every piece of state that must outlive a route change: the job list,
 * the worker heartbeat, and the upload engine. Uploads started on one tab
 * continue while the user reads notes on another.
 */
export function WorkspaceProvider({
  userId,
  userEmail,
  initialTier,
  children,
}: {
  userId: string;
  userEmail: string;
  initialTier: TranscriptionTier;
  children: ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultTier, setDefaultTier] = useState<TranscriptionTier>(initialTier);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [preparationProgress, setPreparationProgress] = useState(0);
  const [preparationIndex, setPreparationIndex] = useState(0);
  const [batchCount, setBatchCount] = useState(0);
  const [savingJobIds, setSavingJobIds] = useState<string[]>([]);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  // Captured when the poll lands, so freshness is never computed during render.
  const [checkedAt, setCheckedAt] = useState(0);
  const uploadingRef = useRef(false);

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

  const activeWorker = useMemo(() => workers.find((worker) =>
    worker.state !== "offline"
    && checkedAt - new Date(worker.last_seen_at).getTime() < 10 * 60 * 1000) ?? null, [workers, checkedAt]);

  const saveDefaultTier = useCallback(async (tier: TranscriptionTier) => {
    setDefaultTier(tier);
    await supabase.from("user_preferences").upsert({ user_id: userId, default_transcription_tier: tier });
  }, [supabase, userId]);

  function updateUploadItem(jobId: string, update: Partial<UploadItem>) {
    setUploadItems((current) => current.map((item) => item.jobId === jobId ? { ...item, ...update } : item));
  }

  const submitBatch = useCallback(async (input: BatchInput): Promise<BatchResult> => {
    if (uploadingRef.current) {
      return { ok: false, queued: 0, failed: 0, jobIds: [], message: "Another upload is already running." };
    }
    const batchFiles = input.files;
    if (!batchFiles.length) return { ok: false, queued: 0, failed: 0, jobIds: [] };

    uploadingRef.current = true;
    setBatchCount(batchFiles.length);
    const pendingRecords: PendingUploadRecord[] = batchFiles.map((file) => ({
      job_id: crypto.randomUUID(),
      original_filename: safeName(file.name),
      transcription_tier: input.tier,
    }));
    setUploadItems(pendingRecords.map((record, index) => ({
      jobId: record.job_id, name: batchFiles[index].name, status: "waiting", progress: 0,
    })));
    setUploadState("starting");
    setUploadProgress(0);

    let queuedCount = 0;
    let failedCount = 0;
    let message: string | undefined;
    const queuedJobIds: string[] = [];
    const settledJobIds = new Set<string>();
    let batchStarted = false;

    try {
      const { error: batchError } = await supabase.rpc("begin_upload_batch", {
        p_label: input.label.trim(),
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
            if (file.size > MAX_BYTES) throw new Error(`${sourceFile.name} could not be prepared for upload.`);
            const filename = safeName(file.name);
            const extension = filename.split(".").pop()?.toLowerCase() ?? "";
            const storageFilename = `part-${String(partIndex + 1).padStart(4, "0")}.${extension}`;
            const path = `${userId}/${jobId}/${storageFilename}`;
            // Strip codec parameters such as `audio/mp4;codecs=mp4a.40.2`.
            // Storage's allowed-type list and queue_uploaded_recording both
            // match exactly, so a parameterised type is rejected outright.
            const declaredType = file.type.split(";")[0].trim().toLowerCase();
            const mimeType = declaredType && declaredType !== "application/octet-stream"
              ? declaredType
              : mimeByExtension[extension];
            if (!mimeType) throw new Error(`${sourceFile.name} is not a supported recording format.`);

            setUploadState("uploading");
            setUploadProgress(0);
            updateUploadItem(jobId, { status: "uploading", progress: 0 });
            await uploadRecordingPart({
              supabase, path, file, contentType: mimeType,
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
          queuedJobIds.push(jobId);
          settledJobIds.add(jobId);
          updateUploadItem(jobId, { status: "queued", progress: 1 });
          await refresh();
        } catch (fileError) {
          failedCount += 1;
          if (uploaded.length) await supabase.storage.from("recordings").remove(uploaded);
          await supabase.rpc("fail_recording_upload", { p_job_id: jobId });
          settledJobIds.add(jobId);
          updateUploadItem(jobId, { status: "failed", progress: 0 });
          message = fileError instanceof Error
            ? `${sourceFile.name}: ${fileError.message}`
            : `${sourceFile.name} did not finish uploading.`;
          await refresh();
        }
      }
    } catch (caught) {
      if (batchStarted) {
        await Promise.all(pendingRecords
          .filter((record) => !settledJobIds.has(record.job_id))
          .map((record) => supabase.rpc("fail_recording_upload", { p_job_id: record.job_id })));
      }
      message = caught instanceof Error ? caught.message : "We couldn't start this upload. Please try again.";
    } finally {
      setUploadState("idle");
      setUploadProgress(0);
      setPreparationProgress(0);
      setPreparationIndex(0);
      uploadingRef.current = false;
      await refresh();
      setUploadItems([]);
    }

    return { ok: queuedCount > 0, queued: queuedCount, failed: failedCount, jobIds: queuedJobIds, message };
  }, [refresh, supabase, userId]);

  const retry = useCallback(async (jobId: string) => {
    const { error } = await supabase.rpc("retry_transcription_job", { p_job_id: jobId });
    if (error) return error.message;
    await refresh();
    return null;
  }, [refresh, supabase]);

  const saveRecordingState = useCallback(async (
    job: Job,
    update: Database["public"]["Tables"]["recording_user_states"]["Update"],
  ) => {
    setSavingJobIds((current) => [...current, job.id]);
    const { error } = await supabase
      .from("recording_user_states")
      .upsert({ job_id: job.id, user_id: userId, ...update }, { onConflict: "job_id" });
    setSavingJobIds((current) => current.filter((id) => id !== job.id));
    if (error) return `Could not save the status for ${job.original_filename}. ${error.message}`;
    await refresh();
    return null;
  }, [refresh, supabase, userId]);

  const value: WorkspaceValue = {
    userId, userEmail, jobs, workers, loading, refresh, activeWorker,
    defaultTier, saveDefaultTier,
    uploadState, uploadItems, uploadProgress, preparationProgress, preparationIndex, batchCount,
    submitBatch, retry, saveRecordingState, savingJobIds,
    stagedFiles,
    stageFiles: setStagedFiles,
    addStagedFiles: (incoming: File[]) => setStagedFiles((current) => [...current, ...incoming]),
    removeStagedFile: (index: number) => setStagedFiles((current) => current.filter((_, i) => i !== index)),
    clearStagedFiles: () => setStagedFiles([]),
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
