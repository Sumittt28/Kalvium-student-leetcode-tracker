/**
 * Read side of the Coding Hours Question Bank.
 *
 * Read-only and deliberately ignorant of students, assignments and scoring: it answers
 * "what does the curriculum prescribe for this day", nothing else. A question appearing
 * here says nothing about whether any student attempted or solved it.
 *
 * Filters are applied at two levels. Day-level filters (group, belt, week, day, weekday,
 * theme) narrow which days qualify. Question-level filters (topic, pattern, role,
 * difficulty, text) select a day when *any* of its questions match — and the day is still
 * returned whole, with the matching questions flagged, because a day is only meaningful as
 * its four questions together.
 */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  QuestionBankFiltersResponse,
  QuestionBankGroup,
  QuestionBankSetDto,
  QuestionBankSetsResponse,
} from '@dsa/shared';

import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AddQuestionBankEntryDto, QuestionBankSetsQueryDto, UpdateQuestionBankEntryDto } from './dto/question-bank.dto';

const ENTRY_INCLUDE = { problem: { select: { id: true, titleSlug: true, url: true } } } as const;
type EntryRow = Prisma.QuestionBankEntryGetPayload<{ include: typeof ENTRY_INCLUDE }>;

@Injectable()
export class QuestionBankService {
  constructor(private readonly prisma: PrismaService) {}

  async filters(group: QuestionBankGroup): Promise<QuestionBankFiltersResponse> {
    const rows = await this.prisma.questionBankEntry.findMany({
      where: { group },
      select: {
        belt: true,
        week: true,
        weekday: true,
        topic: true,
        pattern: true,
        dailyTheme: true,
        role: true,
        sourceDifficulty: true,
        setKey: true,
      },
    });

    const uniq = <T>(values: (T | null)[]): T[] => [...new Set(values.filter((v): v is T => v !== null))];
    const asc = (a: number, b: number) => a - b;
    const text = (a: string, b: string) => a.localeCompare(b);

    const weeksByBelt = new Map<number, Set<number>>();
    for (const r of rows) {
      if (r.belt === null) continue;
      weeksByBelt.set(r.belt, (weeksByBelt.get(r.belt) ?? new Set()).add(r.week));
    }

    return {
      group,
      belts: [...weeksByBelt.entries()]
        .sort(([a], [b]) => a - b)
        .map(([belt, weeks]) => ({ belt, weeks: [...weeks].sort(asc) })),
      weeks: uniq(rows.map((r) => r.week)).sort(asc),
      weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].filter((d) => rows.some((r) => r.weekday === d)),
      topics: uniq(rows.map((r) => r.topic)).sort(text),
      patterns: uniq(rows.map((r) => r.pattern)).sort(text),
      dailyThemes: uniq(rows.map((r) => r.dailyTheme)).sort(text),
      roles: ['Warm-up', 'Core', 'Stretch'].filter((role) => rows.some((r) => r.role === role)),
      difficulties: (['EASY', 'MEDIUM', 'HARD'] as const).filter((d) =>
        rows.some((r) => r.sourceDifficulty === d),
      ),
      totals: { sets: new Set(rows.map((r) => r.setKey)).size, questions: rows.length },
    };
  }

  /** One curriculum day by its stable key, e.g. `G1-B4-W2-D3` or `G2-D17`. */
  async set(setKey: string): Promise<QuestionBankSetDto> {
    const entries = await this.prisma.questionBankEntry.findMany({
      where: { setKey },
      include: ENTRY_INCLUDE,
      orderBy: { position: 'asc' },
    });
    if (entries.length === 0) throw new NotFoundException(`No question-bank day "${setKey}".`);
    return toSet(entries, new Set(), false);
  }

  async sets(query: QuestionBankSetsQueryDto): Promise<QuestionBankSetsResponse> {
    const { group } = query;

    // Day-level: these hold for every entry of a day, so they can sit in the same WHERE.
    const dayLevel: Prisma.QuestionBankEntryWhereInput = {
      group,
      ...(query.belt !== undefined ? { belt: query.belt } : {}),
      ...(query.week !== undefined ? { week: query.week } : {}),
      ...(query.day !== undefined ? { day: query.day } : {}),
      ...(query.weekday ? { weekday: query.weekday } : {}),
      ...(query.theme ? { dailyTheme: query.theme } : {}),
    };

    // Question-level: decide whether a day *qualifies*, and which of its questions to flag.
    const questionLevel: Prisma.QuestionBankEntryWhereInput[] = [];
    if (query.topic) questionLevel.push({ topic: query.topic });
    if (query.pattern) questionLevel.push({ pattern: query.pattern });
    if (query.role) questionLevel.push({ role: query.role });
    if (query.difficulty) questionLevel.push({ sourceDifficulty: query.difficulty });
    if (query.q) {
      const asNumber = /^\d+$/.test(query.q) ? Number(query.q) : null;
      questionLevel.push({
        OR: [
          { sourceTitle: { contains: query.q, mode: 'insensitive' } },
          ...(asNumber !== null ? [{ leetcodeNumber: asNumber }] : []),
        ],
      });
    }
    const questionWhere: Prisma.QuestionBankEntryWhereInput = { AND: questionLevel };
    const hasQuestionFilter = questionLevel.length > 0;

    // Every day that qualifies, in curriculum order. ~240 / ~80 days at most, so selecting
    // the keys and paging them in memory is simpler and cheaper than a grouped query.
    const qualifying = await this.prisma.questionBankEntry.findMany({
      where: { ...dayLevel, ...(hasQuestionFilter ? questionWhere : {}) },
      select: { setKey: true, belt: true, week: true, day: true },
      orderBy: [{ belt: 'asc' }, { week: 'asc' }, { day: 'asc' }],
    });
    const orderedKeys = [...new Map(qualifying.map((r) => [r.setKey, r])).keys()];

    const total = orderedKeys.length;
    const pageKeys = orderedKeys.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);

    const entries = pageKeys.length
      ? await this.prisma.questionBankEntry.findMany({
          where: { setKey: { in: pageKeys } },
          include: ENTRY_INCLUDE,
          orderBy: [{ setKey: 'asc' }, { position: 'asc' }],
        })
      : [];

    // Which of the returned questions actually satisfied the filters.
    const matchedIds = hasQuestionFilter
      ? new Set(
          (
            await this.prisma.questionBankEntry.findMany({
              where: { setKey: { in: pageKeys }, ...questionWhere },
              select: { id: true },
            })
          ).map((r) => r.id),
        )
      : new Set<string>();

    const bySet = new Map<string, EntryRow[]>();
    for (const entry of entries) bySet.set(entry.setKey, [...(bySet.get(entry.setKey) ?? []), entry]);

    const items = pageKeys.map((key) => toSet(bySet.get(key) ?? [], matchedIds, hasQuestionFilter));
    return {
      group,
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Write operations — allows adjusting a day's questions when a session
  // doesn't cover all planned topics.
  // ─────────────────────────────────────────────────────────────────────────

  /** Update a single question: replace the problem, or edit topic/pattern/role. */
  async updateEntry(entryId: string, dto: UpdateQuestionBankEntryDto): Promise<QuestionBankSetDto> {
    const entry = await this.prisma.questionBankEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException(`Question bank entry "${entryId}" not found.`);

    const updates: Record<string, unknown> = {};

    // If a new LeetCode URL is provided, resolve or create the problem.
    if (dto.leetcodeUrl) {
      const slug = extractSlug(dto.leetcodeUrl);
      if (!slug) throw new BadRequestException('Invalid LeetCode URL. Expected format: https://leetcode.com/problems/<slug>/');

      let problem = await this.prisma.problem.findUnique({ where: { titleSlug: slug } });
      if (!problem) {
        // Try to fetch from LeetCode and create
        problem = await this.fetchAndCreateProblem(slug);
      }

      updates.problemId = problem.id;
      updates.leetcodeNumber = problem.questionFrontendId ? parseInt(problem.questionFrontendId, 10) : 0;
      updates.sourceTitle = problem.title;
      updates.sourceDifficulty = problem.difficulty;
    }

    if (dto.topic !== undefined) updates.topic = dto.topic || null;
    if (dto.pattern !== undefined) updates.pattern = dto.pattern || null;
    if (dto.role !== undefined) updates.role = dto.role || null;

    if (Object.keys(updates).length > 0) {
      await this.prisma.questionBankEntry.update({ where: { id: entryId }, data: updates });
    }

    return this.set(entry.setKey);
  }

  /** Delete a question from a set. */
  async deleteEntry(entryId: string): Promise<{ setKey: string; deleted: boolean }> {
    const entry = await this.prisma.questionBankEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException(`Question bank entry "${entryId}" not found.`);

    await this.prisma.questionBankEntry.delete({ where: { id: entryId } });
    return { setKey: entry.setKey, deleted: true };
  }

  /** Add a new question to a set. */
  async addEntry(setKey: string, dto: AddQuestionBankEntryDto): Promise<QuestionBankSetDto> {
    // Check the set exists and get its metadata
    const existing = await this.prisma.questionBankEntry.findFirst({
      where: { setKey },
      select: { group: true, belt: true, week: true, day: true, weekday: true, dailyTheme: true, dayFocus: true },
    });
    if (!existing) throw new NotFoundException(`No question-bank day "${setKey}".`);

    // Check position is not taken
    const positionTaken = await this.prisma.questionBankEntry.findUnique({
      where: { setKey_position: { setKey, position: dto.position } },
    });
    if (positionTaken) throw new BadRequestException(`Position ${dto.position} is already taken in ${setKey}.`);

    // Resolve the problem
    const slug = extractSlug(dto.leetcodeUrl);
    if (!slug) throw new BadRequestException('Invalid LeetCode URL. Expected format: https://leetcode.com/problems/<slug>/');

    let problem = await this.prisma.problem.findUnique({ where: { titleSlug: slug } });
    if (!problem) {
      problem = await this.fetchAndCreateProblem(slug);
    }

    await this.prisma.questionBankEntry.create({
      data: {
        group: existing.group,
        setKey,
        position: dto.position,
        belt: existing.belt,
        week: existing.week,
        day: existing.day,
        weekday: existing.weekday,
        problemId: problem.id,
        leetcodeNumber: problem.questionFrontendId ? parseInt(problem.questionFrontendId, 10) : 0,
        sourceTitle: problem.title,
        sourceDifficulty: problem.difficulty,
        topic: dto.topic ?? null,
        pattern: dto.pattern ?? null,
        dailyTheme: existing.dailyTheme,
        dayFocus: existing.dayFocus,
        role: dto.role ?? null,
        sourceRow: 0, // Manual addition, no source row
      },
    });

    return this.set(setKey);
  }

  /** Fetch problem metadata from LeetCode and create it in our DB. */
  private async fetchAndCreateProblem(slug: string) {
    const query = `query q($slug: String!) {
      question(titleSlug: $slug) {
        questionId questionFrontendId title titleSlug difficulty
        topicTags { slug }
      }
    }`;

    let data: { question: { questionId: string; questionFrontendId: string; title: string; titleSlug: string; difficulty: string; topicTags: { slug: string }[] } | null };
    try {
      const res = await fetch('https://leetcode.com/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { slug } }),
      });
      const json = (await res.json()) as { data: typeof data };
      data = json.data;
    } catch {
      throw new BadRequestException(`Failed to fetch problem "${slug}" from LeetCode.`);
    }

    if (!data?.question) {
      throw new NotFoundException(`Problem "${slug}" not found on LeetCode.`);
    }

    const q = data.question;
    return this.prisma.problem.create({
      data: {
        titleSlug: q.titleSlug,
        title: q.title,
        questionId: q.questionId,
        questionFrontendId: q.questionFrontendId,
        difficulty: q.difficulty.toUpperCase() as 'EASY' | 'MEDIUM' | 'HARD',
        topicTags: q.topicTags.map((t) => t.slug),
        url: `https://leetcode.com/problems/${q.titleSlug}/`,
        metadataFetchedAt: new Date(),
      },
    });
  }
}

function toSet(entries: EntryRow[], matchedIds: Set<string>, filtered: boolean): QuestionBankSetDto {
  const head = entries[0]!;
  return {
    group: head.group,
    setKey: head.setKey,
    belt: head.belt,
    week: head.week,
    day: head.day,
    weekday: head.weekday,
    dailyTheme: head.dailyTheme,
    dayFocus: head.dayFocus,
    // `position` ordering is enforced by the query and by (setKey, position) uniqueness.
    questions: entries.map((e) => ({
      id: e.id,
      position: e.position,
      leetcodeNumber: e.leetcodeNumber,
      title: e.sourceTitle,
      difficulty: e.sourceDifficulty,
      titleSlug: e.problem.titleSlug,
      url: e.problem.url,
      problemId: e.problem.id,
      topic: e.topic,
      pattern: e.pattern,
      dayFocus: e.dayFocus,
      dailyTheme: e.dailyTheme,
      role: e.role,
      usage: e.usage,
      matched: filtered ? matchedIds.has(e.id) : false,
    })),
  };
}

/** Extract the titleSlug from a LeetCode URL. */
function extractSlug(url: string): string | null {
  const match = url.match(/leetcode\.com\/problems\/([a-z0-9-]+)/i);
  return match ? match[1].toLowerCase() : null;
}
