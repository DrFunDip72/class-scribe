import type { Database } from "@/lib/database.types";

export type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

export const MAX_CLASS_NAME = 60;

/**
 * A filename-safe short form of the class name, used to name recordings as
 * `<CODE>_<YYYY-MM-DD>.<ext>`. The owner-only Drive/GitHub automation parses
 * that shape, so the format must stay stable.
 */
export function classCodeFromName(name: string) {
  const code = name
    .normalize("NFKD")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  return code || `CLASS-${Date.now().toString(36).toUpperCase()}`.slice(0, 32);
}

/** Local calendar date as `YYYY-MM-DD`; UTC would roll over during evening classes. */
export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function recordingFilename(code: string, extension: string, date = new Date()) {
  return `${code}_${localDateKey(date)}.${extension}`;
}

export function recordingLabel(name: string, date = new Date()) {
  return `${name} ${localDateKey(date)}`.slice(0, 80);
}
