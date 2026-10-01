/**
 * Course codes match the `drive_ingestions.course_code` check constraint and the
 * filename aliases understood by `class_scribe_automation.py`, so a recording
 * made here parses identically to one recorded into Google Drive.
 */
export const COURSES = [
  { code: "HRM-391", name: "HRM 391", classDays: [1, 3] },
  { code: "PSE-390", name: "PSE 390", classDays: [1, 3] },
  { code: "PHIL-201", name: "PHIL 201", classDays: [1, 3] },
  { code: "STRAT-392", name: "STRAT 392", classDays: [3] },
] as const;

export type CourseCode = (typeof COURSES)[number]["code"];

export function isCourseCode(value: string): value is CourseCode {
  return COURSES.some((course) => course.code === value);
}

export function courseName(code: CourseCode) {
  return COURSES.find((course) => course.code === code)?.name ?? code;
}

/** Local calendar date as `YYYY-MM-DD`; UTC would roll over during evening classes. */
export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type Course = { code: CourseCode; name: string; classDays: readonly number[] };

/** Courses that meet today, most useful first, followed by the rest. */
export function coursesForToday(date = new Date()): { meeting: Course[]; other: Course[] } {
  const weekday = date.getDay();
  const all: Course[] = COURSES.map((course) => ({ ...course }));
  return {
    meeting: all.filter((course) => course.classDays.includes(weekday)),
    other: all.filter((course) => !course.classDays.includes(weekday)),
  };
}

/**
 * Produces `HRM-391_2026-09-30.webm`, the canonical form the Drive importer's
 * parser already accepts. Browser preparation appends `_audio` to the base name
 * before upload, which that parser ignores.
 */
export function recordingFilename(code: CourseCode, extension: string, date = new Date()) {
  return `${code}_${localDateKey(date)}.${extension}`;
}

export function recordingLabel(code: CourseCode, date = new Date()) {
  return `${courseName(code)} ${localDateKey(date)}`;
}
