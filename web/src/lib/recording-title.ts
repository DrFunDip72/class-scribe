/** Lecture dates are still read from the recording filename for display. */
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

/** "STRAT 392 · Wed, Sep 30" when the class is known, else the filename. */
export function recordingTitle(filename: string, createdAtIso: string, className?: string | null) {
  if (!className) return filename;
  return `${className} · ${formatLectureDate(lectureDateFromFilename(filename, createdAtIso))}`;
}

export function formatDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${Math.max(1, minutes)} min`;
}
