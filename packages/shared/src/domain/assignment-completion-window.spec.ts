import { describe, expect, it } from 'vitest';

import {
  assignmentDaysAffectedBy,
  calculateAssignmentCompletion,
  type AssignedProblemRef,
  type CompletionStatus,
  type CompletionSubmission,
} from './assignment-completion';
import { toDayKey } from './time';
import { attemptWindows, summariseAttempts, type AttemptSubmission } from './attempts-analysis';

const TZ = 'Asia/Kolkata';
const ist = (day: string, hhmm: string, seconds = '00'): Date => new Date(`${day}T${hhmm}:${seconds}+05:30`);

const ASSIGNED: AssignedProblemRef[] = [
  { problemId: 'p1', titleSlug: 'two-sum', position: 1 },
  { problemId: 'p2', titleSlug: 'valid-anagram', position: 2 },
];

function sub(slug: string, at: Date, status: CompletionStatus = 'ACCEPTED'): CompletionSubmission {
  return { problemId: null, titleSlug: slug, status, submittedAt: at, dayKey: toDayKey(at, TZ) };
}

describe('windowed assignments (from 12 Oct 2026)', () => {
  const D = '2026-10-12';

  it('ignores a problem solved before the window opened', () => {
    const r = calculateAssignmentCompletion(D, ASSIGNED, [sub('two-sum', ist('2026-10-12', '09:00'))]);
    expect(r.solvedCount).toBe(0);
    expect(r.inWindowSolvedCount).toBe(0);
    expect(r.problems[0]).toMatchObject({ status: 'NOT_ATTEMPTED', attempts: 0, solvedAt: null });
  });

  it('ignores a problem solved last week — it must be submitted again', () => {
    const r = calculateAssignmentCompletion(D, ASSIGNED, [sub('two-sum', ist('2026-10-05', '12:00'))]);
    expect(r.solvedCount).toBe(0);
    expect(r.isComplete).toBe(false);
  });

  it('counts a re-solve made inside the window, at the time it was made', () => {
    const r = calculateAssignmentCompletion(D, ASSIGNED, [
      sub('two-sum', ist('2026-10-05', '12:00')),
      sub('two-sum', ist('2026-10-12', '17:30')),
    ]);
    expect(r.solvedCount).toBe(1);
    expect(r.problems[0]!.solvedAt?.toISOString()).toBe(ist('2026-10-12', '17:30').toISOString());
    expect(r.problems[0]!.attempts).toBe(1); // the old submission is not an attempt either
  });

  it('counts submissions up to 15:59:59 the next day and not after', () => {
    const r = calculateAssignmentCompletion(D, ASSIGNED, [
      sub('two-sum', ist('2026-10-13', '15:59', '59')),
      sub('valid-anagram', ist('2026-10-13', '16:00', '00')),
    ]);
    expect(r.problems.map((p) => p.status)).toEqual(['ACCEPTED', 'NOT_ATTEMPTED']);
    expect(r.solvedCount).toBe(1);
  });

  it('does not count a failed attempt made outside the window', () => {
    const r = calculateAssignmentCompletion(D, ASSIGNED, [
      sub('two-sum', ist('2026-10-12', '10:00'), 'ATTEMPTED_NOT_ACCEPTED'),
      sub('valid-anagram', ist('2026-10-12', '18:00'), 'ATTEMPTED_NOT_ACCEPTED'),
    ]);
    expect(r.problems.map((p) => p.status)).toEqual(['NOT_ATTEMPTED', 'ATTEMPTED_NOT_ACCEPTED']);
    expect(r.problems.map((p) => p.attempts)).toEqual([0, 1]);
  });

  it('completes only when every problem is solved inside the window, and says when', () => {
    const r = calculateAssignmentCompletion(D, ASSIGNED, [
      sub('two-sum', ist('2026-10-12', '17:00')),
      sub('valid-anagram', ist('2026-10-13', '09:00')),
    ]);
    expect(r.isComplete).toBe(true);
    expect(r.completedAt?.toISOString()).toBe(ist('2026-10-13', '09:00').toISOString());
    expect(r.solvedCount).toBe(r.inWindowSolvedCount);
  });

  it('reports its window as the assignment day and the next', () => {
    const r = calculateAssignmentCompletion(D, ASSIGNED, []);
    expect([r.windowStartDayKey, r.windowEndDayKey]).toEqual(['2026-10-12', '2026-10-13']);
  });

  it('gives two assignments of the same problem separate windows', () => {
    const subs = [sub('two-sum', ist('2026-10-13', '18:00'))];
    expect(calculateAssignmentCompletion('2026-10-12', ASSIGNED, subs).solvedCount).toBe(0);
    expect(calculateAssignmentCompletion('2026-10-13', ASSIGNED, subs).solvedCount).toBe(1);
  });
});

describe('earlier assignments keep the older rule exactly', () => {
  it('still credits a problem solved weeks before an assignment dated before the cut-over', () => {
    const r = calculateAssignmentCompletion('2026-10-05', ASSIGNED, [sub('two-sum', ist('2026-09-01', '12:00'))]);
    expect(r.solvedCount).toBe(1); // ever-solved, unchanged
    expect(r.inWindowSolvedCount).toBe(0);
  });
});

describe('assignmentDaysAffectedBy', () => {
  it('adds the previous day once that day is windowed', () => {
    expect(assignmentDaysAffectedBy('2026-10-13')).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']);
  });
  it('is unchanged for submissions whose previous day predates the cut-over', () => {
    expect(assignmentDaysAffectedBy('2026-10-05')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
    expect(assignmentDaysAffectedBy('2026-10-12')).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
  });
});

describe('Attempts Analysis uses the same window', () => {
  const day = '2026-10-12';
  const att = (id: string, at: Date, status: string): AttemptSubmission => ({
    providerSubmissionId: id, status, submittedAt: at, dayKey: toDayKey(at, TZ),
  });

  it('gives a windowed day an exact 16:00 -> 15:59:59 window regardless of the next assignment', () => {
    const w = attemptWindows([day, '2026-10-13', '2026-10-20']).get(day)!;
    expect(w.startAt?.toISOString()).toBe('2026-10-12T10:30:00.000Z');
    expect(w.endAt?.toISOString()).toBe('2026-10-13T10:29:59.999Z');
  });

  it('counts only submissions in the window; accepted-before is "solved before assignment"', () => {
    const w = attemptWindows([day]).get(day)!;
    const before = summariseAttempts(w, [att('1', ist('2026-10-12', '09:00'), 'ACCEPTED')]);
    expect(before).toMatchObject({ outcome: 'SOLVED_BEFORE_ASSIGNMENT', attempts: 0, solved: false });
  });

  it('counts failures then success inside the window; ignores anything after it', () => {
    const w = attemptWindows([day]).get(day)!;
    const r = summariseAttempts(w, [
      att('1', ist('2026-10-12', '17:00'), 'ATTEMPTED_NOT_ACCEPTED'),
      att('2', ist('2026-10-12', '17:20'), 'ACCEPTED'),
      att('3', ist('2026-10-13', '16:00'), 'ATTEMPTED_NOT_ACCEPTED'), // after: ignored
    ]);
    expect(r).toMatchObject({ outcome: 'SOLVED_AFTER_ATTEMPTS', attempts: 2, failedAttempts: 1 });
  });

  it('a solution that lands only after the window leaves the student unsolved', () => {
    const w = attemptWindows([day]).get(day)!;
    const r = summariseAttempts(w, [
      att('1', ist('2026-10-12', '18:00'), 'ATTEMPTED_NOT_ACCEPTED'),
      att('2', ist('2026-10-13', '16:30'), 'ACCEPTED'),
    ]);
    expect(r).toMatchObject({ outcome: 'ATTEMPTED_NOT_SOLVED', attempts: 1, solved: false });
  });

  it('earlier days are untouched: still "until the next assignment of the problem"', () => {
    const w = attemptWindows(['2026-10-05', '2026-10-08']).get('2026-10-05')!;
    expect(w.startAt).toBeUndefined();
    expect(w.endDayKey).toBe('2026-10-07');
  });
});
