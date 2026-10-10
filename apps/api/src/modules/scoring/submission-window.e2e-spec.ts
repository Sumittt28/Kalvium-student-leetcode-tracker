/**
 * The 16:00 -> 15:59 submission window, end to end against a real database.
 *
 * An assignment dated D (on or after `SUBMISSION_WINDOW_EFFECTIVE_DAY`) counts only
 * submissions made from 16:00 IST on D up to 15:59:59 IST on D+1. These tests drive the
 * real `RollupService.recomputeDay` and read what it *stores* — the daily score, the
 * per-problem outcomes, the completion time — and then check Attempts Analysis against the
 * independent SQL the production smoke test uses, so the two cannot drift apart.
 *
 * Dated in 2099, after the cut-over and in a year the programme will never hold real data
 * for. The older rule has its own suites, dated before the cut-over.
 */

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RollupService } from './rollup.service';
import { ScoringConfigService } from './scoring-config.service';
import { StudentMetricsService } from './student-metrics.service';
import { BatchesService } from '../batches/batches.service';
import { CampusesService } from '../campuses/campuses.service';
import { MentorScopeService } from '../campuses/mentor-scope.service';
import { CampusAnalysisService } from '../analytics/campus-analysis.service';
import { CampusAttemptsService } from '../analytics/campus-attempts.service';
import { AttemptsCheckService } from '../internal/attempts-check.service';
import { ProgramTimeService } from '../../common/services/program-time.service';
import { EnrolmentService } from '../../common/services/enrolment.service';

const prisma = new PrismaClient();
const RUN = `e2e-win-${Date.now()}`;
const CODE = `WN${Date.now().toString(36).toUpperCase()}`;

const D = '2099-03-10';
const D1 = '2099-03-11';
const PREV = '2099-03-09';
const ENROLLED = '2099-01-01';
const ist = (day: string, hhmm: string, seconds = '00'): Date => new Date(`${day}T${hhmm}:${seconds}+05:30`);

const time = new ProgramTimeService({ program: { timezone: 'Asia/Kolkata' } } as never);
const noCache = {
  get: async () => null, set: async () => undefined, del: async () => undefined,
  delByPrefix: async () => undefined, flush: async () => undefined,
} as never;
const scoringConfig = new ScoringConfigService(prisma as never);
const batches = new BatchesService(prisma as never, time, noCache);
const metrics = new StudentMetricsService(prisma as never, time, scoringConfig, batches);
const mentorScope = new MentorScopeService(prisma as never);
const campuses = new CampusesService(prisma as never, time, noCache, mentorScope);
const rollup = new RollupService(
  prisma as never, noCache, time, scoringConfig, metrics, batches, campuses,
  new EnrolmentService(prisma as never, time),
);
const campusAnalysis = new CampusAnalysisService(prisma as never, time, mentorScope, campuses);
const attempts = new CampusAttemptsService(prisma as never, time, campusAnalysis);
const attemptsCheck = new AttemptsCheckService(prisma as never, campusAnalysis, attempts);

const slugs = [`${RUN}-p1`.toLowerCase(), `${RUN}-p2`.toLowerCase()];
const students: Record<string, string> = {};
const problemIds: string[] = [];
let campusId = '';
let batchId = '';
let assignmentId = '';
let seq = 0;

async function student(key: string): Promise<string> {
  const s = await prisma.student.create({
    data: {
      name: `${RUN} ${key}`, email: `${RUN}-${key}@window.invalid`, leetcodeUsername: `${RUN}-${key}`,
      campusId, batchId, status: 'ACTIVE', createdAt: ist(ENROLLED, '09:00'),
      campusHistory: { create: { toCampusId: campusId, effectiveFromDayKey: ENROLLED, source: 'MIGRATION' } },
      batchHistory: { create: { toBatchId: batchId, effectiveFromDayKey: ENROLLED, source: 'MIGRATION' } },
      syncState: { create: { status: 'OK', lastSyncedAt: ist(D1, '17:00') } },
    },
  });
  students[key] = s.id;
  return s.id;
}

async function sub(
  who: string, problem: 0 | 1, day: string, hhmm: string,
  status: 'ACCEPTED' | 'ATTEMPTED_NOT_ACCEPTED' = 'ACCEPTED', seconds = '00',
): Promise<void> {
  seq += 1;
  await prisma.submission.create({
    data: {
      studentId: students[who]!, problemId: problemIds[problem]!, providerSubmissionId: `${RUN}-${seq}`,
      titleSlug: slugs[problem]!, title: slugs[problem]!.toUpperCase(), status,
      submittedAt: ist(day, hhmm, seconds), dayKey: day, language: 'python3',
    },
  });
}

const result = (who: string) =>
  prisma.dailyStatus.findUniqueOrThrow({
    where: { studentId_dayKey: { studentId: students[who]!, dayKey: D } },
    include: { problemStatuses: { orderBy: { position: 'asc' } } },
  });

beforeAll(async () => {
  campusId = (await prisma.campus.create({ data: { name: `${RUN} Campus`, code: CODE } })).id;
  batchId = (await prisma.batch.create({ data: { name: `${RUN} G1`, code: 'A', campusId } })).id;
  for (const slug of slugs) {
    problemIds.push(
      (await prisma.problem.create({
        data: { titleSlug: slug, title: slug.toUpperCase(), difficulty: 'EASY', url: `https://leetcode.com/problems/${slug}/` },
      })).id,
    );
  }
  assignmentId = (
    await prisma.assignment.create({
      data: {
        dayKey: D, campusId, batchId, originalCampusId: campusId, originalBatchId: batchId,
        title: `${RUN} ${D}`, createdAt: ist(PREV, '12:00'),
        problems: { create: problemIds.map((id, i) => ({ problemId: id, position: i + 1 })) },
      },
    })
  ).id;

  for (const k of ['inside', 'before', 'after', 'edge', 'failedThenOld', 'fast']) await student(k);

  // inside: both solved in the window, the second one next morning.
  await sub('inside', 0, D, '17:00');
  await sub('inside', 1, D1, '09:00');
  // before: solved the day before AND on the morning of D — all before 16:00 on D. Nothing counts.
  await sub('before', 0, PREV, '12:00');
  await sub('before', 1, D, '09:00');
  await sub('before', 1, D, '15:59', 'ACCEPTED', '59');
  // after: one inside, one only after the window has closed.
  await sub('after', 0, D, '18:00');
  await sub('after', 1, D1, '16:00', 'ACCEPTED', '00');
  // edge: the very last second counts; the very first second before opening does not.
  await sub('edge', 0, D1, '15:59', 'ACCEPTED', '59');
  await sub('edge', 1, D, '15:59', 'ACCEPTED', '59');
  // failedThenOld: a wrong answer inside, the accepted one before the window opened.
  await sub('failedThenOld', 0, D, '19:00', 'ATTEMPTED_NOT_ACCEPTED');
  await sub('failedThenOld', 0, D, '10:00', 'ACCEPTED');
  // fast: finishes both within minutes of the window opening — must outrank 'inside'.
  await sub('fast', 0, D, '16:05');
  await sub('fast', 1, D, '16:20');

  await rollup.recomputeDay(D);
});

afterAll(async () => {
  const ids = Object.values(students);
  await prisma.dailyProblemStatus.deleteMany({ where: { dailyStatus: { studentId: { in: ids } } } });
  await prisma.dailyStatus.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.submission.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.leaderboardEntry.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.assignmentProblem.deleteMany({ where: { assignmentId } });
  await prisma.assignment.delete({ where: { id: assignmentId } });
  await prisma.student.deleteMany({ where: { id: { in: ids } } });
  await prisma.problem.deleteMany({ where: { id: { in: problemIds } } });
  await prisma.batch.deleteMany({ where: { campusId } });
  await prisma.campus.delete({ where: { id: campusId } });
  await prisma.$disconnect();
});

describe('what the rollup stores for a windowed day', () => {
  it('counts both solves made inside the window, one of them the next morning', async () => {
    const r = await result('inside');
    expect(r.solvedCount).toBe(2);
    expect(r.inWindowSolvedCount).toBe(2);
    expect(r.isPerfect).toBe(true);
  });

  it('counts nothing for solves made before the window opened', async () => {
    const r = await result('before');
    expect(r.solvedCount).toBe(0);
    expect(r.problemStatuses.map((p) => p.status)).toEqual(['NOT_ATTEMPTED', 'NOT_ATTEMPTED']);
    expect(r.problemStatuses.map((p) => p.attempts)).toEqual([0, 0]);
  });

  it('counts nothing for a solve that lands after the window has closed', async () => {
    const r = await result('after');
    expect(r.solvedCount).toBe(1);
    expect(r.problemStatuses.map((p) => p.status)).toEqual(['ACCEPTED', 'NOT_ATTEMPTED']);
  });

  it('honours the exact edges: 15:59:59 the next day counts, 15:59:59 on the day does not', async () => {
    const r = await result('edge');
    expect(r.problemStatuses.map((p) => p.status)).toEqual(['ACCEPTED', 'NOT_ATTEMPTED']);
  });

  it('does not count an out-of-window success, but does count the in-window failure', async () => {
    const r = await result('failedThenOld');
    expect(r.solvedCount).toBe(0);
    expect(r.problemStatuses[0]).toMatchObject({ status: 'ATTEMPTED_NOT_ACCEPTED', attempts: 1 });
  });
});

describe('completion time is measured from when the assignment opened', () => {
  it('stores minutes since 16:00, so finishing that evening is earlier than the next morning', async () => {
    const fast = await result('fast');
    const inside = await result('inside');
    expect(fast.completionMinute).toBe(20); // 16:20 is 20 minutes after the 16:00 opening
    expect(inside.completionMinute).toBe(17 * 60); // 09:00 next day is 17h after opening
    expect(fast.completionMinute!).toBeLessThan(inside.completionMinute!);
  });

  it('shows the real clock time the student finished at', async () => {
    const inside = await result('inside');
    expect(time.localTime(inside.completedAt)).toBe('09:00');
  });
});

describe('Attempts Analysis agrees with the independent SQL on windowed days', () => {
  it('service and SQL give the same totals', async () => {
    const report = await attemptsCheck.report();
    expect(report.agree).toBe(true);
  });
});
