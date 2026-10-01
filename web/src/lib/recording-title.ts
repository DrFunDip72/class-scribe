import { COURSES, courseName, type CourseCode } from "@/lib/courses";

/**
 * Recordings made in the app are named `<COURSE>_<YYYY-MM-DD>.<ext>`, so a
 * readable class and date can be recovered without a schema change. Uploaded
 * files keep their own filename. A `course_code`/`lecture_date` column on
 * `transcription_jobs` remains the durable fix.
 */
export function courseFromFilename(filename: string): CourseCode | null {
  const name = filename.toUpperCase();
  return COURSES.find((course) => name.startsWith(course.code))?.code ?? null;
}

export function lectureDateFromFilename(filename: string, fallbackIso: string) {
  const match = filename.match(/(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  return fallbackIso.slice(0, 10);
}

export function formatLectureDate(dateKey: string, now = new Date()) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  const date = new Date(year, month - 1, day);
  if (date.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** A customer-facing title: "STRAT 392 · Wed, Sep 30", or the filename. */
export function recordingTitle(filename: string, createdAtIso: string, now = new Date()) {
  const course = courseFromFilename(filename);
  if (!course) return filename;
  const dateKey = lectureDateFromFilename(filename, createdAtIso);
  return `${courseName(course)} · ${formatLectureDate(dateKey, now)}`;
}

export function formatDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${Math.max(1, minutes)} min`;
}
