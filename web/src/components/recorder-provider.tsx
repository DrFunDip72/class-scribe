"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { recordingFilename, recordingLabel, type CourseCode } from "@/lib/courses";
import {
  assembleSession,
  deleteSession,
  listRecoverableSessions,
  markFinalized,
  type RecordingSession,
} from "@/lib/recording/recording-store";
import { baseMimeType, extensionForMimeType, useRecorder } from "@/lib/recording/use-recorder";
import { useWorkspace } from "@/components/workspace-provider";

export type CompletedRecording = { jobId: string | null; courseCode: CourseCode; recordedAt: Date };

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
  activeCourse: CourseCode | null;
  start: (options: { courseCode: CourseCode; autoStopMinutes: number | null }) => void;
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
  const [activeCourse, setActiveCourse] = useState<CourseCode | null>(null);
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
        recordingFilename(session.courseCode, extensionForMimeType(session.mimeType), recordedAt),
        { type: baseMimeType(session.mimeType), lastModified: session.startedAt },
      );
      const result = await workspace.submitBatch({
        files: [file],
        label: recordingLabel(session.courseCode, recordedAt),
        tier: "high",
      });
      if (result.ok) {
        // Only drop the local copy once the queue has accepted the upload.
        await markFinalized(session.id);
        await deleteSession(session.id);
        setRecoverable((current) => current.filter((item) => item.id !== session.id));
        setCompleted({ jobId: result.jobIds[0] ?? null, courseCode: session.courseCode, recordedAt });
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

  const recorder = useRecorder({ onFinished: (session) => { void handOff(session); } });

  useEffect(() => {
    void listRecoverableSessions().then(setRecoverable).catch(() => {});
  }, []);

  const start = useCallback((options: { courseCode: CourseCode; autoStopMinutes: number | null }) => {
    setCompleted(null);
    setHandoffError(null);
    setActiveCourse(options.courseCode);
    setAutoStopMinutes(options.autoStopMinutes ?? 0);
    void recorder.start(options);
  }, [recorder]);

  const discardRecoverable = useCallback(async (session: RecordingSession) => {
    await deleteSession(session.id);
    setRecoverable((current) => current.filter((item) => item.id !== session.id));
  }, []);

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
    activeCourse,
    start,
    stop: recorder.stop,
    autoStopMinutes,
    busy: handingOff || recorder.status === "finishing" || recorder.status === "starting",
    recoverable,
    uploadRecoverable: handOff,
    discardRecoverable,
    completed,
    clearCompleted: () => setCompleted(null),
  };

  return <RecorderContext.Provider value={value}>{children}</RecorderContext.Provider>;
}
