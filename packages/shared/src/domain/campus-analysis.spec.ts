/**
 * The category rules, against the reference workbook they were taken from and against the
 * failure this whole exercise started with: a measurement gap reported as a verdict.
 */

import { describe, expect, it } from 'vitest';

import {
  analysisWeeks,
  categoriseStudent,
  MIN_OBSERVED_WEEKS,
  type StudentWeek,
} from './campus-analysis';

/** One week, described by what the student did with what they were set. */
const week = (
  weekNumber: number,
  assigned: number,
  solved: number,
  options: { attempted?: number; observed?: boolean } = {},
): StudentWeek => {
  const attemptedNotSolved = options.attempted ?? 0;
  return {
    weekNumber,
    from: `2026-08-${String(weekNumber).padStart(2, '0')}`,
    to: `2026-08-${String(weekNumber).padStart(2, '0')}`,
    assigned,
    solved,
    attemptedNotSolved,
    notAttempted: Math.max(0, assigned - solved - attemptedNotSolved),
    observed: options.observed ?? true,
  };
};

const categorise = (weeks: StudentWeek[], dataAvailable = true) =>
  categoriseStudent({ weeks, dataAvailable }).category;

describe('categoriseStudent', () => {
  it('calls a student solving 75% or more overall a strong solver', () => {
    const weeks = [1, 2, 3, 4, 5, 6].map((n) => week(n, 10, 8)); // 80% overall
    expect(categorise(weeks)).toBe('SOLVING_WELL');
  });

  it('holds the 75% boundary as inclusive', () => {
    expect(categorise([week(1, 4, 3)])).toBe('SOLVING_WELL'); // exactly 75%
    expect(categorise([week(1, 100, 74)])).toBe('SOLVING_SOME'); // 74% falls short
  });

  it('calls 25-74% overall solving some', () => {
    expect(categorise([week(1, 10, 5)])).toBe('SOLVING_SOME'); // 50%
    expect(categorise([week(1, 4, 1)])).toBe('SOLVING_SOME'); // exactly 25%
  });

  it('calls under 25% with any activity struggling', () => {
    expect(categorise([week(1, 10, 1)])).toBe('STRUGGLING'); // 10%, one solve
    expect(categorise([week(1, 10, 0, { attempted: 2 })])).toBe('STRUGGLING'); // tried, solved none
  });

  it('calls no solves and no attempts not attempting', () => {
    expect(categorise([week(1, 10, 0)])).toBe('NOT_ATTEMPTING');
  });

  describe('a gap in measurement is never reported as a gap in effort', () => {
    it('reports DATA_UNAVAILABLE rather than scoring an unreadable profile as zero', () => {
      const weeks = [week(1, 10, 0)];
      // The same rows that would read "Not Attempting" if we trusted them.
      expect(categorise(weeks, true)).toBe('NOT_ATTEMPTING');
      expect(categorise(weeks, false)).toBe('DATA_UNAVAILABLE');
    });

    it('reports NOT_OBSERVED when no observed week has assigned work', () => {
      const weeks = [
        week(1, 10, 0, { observed: false }),
        week(2, 10, 0, { observed: false }),
      ];
      expect(categorise(weeks)).toBe('NOT_OBSERVED');
    });

    it('judges a student once at least one observed week has work', () => {
      const weeks = [
        week(1, 10, 0, { observed: false }),
        week(2, 10, 8), // observed, 80%
      ];
      expect(categorise(weeks)).toBe('SOLVING_WELL');
      expect(categoriseStudent({ weeks, dataAvailable: true }).consideredWeeks).toBe(1);
    });

    it('needs at least MIN_OBSERVED_WEEKS observed week with work', () => {
      expect(MIN_OBSERVED_WEEKS).toBeGreaterThanOrEqual(1);
      expect(categorise([week(1, 10, 8, { observed: false })])).toBe('NOT_OBSERVED');
    });

    it('ignores weeks with nothing assigned rather than counting them against the student', () => {
      // Week 2 set no work. Solving none of nothing is not a weak week.
      const weeks = [week(1, 10, 8), week(2, 0, 0), week(3, 10, 8)];
      const verdict = categoriseStudent({ weeks, dataAvailable: true });
      expect(verdict.category).toBe('SOLVING_WELL');
      expect(verdict.consideredWeeks).toBe(2);
    });

    it('does not treat an empty period as anything but unobserved', () => {
      expect(categorise([])).toBe('NOT_OBSERVED');
    });
  });

  it('states the evidence for its verdict', () => {
    const verdict = categoriseStudent({
      weeks: [week(1, 10, 1)],
      dataAvailable: true,
    });
    expect(verdict.overallPercent).toBeCloseTo(0.1);
  });
});

describe('analysisWeeks', () => {
  it('reproduces the reference workbook’s six weeks exactly', () => {
    const weeks = analysisWeeks('2026-08-06', '2026-09-13');
    expect(weeks).toEqual([
      { weekNumber: 1, from: '2026-08-06', to: '2026-08-09' },
      { weekNumber: 2, from: '2026-08-10', to: '2026-08-16' },
      { weekNumber: 3, from: '2026-08-17', to: '2026-08-23' },
      { weekNumber: 4, from: '2026-08-24', to: '2026-08-30' },
      { weekNumber: 5, from: '2026-08-31', to: '2026-09-06' },
      { weekNumber: 6, from: '2026-09-07', to: '2026-09-13' },
    ]);
  });

  it('clips the last week to the period rather than running past it', () => {
    const weeks = analysisWeeks('2026-08-06', '2026-09-10');
    expect(weeks[weeks.length - 1]).toEqual({ weekNumber: 6, from: '2026-09-07', to: '2026-09-10' });
  });

  it('handles a period inside a single week', () => {
    expect(analysisWeeks('2026-08-11', '2026-08-13')).toEqual([
      { weekNumber: 1, from: '2026-08-11', to: '2026-08-13' },
    ]);
  });

  it('returns nothing for an inverted or invalid period', () => {
    expect(analysisWeeks('2026-09-13', '2026-08-06')).toEqual([]);
    expect(analysisWeeks('not-a-date', '2026-08-06')).toEqual([]);
  });
});
