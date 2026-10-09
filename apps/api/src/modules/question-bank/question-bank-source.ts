/**
 * Question-bank source loading and import planning — pure, no database.
 *
 * `prepareQuestionBank` turns the committed JSON into exactly what the importer will
 * write, and refuses (returns issues) rather than guessing when the data is wrong. Slug
 * corrections are applied only from `slug-corrections.json`, each carrying its evidence,
 * and every one that fires is reported — nothing is ever corrected silently.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  checkCrossDataset,
  group1SetKey,
  group2SetKey,
  leetcodeProblemUrl,
  toProblemDifficulty,
  validateGroup1,
  validateGroup2,
  type Group1SourceRow,
  type Group2SourceRow,
  type QuestionBankGroup,
  type SlugCorrection,
  type ValidationIssue,
} from '@dsa/shared';

export interface QuestionBankSource {
  group1: Group1SourceRow[];
  group2: Group2SourceRow[];
  corrections: SlugCorrection[];
}

export interface ProblemSeed {
  titleSlug: string;
  leetcodeNumber: number;
  title: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  url: string;
}

export interface EntrySeed {
  group: QuestionBankGroup;
  setKey: string;
  position: number;
  belt: number | null;
  week: number;
  day: number;
  weekday: string | null;
  titleSlug: string;
  leetcodeNumber: number;
  sourceTitle: string;
  sourceDifficulty: 'EASY' | 'MEDIUM' | 'HARD';
  topic: string | null;
  pattern: string | null;
  dayFocus: string | null;
  dailyTheme: string | null;
  role: string | null;
  usage: string | null;
  sourceRow: number;
}

export interface QuestionBankPlan {
  problems: ProblemSeed[];
  entries: EntrySeed[];
  appliedCorrections: SlugCorrection[];
  issues: ValidationIssue[];
  notes: string[];
  counts: { group1Rows: number; group1Sets: number; group2Rows: number; group2Sets: number };
}

export const QUESTION_BANK_DATA_DIR = join(__dirname, '..', '..', '..', 'prisma', 'question-bank');

export function loadQuestionBankSource(dir: string = QUESTION_BANK_DATA_DIR): QuestionBankSource {
  const read = <T>(name: string): T => JSON.parse(readFileSync(join(dir, name), 'utf8')) as T;
  return {
    group1: read<Group1SourceRow[]>('group1.json'),
    group2: read<Group2SourceRow[]>('group2.json'),
    corrections: read<SlugCorrection[]>('slug-corrections.json'),
  };
}

export function prepareQuestionBank(source: QuestionBankSource): QuestionBankPlan {
  const issues: ValidationIssue[] = [];
  const applied: SlugCorrection[] = [];

  // A correction matches one group, one number and one exact bad slug. It cannot be
  // broader than that, so it can never rewrite a row nobody looked at.
  const fixSlug = (group: QuestionBankGroup, number: number, slug: string | null): string | null => {
    const hit = source.corrections.find(
      (c) => c.group === group && c.leetcodeNumber === number && c.from === slug,
    );
    if (!hit) return slug;
    if (!applied.includes(hit)) applied.push(hit);
    return hit.to;
  };

  const group1 = source.group1.map((r) => ({ ...r, titleSlug: fixSlug('GROUP_1', r.leetcodeNumber, r.titleSlug) }));
  const group2 = source.group2.map((r) => ({ ...r, titleSlug: fixSlug('GROUP_2', r.leetcodeNumber, r.titleSlug) }));

  const r1 = validateGroup1(group1);
  const r2 = validateGroup2(group2);
  // The raw (uncorrected) rows go to the cross-check together with the corrections, so a
  // conflict is judged against the recorded decision rather than hidden by pre-applying it.
  const cross = checkCrossDataset(source.group1, source.group2, source.corrections);
  issues.push(...r1.issues, ...r2.issues, ...cross.issues);

  for (const c of source.corrections) {
    if (!applied.includes(c)) {
      issues.push({
        group: c.group,
        sourceRow: null,
        code: 'UNUSED_CORRECTION',
        message: `Correction for #${c.leetcodeNumber} (${c.from} -> ${c.to}) matched no row; the source may have changed.`,
      });
    }
  }

  const problems = new Map<string, ProblemSeed>();
  const consider = (slug: string, number: number, title: string, difficulty: string, group: QuestionBankGroup, row: number) => {
    const diff = toProblemDifficulty(difficulty);
    const seen = problems.get(slug);
    if (!seen) {
      problems.set(slug, { titleSlug: slug, leetcodeNumber: number, title, difficulty: diff, url: leetcodeProblemUrl(slug) });
    } else if (seen.difficulty !== diff) {
      issues.push({
        group,
        sourceRow: row,
        code: 'DIFFICULTY_CONFLICT',
        message: `"${slug}" is ${diff} here but ${seen.difficulty} elsewhere.`,
      });
    }
  };

  const entries: EntrySeed[] = [];
  // Group 1 is read first, so its titles (the fuller dataset) name the shared problems.
  for (const r of group1) {
    if (!r.titleSlug) continue;
    consider(r.titleSlug, r.leetcodeNumber, r.title, r.difficulty, 'GROUP_1', r.sourceRow);
    entries.push({
      group: 'GROUP_1',
      setKey: group1SetKey(r.belt, r.week, r.day),
      position: r.position,
      belt: r.belt,
      week: r.week,
      day: r.day,
      weekday: null,
      titleSlug: r.titleSlug,
      leetcodeNumber: r.leetcodeNumber,
      sourceTitle: r.title,
      sourceDifficulty: toProblemDifficulty(r.difficulty),
      topic: r.topic,
      pattern: r.pattern,
      dayFocus: r.dayFocus,
      dailyTheme: null,
      role: null,
      usage: r.usage,
      sourceRow: r.sourceRow,
    });
  }
  for (const r of group2) {
    if (!r.titleSlug) continue;
    consider(r.titleSlug, r.leetcodeNumber, r.title, r.difficulty, 'GROUP_2', r.sourceRow);
    entries.push({
      group: 'GROUP_2',
      setKey: group2SetKey(r.dayNumber),
      position: r.position,
      belt: null,
      week: r.week,
      day: r.dayNumber,
      weekday: r.weekday,
      titleSlug: r.titleSlug,
      leetcodeNumber: r.leetcodeNumber,
      sourceTitle: r.title,
      sourceDifficulty: toProblemDifficulty(r.difficulty),
      topic: null,
      pattern: null,
      dayFocus: null,
      dailyTheme: r.dailyTheme,
      role: r.role,
      usage: null,
      sourceRow: r.sourceRow,
    });
  }

  return {
    problems: [...problems.values()],
    entries,
    appliedCorrections: applied,
    issues,
    notes: cross.notes,
    counts: {
      group1Rows: r1.rowCount,
      group1Sets: r1.setCount,
      group2Rows: r2.rowCount,
      group2Sets: r2.setCount,
    },
  };
}
