/**
 * The browse API against a real database.
 *
 * Fixtures live under belt 99 / Group 2 day 9001+ so they can never collide with, or be
 * confused for, the imported curriculum, and they are removed afterwards.
 */

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { QuestionBankService } from './question-bank.service';
import type { QuestionBankSetsQueryDto } from './dto/question-bank.dto';

const prisma = new PrismaClient();
const service = new QuestionBankService(prisma as never);
const RUN = `qbe2e-${Date.now()}`;

const q = (over: Partial<QuestionBankSetsQueryDto>): QuestionBankSetsQueryDto =>
  ({ group: 'GROUP_1', page: 1, pageSize: 12, ...over }) as QuestionBankSetsQueryDto;

const problemIds: string[] = [];

async function makeProblem(slug: string, difficulty: 'EASY' | 'MEDIUM' | 'HARD'): Promise<string> {
  const row = await prisma.problem.create({
    data: { titleSlug: `${RUN}-${slug}`, title: slug, difficulty, url: `https://leetcode.com/problems/${RUN}-${slug}/` },
  });
  problemIds.push(row.id);
  return row.id;
}

beforeAll(async () => {
  const ids = await Promise.all(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s, i) => makeProblem(s, i % 3 === 0 ? 'EASY' : i % 3 === 1 ? 'MEDIUM' : 'HARD')));

  // Group 1: belt 99, week 1, days 2 then 1 inserted *out of order* (ordering must come
  // from the data's day, not from insertion order); slots inserted shuffled too.
  const g1 = (day: number, base: number) =>
    [3, 1, 4, 2].map((position) => ({
      group: 'GROUP_1' as const, setKey: `${RUN}-G1-D${day}`, position, belt: 99, week: 1, day,
      problemId: ids[base + position - 1]!, leetcodeNumber: 9000 + day * 10 + position,
      sourceTitle: `Q${position} of day ${day}`, sourceDifficulty: 'EASY' as const,
      topic: day === 1 ? 'Arrays' : 'Graphs', pattern: 'P', dayFocus: 'F', usage: 'u', sourceRow: position,
    }));
  await prisma.questionBankEntry.createMany({ data: [...g1(2, 4), ...g1(1, 0)] });

  // Group 2: one day carrying the three roles.
  await prisma.questionBankEntry.createMany({
    data: [1, 2, 3, 4].map((position) => ({
      group: 'GROUP_2' as const, setKey: `${RUN}-G2-D9001`, position, belt: null, week: 90, day: 9001, weekday: 'Mon',
      problemId: ids[position - 1]!, leetcodeNumber: 9100 + position, sourceTitle: `G2 question ${position}`,
      sourceDifficulty: 'MEDIUM' as const, dailyTheme: `${RUN} theme`, role: ['Warm-up', 'Core', 'Core', 'Stretch'][position - 1]!, sourceRow: position,
    })),
  });
});

afterAll(async () => {
  await prisma.questionBankEntry.deleteMany({ where: { setKey: { startsWith: RUN } } });
  await prisma.problem.deleteMany({ where: { id: { in: problemIds } } });
  await prisma.$disconnect();
});

describe('sets()', () => {
  it('returns days in curriculum order with questions always Q1-Q4', async () => {
    const res = await service.sets(q({ belt: 99 }));
    expect(res.items.map((s) => s.day)).toEqual([1, 2]);
    for (const set of res.items) expect(set.questions.map((x) => x.position)).toEqual([1, 2, 3, 4]);
  });

  it('never mixes the two groups', async () => {
    const g1 = await service.sets(q({ belt: 99 }));
    expect(g1.items.every((s) => s.group === 'GROUP_1')).toBe(true);
    const g2 = await service.sets(q({ group: 'GROUP_2', week: 90 }));
    expect(g2.items).toHaveLength(1);
    expect(g2.items[0]!.group).toBe('GROUP_2');
    expect(g2.items[0]!.questions.map((x) => x.role)).toEqual(['Warm-up', 'Core', 'Core', 'Stretch']);
    expect(g2.items[0]!.weekday).toBe('Mon');
    // A Group 1 belt filter on Group 2 matches nothing rather than leaking across.
    expect((await service.sets(q({ group: 'GROUP_2', belt: 99 }))).items).toEqual([]);
  });

  it('filters by topic, selecting a day by any matching question but returning it whole', async () => {
    const res = await service.sets(q({ belt: 99, topic: 'Graphs' }));
    expect(res.items.map((s) => s.day)).toEqual([2]);
    expect(res.items[0]!.questions).toHaveLength(4);
    expect(res.items[0]!.questions.every((x) => x.matched)).toBe(true);
  });

  it('searches by title or LeetCode number and flags only the matching question', async () => {
    const byTitle = await service.sets(q({ belt: 99, q: 'q3 of day 1' }));
    expect(byTitle.items.map((s) => s.day)).toEqual([1]);
    expect(byTitle.items[0]!.questions.filter((x) => x.matched).map((x) => x.position)).toEqual([3]);
    const byNumber = await service.sets(q({ belt: 99, q: '9022' }));
    expect(byNumber.items.map((s) => s.day)).toEqual([2]);
  });

  it('filters Group 2 by role and theme', async () => {
    const res = await service.sets(q({ group: 'GROUP_2', role: 'Stretch', theme: `${RUN} theme` }));
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.questions.filter((x) => x.matched).map((x) => x.position)).toEqual([4]);
  });

  it('paginates over days and reports totals', async () => {
    const page1 = await service.sets(q({ belt: 99, pageSize: 1, page: 1 }));
    const page2 = await service.sets(q({ belt: 99, pageSize: 1, page: 2 }));
    expect([page1.total, page1.totalPages]).toEqual([2, 2]);
    expect([page1.items[0]!.day, page2.items[0]!.day]).toEqual([1, 2]);
  });

  it('returns an empty page, not an error, when nothing matches', async () => {
    const res = await service.sets(q({ belt: 99, q: 'no such problem anywhere' }));
    expect(res).toMatchObject({ items: [], total: 0, totalPages: 0 });
  });
});

describe('set()', () => {
  it('returns one day by key with its questions in order', async () => {
    const set = await service.set(`${RUN}-G1-D2`);
    expect(set).toMatchObject({ group: 'GROUP_1', belt: 99, day: 2 });
    expect(set.questions.map((x) => x.position)).toEqual([1, 2, 3, 4]);
  });
  it('404s on an unknown key rather than returning an empty day', async () => {
    await expect(service.set('G1-B0-W0-D0')).rejects.toThrow(/No question-bank day/);
  });
});

describe('filters()', () => {
  it('reports each belt with its own weeks, and Group 2 weekdays/roles', async () => {
    const g1 = await service.filters('GROUP_1');
    expect(g1.belts.find((b) => b.belt === 99)).toEqual({ belt: 99, weeks: [1] });
    const g2 = await service.filters('GROUP_2');
    expect(g2.weeks).toContain(90);
    expect(g2.roles).toEqual(['Warm-up', 'Core', 'Stretch']);
    expect(g2.dailyThemes).toContain(`${RUN} theme`);
  });
});
