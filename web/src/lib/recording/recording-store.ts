import type { CourseCode } from "@/lib/courses";

/**
 * Durable chunk storage for in-progress recordings.
 *
 * Android can kill a backgrounded browser under memory pressure. Holding a
 * 75-minute lecture in a JavaScript array would lose all of it; writing each
 * MediaRecorder timeslice to IndexedDB limits a crash to the last few seconds
 * and lets the dashboard offer recovery on the next load.
 */

const DB_NAME = "class-scribe-recordings";
const DB_VERSION = 1;
const SESSION_STORE = "sessions";
const CHUNK_STORE = "chunks";

export type RecordingSession = {
  id: string;
  courseCode: CourseCode;
  mimeType: string;
  startedAt: number;
  updatedAt: number;
  chunkCount: number;
  bytes: number;
  autoStopMinutes: number | null;
  /** Set once the audio has been handed to the uploader. */
  finalized: boolean;
};

type ChunkRecord = { sessionId: string; index: number; blob: Blob };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        db.createObjectStore(CHUNK_STORE, { keyPath: ["sessionId", "index"] });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Recording storage is unavailable."));
  });
  return dbPromise;
}

function runTransaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  work: (transaction: IDBTransaction) => T | Promise<T>,
) {
  return openDatabase().then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(stores, mode);
    let output: T;
    transaction.oncomplete = () => resolve(output);
    transaction.onerror = () => reject(transaction.error ?? new Error("Recording storage failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Recording storage was interrupted."));
    Promise.resolve(work(transaction)).then((value) => { output = value; }).catch(reject);
  }));
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Recording storage failed."));
  });
}

export async function createSession(
  input: Pick<RecordingSession, "courseCode" | "mimeType" | "autoStopMinutes">,
): Promise<RecordingSession> {
  const session: RecordingSession = {
    id: crypto.randomUUID(),
    courseCode: input.courseCode,
    mimeType: input.mimeType,
    autoStopMinutes: input.autoStopMinutes,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    chunkCount: 0,
    bytes: 0,
    finalized: false,
  };
  await runTransaction([SESSION_STORE], "readwrite", (transaction) => {
    transaction.objectStore(SESSION_STORE).put(session);
  });
  return session;
}

/**
 * Appends one timeslice and updates the session counters in the same
 * transaction, so a crash can never leave counters ahead of stored audio.
 */
export async function appendChunk(sessionId: string, index: number, blob: Blob) {
  return runTransaction([SESSION_STORE, CHUNK_STORE], "readwrite", async (transaction) => {
    const sessions = transaction.objectStore(SESSION_STORE);
    const existing = await requestToPromise<RecordingSession | undefined>(sessions.get(sessionId));
    if (!existing) throw new Error("This recording is no longer stored on the device.");
    transaction.objectStore(CHUNK_STORE).put({ sessionId, index, blob } satisfies ChunkRecord);
    const updated: RecordingSession = {
      ...existing,
      chunkCount: Math.max(existing.chunkCount, index + 1),
      bytes: existing.bytes + blob.size,
      updatedAt: Date.now(),
    };
    sessions.put(updated);
    return updated;
  });
}

export async function listRecoverableSessions(): Promise<RecordingSession[]> {
  const sessions = await runTransaction([SESSION_STORE], "readonly", (transaction) =>
    requestToPromise<RecordingSession[]>(transaction.objectStore(SESSION_STORE).getAll()));
  return sessions
    .filter((session) => !session.finalized && session.bytes > 0)
    .sort((left, right) => right.startedAt - left.startedAt);
}

export async function getSession(sessionId: string) {
  return runTransaction([SESSION_STORE], "readonly", (transaction) =>
    requestToPromise<RecordingSession | undefined>(transaction.objectStore(SESSION_STORE).get(sessionId)));
}

/** Reassembles stored chunks in recorded order into one playable blob. */
export async function assembleSession(sessionId: string) {
  const { session, chunks } = await runTransaction([SESSION_STORE, CHUNK_STORE], "readonly", async (transaction) => {
    const stored = await requestToPromise<RecordingSession | undefined>(
      transaction.objectStore(SESSION_STORE).get(sessionId));
    const range = IDBKeyRange.bound([sessionId, -Infinity], [sessionId, Infinity]);
    const all = await requestToPromise<ChunkRecord[]>(transaction.objectStore(CHUNK_STORE).getAll(range));
    return { session: stored, chunks: all };
  });
  if (!session) throw new Error("This recording is no longer stored on the device.");
  if (!chunks.length) throw new Error("This recording contains no audio.");
  const ordered = [...chunks].sort((left, right) => left.index - right.index);
  return { session, blob: new Blob(ordered.map((chunk) => chunk.blob), { type: session.mimeType }) };
}

export async function markFinalized(sessionId: string) {
  await runTransaction([SESSION_STORE], "readwrite", async (transaction) => {
    const sessions = transaction.objectStore(SESSION_STORE);
    const existing = await requestToPromise<RecordingSession | undefined>(sessions.get(sessionId));
    if (existing) sessions.put({ ...existing, finalized: true, updatedAt: Date.now() });
  });
}

export async function deleteSession(sessionId: string) {
  await runTransaction([SESSION_STORE, CHUNK_STORE], "readwrite", (transaction) => {
    transaction.objectStore(SESSION_STORE).delete(sessionId);
    const range = IDBKeyRange.bound([sessionId, -Infinity], [sessionId, Infinity]);
    transaction.objectStore(CHUNK_STORE).delete(range);
  });
}

export function recordingStorageAvailable() {
  return typeof indexedDB !== "undefined";
}
