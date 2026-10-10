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
  it('runs 16:00 IST on the day to 15:59:59.999 IST the next day', () => {
    const { start, end } = submissionWindowBounds('2026-10-12', TZ);
    expect(start.toISOString()).toBe('2026-10-12T10:30:00.000Z'); // 16:00 IST
    expect(end.toISOString()).toBe('2026-10-13T10:29:59.999Z'); // 15:59:59.999 IST next day
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
  it('15:59:59 the next day is in; 16:00:00 the next day is out', () => {
    expect(isInSubmissionWindow(day, ist('2026-10-13', '15:59', '59'))).toBe(true);
    expect(isInSubmissionWindow(day, ist('2026-10-13', '16:00', '00'))).toBe(false);
  });
  it('15:59:59 on the day is out; 16:00:00 on the day is in', () => {
    expect(isInSubmissionWindow(day, ist('2026-10-12', '15:59', '59'))).toBe(false);
    expect(isInSubmissionWindow(day, ist('2026-10-12', '16:00', '00'))).toBe(true);
  });
  it('is always true before the cut-over, whatever the time', () => {
    expect(isInSubmissionWindow('2026-10-05', ist('2026-01-01', '03:00'))).toBe(true);
  });
});

describe('submissionWindowDayFor', () => {
  it('files a morning submission under the previous day and an evening one under its own', () => {
    expect(submissionWindowDayFor(ist('2026-10-12', '15:59', '59'), TZ)).toBe('2026-10-11');
    expect(submissionWindowDayFor(ist('2026-10-12', '16:00', '00'), TZ)).toBe('2026-10-12');
    expect(submissionWindowDayFor(ist('2026-10-13', '10:30'), TZ)).toBe('2026-10-12');
    expect(submissionWindowDayFor(ist('2026-10-13', '23:59'), TZ)).toBe('2026-10-13');
  });
});

describe('completionMinuteFor — time since the assignment opened', () => {
  it('measures from 16:00, so the same evening beats the next morning', () => {
    const evening = completionMinuteFor('2026-10-12', ist('2026-10-12', '17:00'), TZ);
    const morning = completionMinuteFor('2026-10-12', ist('2026-10-13', '08:00'), TZ);
    expect(evening).toBe(60);
    expect(morning).toBe(960);
    expect(evening).toBeLessThan(morning);
  });
  it('is the ordinary minute of the day before the cut-over', () => {
    expect(completionMinuteFor('2026-10-05', ist('2026-10-05', '09:15'), TZ)).toBe(9 * 60 + 15);
  });
  it('never leaves 0-1439', () => {
    expect(completionMinuteFor('2026-10-12', ist('2026-10-13', '15:59', '59'), TZ)).toBe(1439);
    expect(completionMinuteFor('2026-10-12', ist('2026-10-12', '15:00'), TZ)).toBe(0);
  });
  it('round-trips back to the wall clock the student actually saw', () => {
    expect(clockMinuteForCompletion('2026-10-12', 60)).toBe(17 * 60);
    expect(clockMinuteForCompletion('2026-10-12', 960)).toBe(8 * 60);
    expect(clockMinuteForCompletion('2026-10-05', 555)).toBe(555);
  });
});
