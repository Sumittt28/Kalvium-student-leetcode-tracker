/**
 * The Coding Hours submission window — which submissions count for an assignment.
 *
 * From `SUBMISSION_WINDOW_EFFECTIVE_DAY` onward, a Coding Hours assignment dated `D`
 * accepts only submissions made from **16:00 on `D` up to and including 15:59:59 on
 * `D + 1`**, program time. Nothing before or after that counts as solved, attempted or
 * scored for it — a problem the student solved last week earns nothing unless they submit
 * it again inside the window.
 *
 * Before the effective day the older rule is untouched (see `assignment-completion.ts`),
 * so no result already on record changes: the cut-over is by assignment date, not by when
 * code shipped.
 *
 * What this module does *not* do: it never deletes or hides a submission. The mirror keeps
 * everything, because LeetCode only exposes a student's last 20 and history cannot be
 * rebuilt; the window decides what is *counted*, not what is *stored*.
 *
 * Pure: no I/O and no clock reads.
 */

import {
  addDays,
  DEFAULT_PROGRAM_TIMEZONE,
  minutesIntoDay,
  startOfDayUtc,
  toDayKey,
  type DayKey,
} from './time';

/** First assignment date the window applies to (Monday 12 October 2026). */
export const SUBMISSION_WINDOW_EFFECTIVE_DAY: DayKey = '2026-10-12';

/** Minute of the program day at which the window opens: 16:00. */
export const SUBMISSION_WINDOW_OPEN_MINUTE = 16 * 60;

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_DAY = 24 * 60;

/** True when an assignment dated `dayKey` is scored with the submission window. */
export function usesSubmissionWindow(dayKey: DayKey): boolean {
  return dayKey >= SUBMISSION_WINDOW_EFFECTIVE_DAY;
}

/**
 * The inclusive `[start, end]` instants submissions must fall in to count for `dayKey`.
 *
 * `start` is 16:00 on `dayKey`; `end` is one millisecond before 16:00 on the next day, so a
 * submission at 15:59:59.999 counts and one at 16:00:00.000 belongs to the *next*
 * assignment's window instead. Consecutive windows therefore tile the timeline exactly —
 * no gap, no overlap — and a submission belongs to at most one assignment day.
 */
export function submissionWindowBounds(
  dayKey: DayKey,
  timeZone: string = DEFAULT_PROGRAM_TIMEZONE,
): { start: Date; end: Date } {
  const open = SUBMISSION_WINDOW_OPEN_MINUTE * MS_PER_MINUTE;
  const start = new Date(startOfDayUtc(dayKey, timeZone).getTime() + open);
  const nextOpen = startOfDayUtc(addDays(dayKey, 1), timeZone).getTime() + open;
  return { start, end: new Date(nextOpen - 1) };
}

/** True when `at` falls inside the window for `dayKey` (always true before the cut-over). */
export function isInSubmissionWindow(
  dayKey: DayKey,
  at: Date,
  timeZone: string = DEFAULT_PROGRAM_TIMEZONE,
): boolean {
  if (!usesSubmissionWindow(dayKey)) return true;
  const { start, end } = submissionWindowBounds(dayKey, timeZone);
  return at.getTime() >= start.getTime() && at.getTime() <= end.getTime();
}

/**
 * The assignment date whose window contains the instant `at`.
 *
 * Windows tile the timeline, so every instant lies in exactly one: a submission at or after
 * 16:00 belongs to the window dated that calendar day, an earlier one to the window dated
 * the day before. This is what lets a sync work out *which stored day* a new submission can
 * have changed, instead of recomputing a guess.
 */
export function submissionWindowDayFor(
  at: Date,
  timeZone: string = DEFAULT_PROGRAM_TIMEZONE,
): DayKey {
  const calendarDay = toDayKey(at, timeZone);
  return minutesIntoDay(at, timeZone) >= SUBMISSION_WINDOW_OPEN_MINUTE
    ? calendarDay
    : addDays(calendarDay, -1);
}

/**
 * When a student finished, as minutes since the assignment *opened* (0–1439).
 *
 * For windowed days this is minutes since 16:00 on the assignment date, so 17:00 that
 * evening is 60 and 08:00 the next morning is 960 — "earlier is better" keeps meaning
 * earlier. Measured from midnight the next morning would have beaten the same evening,
 * which is the opposite of what a finish-time tiebreak or bonus is for.
 *
 * Before the cut-over it is the ordinary minute of the day, exactly as it always was.
 */
export function completionMinuteFor(
  dayKey: DayKey,
  completedAt: Date,
  timeZone: string = DEFAULT_PROGRAM_TIMEZONE,
): number {
  if (!usesSubmissionWindow(dayKey)) return minutesIntoDay(completedAt, timeZone);
  const { start } = submissionWindowBounds(dayKey, timeZone);
  const elapsed = Math.floor((completedAt.getTime() - start.getTime()) / MS_PER_MINUTE);
  return Math.min(Math.max(elapsed, 0), MINUTES_PER_DAY - 1);
}

/** The wall-clock minute of day that a stored `completionMinute` stands for. */
export function clockMinuteForCompletion(dayKey: DayKey, completionMinute: number): number {
  if (!usesSubmissionWindow(dayKey)) return completionMinute;
  return (SUBMISSION_WINDOW_OPEN_MINUTE + completionMinute) % MINUTES_PER_DAY;
}
