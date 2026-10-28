import { describe, expect, it } from 'vitest';

import { toDayKey } from './time';
import {
  clockMinuteForCompletion,
  completionMinuteFor,
  isInSubmissionWindow,
  submissionWindowBounds,
  submissionWindowDayFor,
  SUBMISSION_WINDOW_EFFECTIVE_DAY,
  usesSubmissionWindow,
} from './submission-window';

const TZ = 'Asia/Kolkata';
/** An India-time wall clock reading as an instant. */
const ist = (day: string, hhmm: string, seconds = '00'): Date => new Date(`${day}T${hhmm}:${seconds}+05:30`);

describe('cut-over', () => {
  it('starts on Monday 12 Oct 2026 and not a day earlier', () => {
    expect(SUBMISSION_WINDOW_EFFECTIVE_DAY).toBe('2026-10-12');
    expect(usesSubmissionWindow('2026-10-11')).toBe(false);
    expect(usesSubmissionWindow('2026-10-12')).toBe(true);
    expect(usesSubmissionWindow('2027-01-01')).toBe(true);
    expect(usesSubmissionWindow('2026-08-05')).toBe(false);
  });
});

describe('submissionWindowBounds', () => {
  it('runs 00:00 IST on the day to 23:59:59.999 IST the same day', () => {
    const { start, end } = submissionWindowBounds('2026-10-12', TZ);
    expect(start.toISOString()).toBe('2026-10-11T18:30:00.000Z'); // 00:00 IST on 12 Oct
    expect(end.toISOString()).toBe('2026-10-12T18:29:59.999Z'); // 23:59:59.999 IST same day
  });

  it('tiles the timeline: no gap and no overlap between consecutive days', () => {
    for (const day of ['2026-10-12', '2026-10-13', '2026-10-30', '2026-12-31']) {
      const a = submissionWindowBounds(day, TZ);
      const nextDay = new Date(a.start.getTime() + 24 * 3_600_000);
      const b = submissionWindowBounds(toDayKey(nextDay, TZ), TZ);
      expect(a.end.getTime() + 1).toBe(b.start.getTime());
    }
  });
});

describe('isInSubmissionWindow — the exact edges', () => {
  const day = '2026-10-12';
  it('a same-day afternoon solve is in; the next day is out', () => {
    // The whole point of the 00:00 window: solves made during the assignment day count.
    expect(isInSubmissionWindow(day, ist('2026-10-12', '13:11', '00'))).toBe(true);
    expect(isInSubmissionWindow(day, ist('2026-10-13', '00:00', '00'))).toBe(false);
  });
  it('00:00:00 on the day is in; 23:59:59 on the day is in', () => {
    expect(isInSubmissionWindow(day, ist('2026-10-12', '00:00', '00'))).toBe(true);
    expect(isInSubmissionWindow(day, ist('2026-10-12', '23:59', '59'))).toBe(true);
  });
  it('23:59:59 the previous day is out', () => {
    expect(isInSubmissionWindow(day, ist('2026-10-11', '23:59', '59'))).toBe(false);
  });
  it('is always true before the cut-over, whatever the time', () => {
    expect(isInSubmissionWindow('2026-10-05', ist('2026-01-01', '03:00'))).toBe(true);
  });
});

describe('submissionWindowDayFor', () => {
  it('files a submission under the calendar day it was made on', () => {
    expect(submissionWindowDayFor(ist('2026-10-12', '00:00', '00'), TZ)).toBe('2026-10-12');
    expect(submissionWindowDayFor(ist('2026-10-12', '13:11', '00'), TZ)).toBe('2026-10-12');
    expect(submissionWindowDayFor(ist('2026-10-12', '23:59', '59'), TZ)).toBe('2026-10-12');
    expect(submissionWindowDayFor(ist('2026-10-13', '08:00'), TZ)).toBe('2026-10-13');
  });
});

describe('completionMinuteFor — time since the assignment opened', () => {
  it('measures from 00:00, so a morning solve beats an evening one', () => {
    const morning = completionMinuteFor('2026-10-12', ist('2026-10-12', '09:00'), TZ);
    const evening = completionMinuteFor('2026-10-12', ist('2026-10-12', '17:00'), TZ);
    expect(morning).toBe(540); // 9 hours past midnight
    expect(evening).toBe(1020); // 17 hours past midnight
    expect(morning).toBeLessThan(evening);
  });
  it('is the ordinary minute of the day before the cut-over', () => {
    expect(completionMinuteFor('2026-10-05', ist('2026-10-05', '09:15'), TZ)).toBe(9 * 60 + 15);
  });
  it('never leaves 0-1439', () => {
    expect(completionMinuteFor('2026-10-12', ist('2026-10-12', '23:59', '59'), TZ)).toBe(1439);
    expect(completionMinuteFor('2026-10-12', ist('2026-10-12', '00:00'), TZ)).toBe(0);
  });
  it('round-trips back to the wall clock the student actually saw', () => {
    expect(clockMinuteForCompletion('2026-10-12', 540)).toBe(9 * 60);
    expect(clockMinuteForCompletion('2026-10-12', 1020)).toBe(17 * 60);
    expect(clockMinuteForCompletion('2026-10-05', 555)).toBe(555);
  });
});
