import { describe, expect, it } from 'vitest';

import { computeStreaks, STREAKS_COUNT_FROM_DAY, streakFloorFor, type StreakDay } from './streak';

/** One assigned day on which the student solved `solved` of 4. */
const day = (dayKey: string, solved: number): StreakDay => ({ dayKey, solvedCount: solved, assignedCount: 4 });

/** A long, unbroken pre-initiative streak: every day 1 Sep -> 9 Oct. */
function oldStreak(): StreakDay[] {
  const days: StreakDay[] = [];
  for (let d = new Date('2026-09-01T00:00:00Z'); d <= new Date('2026-10-09T00:00:00Z'); d = new Date(d.getTime() + 86_400_000)) {
    days.push(day(d.toISOString().slice(0, 10), 4));
  }
  return days;
}

describe('the restart', () => {
  it('starts on Monday 12 Oct 2026', () => {
    expect(STREAKS_COUNT_FROM_DAY).toBe('2026-10-12');
  });

  it('shows 0 / 0 before the first day, however long the old streak was', () => {
    const r = computeStreaks(oldStreak(), '2026-10-10', undefined, { countFromDayKey: STREAKS_COUNT_FROM_DAY });
    expect([r.current, r.longest, r.totalQualifyingDays]).toEqual([0, 0, 0]);
  });

  it('without the floor the old streak is untouched (the behaviour history relies on)', () => {
    const r = computeStreaks(oldStreak(), '2026-10-09');
    expect(r.current).toBe(39);
    expect(r.longest).toBe(39);
  });

  it('counts only days from the restart: old days never add to it', () => {
    const days = [...oldStreak(), day('2026-10-12', 1), day('2026-10-13', 4)];
    const r = computeStreaks(days, '2026-10-13', undefined, { countFromDayKey: STREAKS_COUNT_FROM_DAY });
    expect(r.current).toBe(2);
    expect(r.longest).toBe(2);
    expect(r.currentStartedOn).toBe('2026-10-12');
  });

  it('breaks like any streak after the restart, and longest keeps the new best only', () => {
    const days = [...oldStreak(), day('2026-10-12', 4), day('2026-10-13', 4), day('2026-10-14', 0), day('2026-10-15', 2)];
    const r = computeStreaks(days, '2026-10-15', undefined, { countFromDayKey: STREAKS_COUNT_FROM_DAY });
    expect(r.current).toBe(1);
    expect(r.longest).toBe(2); // not the pre-restart 39
    expect(r.brokenOn).toBe('2026-10-14');
  });

  it('does not treat the pre-restart days as misses', () => {
    // A student who qualifies on every day since the restart has a perfect new streak,
    // regardless of what happened before it.
    const days = [day('2026-09-20', 0), day('2026-10-05', 0), day('2026-10-12', 3), day('2026-10-13', 3)];
    const r = computeStreaks(days, '2026-10-13', undefined, { countFromDayKey: STREAKS_COUNT_FROM_DAY });
    expect(r.current).toBe(2);
  });

  it('lets a later enrolment date win over the restart date', () => {
    const days = [day('2026-10-12', 4), day('2026-10-13', 4), day('2026-10-14', 4)];
    const r = computeStreaks(days, '2026-10-14', undefined, {
      enrolledFromDayKey: '2026-10-14',
      countFromDayKey: STREAKS_COUNT_FROM_DAY,
    });
    expect(r.current).toBe(1);
  });
});

describe('streakFloorFor — which floor a day is scored with', () => {
  it('leaves earlier days on their original, uncut streak', () => {
    expect(streakFloorFor('2026-10-05')).toBeNull();
    expect(streakFloorFor('2026-10-11')).toBeNull();
  });
  it('restarts the streak for the first day and every day after', () => {
    expect(streakFloorFor('2026-10-12')).toBe('2026-10-12');
    expect(streakFloorFor('2027-02-01')).toBe('2026-10-12');
  });
  it('scoring an old day with its own floor reproduces the old streak exactly', () => {
    const days = oldStreak();
    const asOf = '2026-10-05';
    const original = computeStreaks(days, asOf);
    const recomputed = computeStreaks(days, asOf, undefined, { countFromDayKey: streakFloorFor(asOf) });
    expect(recomputed).toEqual(original);
  });
});
