"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { localDateKey, recordingFilename, recordingLabel, type ClassRow } from "@/lib/classes";
import {
  assembleSession,
  deleteSession,
  listRecoverableSessions,
  markFinalized,
  type RecordingSession,
} from "@/lib/recording/recording-store";
import { baseMimeType, extensionForMimeType, useRecorder } from "@/lib/recording/use-recorder";
import { useWorkspace } from "@/components/workspace-provider";

export type CompletedRecording = { jobId: string | null; className: string; recordedAt: Date };

/**
 * A single state for the Record screen to switch on. Without it the screen
 * briefly fell back to the class picker between the recorder going idle and
 * the upload completing, which read as the home screen flashing.
 */
export type RecorderStage = "idle" | "starting" | "recording" | "saving" | "done";

type RecorderValue = {
  stage: RecorderStage;
  status: ReturnType<typeof useRecorder>["status"];
  elapsedMs: number;
  storedBytes: number;
  error: string | null;
  dismissError: () => void;
  activeClassName: string | null;
  start: (options: { target: ClassRow; autoStopMinutes: number | null }) => void;
  stop: () => void;
  autoStopMinutes: number;
  busy: boolean;
  recoverable: RecordingSession[];
  uploadRecoverable: (session: RecordingSession) => Promise<void>;
  discardRecoverable: (session: RecordingSession) => Promise<void>;
  completed: CompletedRecording | null;
  clearCompleted: () => void;
};

const RecorderContext = createContext<RecorderValue | null>(null);

export function useClassRecorder() {
  const value = useContext(RecorderContext);
  if (!value) throw new Error("useClassRecorder must be used inside RecorderProvider");
  return value;
}

/**
 * Lives in the authenticated layout, not in a page. A route change unmounts
 * the page component and would otherwise tear down the MediaRecorder and end
 * the lecture mid-capture.
 */
export function RecorderProvider({ children }: { children: ReactNode }) {
  const workspace = useWorkspace();
  const [recoverable, setRecoverable] = useState<RecordingSession[]>([]);
  const [handingOff, setHandingOff] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [activeClassName, setActiveClassName] = useState<string | null>(null);
  const [autoStopMinutes, setAutoStopMinutes] = useState(0);
  const [completed, setCompleted] = useState<CompletedRecording | null>(null);

  const handOff = useCallback(async (session: RecordingSession) => {
    setHandingOff(true);
    setHandoffError(null);
    try {
      const { blob } = await assembleSession(session.id);
      const recordedAt = new Date(session.startedAt);
      const file = new File(
        [blob],
        recordingFilename(session.classCode, extensionForMimeType(session.mimeType), recordedAt),
        { type: baseMimeType(session.mimeType), lastModified: session.startedAt },
      );
      const result = await workspace.submitBatch({
        files: [file],
        label: recordingLabel(session.className, recordedAt),
        tier: "high",
        classId: session.classId,
        // Same date the filename carries, so the published note and the
        // archived audio agree on which lecture this is.
        appRecording: { courseCode: session.classCode, lectureDate: localDateKey(recordedAt) },
      });
      if (result.ok) {
        // Only drop the local copy once the queue has accepted the upload.
        await markFinalized(session.id);
        await deleteSession(session.id);
        setRecoverable((current) => current.filter((item) => item.id !== session.id));
        setCompleted({ jobId: result.jobIds[0] ?? null, className: session.className, recordedAt });
      } else {
        setRecoverable((current) => current.some((item) => item.id === session.id) ? current : [session, ...current]);
        setHandoffError(result.message
          ? `${result.message} The recording is still saved on this device.`
          : "The upload did not finish. The recording is still saved on this device.");
      }
    } catch (caught) {
      setHandoffError(caught instanceof Error ? caught.message : "This recording could not be prepared.");
    } finally {
      setHandingOff(false);
    }
  }, [workspace]);

  // Awaited by the recorder, which holds the microphone open until it settles.
  // That capture is what keeps Android from freezing the tab mid-upload.
  const recorder = useRecorder({ onFinished: handOff });

  useEffect(() => {
    void listRecoverableSessions().then(setRecoverable).catch(() => {});
  }, []);

  /**
   * Sessions already tried without the owner asking, so a failing upload
   * retries on a real signal rather than spinning.
   */
  const autoAttemptedRef = useRef<Set<string>>(new Set());

  // Anything still on the device uploads itself. A lecture that only reaches
  // the queue when someone notices a card and taps a button is a lecture that
  // goes missing; this is the safety net under the capture keepalive.
  useEffect(() => {
    if (handingOff || recorder.status !== "idle") return;
    const next = recoverable.find((session) => !autoAttemptedRef.current.has(session.id));
    if (!next) return;
    autoAttemptedRef.current.add(next.id);
    void handOff(next);
  }, [recoverable, handingOff, recorder.status, handOff]);

  // Unlocking the phone or regaining a connection is the moment a transfer
  // that died while the device slept can actually succeed, so clear the
  // attempt record and look again.
  useEffect(() => {
    const retry = () => {
      if (document.visibilityState !== "visible") return;
      autoAttemptedRef.current.clear();
      void listRecoverableSessions().then(setRecoverable).catch(() => {});
    };
    document.addEventListener("visibilitychange", retry);
    window.addEventListener("online", retry);
    return () => {
      document.removeEventListener("visibilitychange", retry);
      window.removeEventListener("online", retry);
    };
  }, []);

  const start = useCallback((options: { target: ClassRow; autoStopMinutes: number | null }) => {
    setCompleted(null);
    setHandoffError(null);
    setActiveClassName(options.target.name);
    setAutoStopMinutes(options.autoStopMinutes ?? 0);
    void recorder.start({
      classId: options.target.id,
      className: options.target.name,
      classCode: options.target.code,
      autoStopMinutes: options.autoStopMinutes,
    });
  }, [recorder]);

  const discardRecoverable = useCallback(async (session: RecordingSession) => {
    await deleteSession(session.id);
    setRecoverable((current) => current.filter((item) => item.id !== session.id));
  }, []);

  const clearCompleted = useCallback(() => setCompleted(null), []);

  const dismissError = useCallback(() => {
    setHandoffError(null);
    recorder.setError(null);
  }, [recorder]);

  const stage: RecorderStage =
    recorder.status === "recording" ? "recording"
      : recorder.status === "starting" ? "starting"
        : recorder.status === "finishing" || handingOff ? "saving"
          : completed ? "done"
            : "idle";

  const value: RecorderValue = {
    stage,
    status: recorder.status,
    elapsedMs: recorder.elapsedMs,
    storedBytes: recorder.storedBytes,
    error: recorder.error ?? handoffError,
    dismissError,
    activeClassName,
    start,
    stop: recorder.stop,
    autoStopMinutes,
    busy: handingOff || recorder.status === "finishing" || recorder.status === "starting",
    recoverable,
    uploadRecoverable: handOff,
    discardRecoverable,
    completed,
    clearCompleted,
  };

  return <RecorderContext.Provider value={value}>{children}</RecorderContext.Provider>;
}
