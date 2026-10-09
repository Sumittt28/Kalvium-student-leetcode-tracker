/**
 * Coding Hours Question Bank — the curated curriculum, as data.
 *
 * Two datasets, kept apart on purpose:
 *
 *   Group 1 — Dojo / Belt Progression. Identified by `Belt + Week + Day`; four questions
 *             per day, ordered by `Q#`. Belts have different lengths, and the source
 *             carries six curriculum days per week (see `GROUP_1_SOURCE_DAYS_PER_WEEK`).
 *   Group 2 — Placement Readiness. 16 weeks x 5 practice days; identified by the running
 *             `Day #` (1-80); four questions per day with a Warm-up / Core / Stretch role.
 *
 * A *curriculum occurrence* (this problem, in this group, belt, week, day and slot) is a
 * different thing from the LeetCode *problem* it points at. 261 problems appear in both
 * groups; each occurrence is kept, and they share one underlying problem identity.
 *
 * Everything here is pure. The validator reports problems — it never fixes, drops or
 * rewrites a row: the supplied files are curated, and a silent "correction" is exactly how
 * a curriculum drifts from its source without anyone deciding it should.
 */

export const QUESTION_BANK_GROUPS = ['GROUP_1', 'GROUP_2'] as const;
export type QuestionBankGroup = (typeof QUESTION_BANK_GROUPS)[number];

export const QUESTION_BANK_GROUP_LABELS: Record<QuestionBankGroup, string> = {
  GROUP_1: 'Group 1 — Dojo / Belt Progression',
  GROUP_2: 'Group 2 — Placement Readiness',
};

export const QUESTION_BANK_GROUP_DESCRIPTIONS: Record<QuestionBankGroup, string> = {
  GROUP_1:
    'The belt-specific question bank: four questions per curriculum day, organised by belt, week and day.',
  GROUP_2:
    'The 16-week placement-preparation question bank: five practice days a week, four questions a day.',
};

export const QUESTIONS_PER_SET = 4;
export const QUESTION_ROLES = ['Warm-up', 'Core', 'Stretch'] as const;
export type QuestionRole = (typeof QUESTION_ROLES)[number];

/**
 * The supplied Group 1 data has six curriculum days per belt-week, while the operating
 * rule is five practice days (no questions are shared on the weekly concept-session day).
 * Which five of the six map to the practice week has NOT been decided, so all six are kept
 * and nothing here schedules, skips or merges a day.
 */
export const GROUP_1_SOURCE_DAYS_PER_WEEK = 6;
export const GROUP_1_OPERATIONAL_DAYS_PER_WEEK = 5;

const SOURCE_DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;
export type SourceDifficulty = (typeof SOURCE_DIFFICULTIES)[number];

/** One row exactly as supplied (plus the slug taken from its link). */
export interface Group1SourceRow {
  sourceRow: number;
  leetcodeNumber: number;
  title: string;
  difficulty: string;
  topic: string;
  pattern: string;
  dayFocus: string;
  url: string;
  titleSlug: string | null;
  belt: number;
  week: number;
  day: number;
  position: number;
  usage: string;
}

export interface Group2SourceRow {
  sourceRow: number;
  week: number;
  weekday: string;
  dayNumber: number;
  dailyTheme: string;
  position: number;
  role: string;
  leetcodeNumber: number;
  title: string;
  difficulty: string;
  url: string | null;
  titleSlug: string | null;
}

/** A reviewable, explicit override for a slug the source gets wrong. Never implicit. */
export interface SlugCorrection {
  leetcodeNumber: number;
  group: QuestionBankGroup;
  from: string;
  to: string;
  evidence: string;
}

/** Stable key for a curriculum day, used for provenance and idempotent upserts. */
export function group1SetKey(belt: number, week: number, day: number): string {
  return `G1-B${belt}-W${week}-D${day}`;
}
export function group2SetKey(dayNumber: number): string {
  return `G2-D${dayNumber}`;
}

export interface ValidationIssue {
  group: QuestionBankGroup;
  /** 1-based spreadsheet row, when the issue belongs to one row. */
  sourceRow: number | null;
  code: string;
  message: string;
}

export interface ValidationReport {
  rowCount: number;
  setCount: number;
  issues: ValidationIssue[];
  /** Cross-dataset facts worth showing a human, not failures. */
  notes: string[];
}

const LEETCODE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

function presentText(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

function positiveInt(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) > 0;
}

/** Checks one group's rows; groups sets by `keyOf` and requires slots 1..4 exactly once. */
function checkSets<T extends { sourceRow: number; position: number }>(
  group: QuestionBankGroup,
  rows: readonly T[],
  keyOf: (row: T) => string,
  issues: ValidationIssue[],
): number {
  const sets = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = sets.get(key);
    if (bucket) bucket.push(row);
    else sets.set(key, [row]);
  }
  for (const [key, members] of sets) {
    const positions = members.map((m) => m.position).sort((a, b) => a - b);
    const seen = new Set<number>();
    for (const member of members) {
      if (seen.has(member.position)) {
        issues.push({
          group,
          sourceRow: member.sourceRow,
          code: 'DUPLICATE_POSITION',
          message: `${key}: question slot ${member.position} appears more than once.`,
        });
      }
      seen.add(member.position);
    }
    if (positions.join(',') !== '1,2,3,4') {
      issues.push({
        group,
        sourceRow: null,
        code: 'INCOMPLETE_SET',
        message: `${key}: expected exactly slots 1-4, found [${positions.join(', ')}].`,
      });
    }
  }
  return sets.size;
}

export function validateGroup1(rows: readonly Group1SourceRow[]): ValidationReport {
  const issues: ValidationIssue[] = [];
  for (const r of rows) {
    const bad = (code: string, message: string) =>
      issues.push({ group: 'GROUP_1', sourceRow: r.sourceRow, code, message });
    if (!positiveInt(r.leetcodeNumber)) bad('MISSING_FIELD', 'LeetCode # is missing or invalid.');
    for (const [name, value] of [
      ['Problem', r.title],
      ['Topic', r.topic],
      ['Pattern', r.pattern],
      ['Day Focus', r.dayFocus],
      ['URL', r.url],
      ['Usage', r.usage],
    ] as const) {
      if (!presentText(value)) bad('MISSING_FIELD', `${name} is missing.`);
    }
    if (!(SOURCE_DIFFICULTIES as readonly string[]).includes(r.difficulty)) {
      bad('INVALID_DIFFICULTY', `Difficulty "${r.difficulty}" is not Easy, Medium or Hard.`);
    }
    if (!positiveInt(r.belt) || !positiveInt(r.week) || !positiveInt(r.day)) {
      bad('INVALID_IDENTIFIER', `Belt/Week/Day (${r.belt}/${r.week}/${r.day}) must be positive integers.`);
    }
    if (!(Number.isInteger(r.position) && r.position >= 1 && r.position <= QUESTIONS_PER_SET)) {
      bad('INVALID_POSITION', `Q# ${r.position} is outside 1-${QUESTIONS_PER_SET}.`);
    }
    if (!r.titleSlug || !LEETCODE_SLUG.test(r.titleSlug)) {
      bad('INVALID_URL', `No LeetCode problem slug could be read from "${r.url}".`);
    }
  }
  const setCount = checkSets('GROUP_1', rows, (r) => group1SetKey(r.belt, r.week, r.day), issues);
  return { rowCount: rows.length, setCount, issues, notes: [] };
}

export function validateGroup2(rows: readonly Group2SourceRow[]): ValidationReport {
  const issues: ValidationIssue[] = [];
  for (const r of rows) {
    const bad = (code: string, message: string) =>
      issues.push({ group: 'GROUP_2', sourceRow: r.sourceRow, code, message });
    if (!positiveInt(r.leetcodeNumber)) bad('MISSING_FIELD', 'LC # is missing or invalid.');
    for (const [name, value] of [
      ['Problem', r.title],
      ['Daily theme', r.dailyTheme],
      ['Day (weekday)', r.weekday],
    ] as const) {
      if (!presentText(value)) bad('MISSING_FIELD', `${name} is missing.`);
    }
    if (!(SOURCE_DIFFICULTIES as readonly string[]).includes(r.difficulty)) {
      bad('INVALID_DIFFICULTY', `Difficulty "${r.difficulty}" is not Easy, Medium or Hard.`);
    }
    if (!(QUESTION_ROLES as readonly string[]).includes(r.role)) {
      bad('INVALID_ROLE', `Role "${r.role}" is not Warm-up, Core or Stretch.`);
    }
    if (!positiveInt(r.week) || r.week > 16) bad('INVALID_IDENTIFIER', `Week ${r.week} is outside 1-16.`);
    if (!positiveInt(r.dayNumber) || r.dayNumber > 80) {
      bad('INVALID_IDENTIFIER', `Day # ${r.dayNumber} is outside 1-80.`);
    }
    if (!(Number.isInteger(r.position) && r.position >= 1 && r.position <= QUESTIONS_PER_SET)) {
      bad('INVALID_POSITION', `Q# ${r.position} is outside 1-${QUESTIONS_PER_SET}.`);
    }
    if (!r.titleSlug || !LEETCODE_SLUG.test(r.titleSlug)) {
      bad('INVALID_URL', `No LeetCode problem slug could be read from "${r.url ?? '(no link)'}".`);
    }
  }
  const setCount = checkSets('GROUP_2', rows, (r) => group2SetKey(r.dayNumber), issues);
  return { rowCount: rows.length, setCount, issues, notes: [] };
}

/**
 * Cross-dataset identity check. The same LeetCode number must resolve to one slug in both
 * files; where it does not, that is reported with both rows so a human can decide, unless
 * an explicit `SlugCorrection` already records the decision and its evidence.
 */
export function checkCrossDataset(
  group1: readonly Group1SourceRow[],
  group2: readonly Group2SourceRow[],
  corrections: readonly SlugCorrection[] = [],
): ValidationReport {
  const issues: ValidationIssue[] = [];
  const notes: string[] = [];
  const corrected = (group: QuestionBankGroup, n: number, slug: string | null) =>
    corrections.find((c) => c.group === group && c.leetcodeNumber === n && c.from === slug);

  const slugByNumber = new Map<number, { slug: string; group: QuestionBankGroup; row: number }>();
  const consider = (
    group: QuestionBankGroup,
    row: number,
    n: number,
    raw: string | null,
  ): void => {
    if (!raw) return;
    const fix = corrected(group, n, raw);
    const slug = fix ? fix.to : raw;
    const seen = slugByNumber.get(n);
    if (!seen) {
      slugByNumber.set(n, { slug, group, row });
    } else if (seen.slug !== slug) {
      issues.push({
        group,
        sourceRow: row,
        code: 'SLUG_CONFLICT',
        message:
          `LeetCode #${n} is "${slug}" here but "${seen.slug}" in ${seen.group} row ${seen.row}. ` +
          'Add a SlugCorrection with evidence, or fix the source.',
      });
    }
  };
  group1.forEach((r) => consider('GROUP_1', r.sourceRow, r.leetcodeNumber, r.titleSlug));
  group2.forEach((r) => consider('GROUP_2', r.sourceRow, r.leetcodeNumber, r.titleSlug));

  const slugOwners = new Map<string, Set<number>>();
  for (const [n, { slug }] of slugByNumber) {
    const owners = slugOwners.get(slug) ?? new Set<number>();
    owners.add(n);
    slugOwners.set(slug, owners);
  }
  for (const [slug, owners] of slugOwners) {
    if (owners.size > 1) {
      issues.push({
        group: 'GROUP_1',
        sourceRow: null,
        code: 'SLUG_REUSED',
        message: `Slug "${slug}" is used for LeetCode numbers ${[...owners].join(', ')}.`,
      });
    }
  }

  const in1 = new Set(group1.map((r) => r.leetcodeNumber));
  const shared = new Set(group2.map((r) => r.leetcodeNumber).filter((n) => in1.has(n)));
  notes.push(`${slugByNumber.size} distinct LeetCode problems across both groups.`);
  notes.push(`${shared.size} problems appear in both groups.`);

  const title1 = new Map(group1.map((r) => [r.leetcodeNumber, r.title]));
  for (const r of group2) {
    const other = title1.get(r.leetcodeNumber);
    if (other !== undefined && other !== r.title) {
      notes.push(`Title differs for #${r.leetcodeNumber}: "${other}" (G1) vs "${r.title}" (G2) — both kept.`);
    }
  }
  return { rowCount: group1.length + group2.length, setCount: 0, issues, notes };
}

/** Source difficulty -> the `Difficulty` enum stored on `Problem`. */
export function toProblemDifficulty(source: string): 'EASY' | 'MEDIUM' | 'HARD' {
  switch (source) {
    case 'Easy':
      return 'EASY';
    case 'Medium':
      return 'MEDIUM';
    case 'Hard':
      return 'HARD';
    default:
      throw new Error(`Unknown difficulty "${source}"`);
  }
}

// ---------------------------------------------------------------------------
// API shapes — what the browse endpoints return and the UI renders
// ---------------------------------------------------------------------------

export interface QuestionBankQuestionDto {
  position: number;
  leetcodeNumber: number;
  /** The title exactly as supplied for this group (never normalised). */
  title: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  titleSlug: string;
  url: string;
  problemId: string;
  topic: string | null;
  pattern: string | null;
  dayFocus: string | null;
  dailyTheme: string | null;
  role: string | null;
  usage: string | null;
  /** True when this question satisfied the search/filters that selected its day. */
  matched: boolean;
}

/** One four-question curriculum day, questions always in Q1-Q4 order. */
export interface QuestionBankSetDto {
  group: QuestionBankGroup;
  setKey: string;
  belt: number | null;
  week: number;
  /** Group 1: curriculum day 1-6. Group 2: running Day # 1-80. */
  day: number;
  weekday: string | null;
  dailyTheme: string | null;
  dayFocus: string | null;
  questions: QuestionBankQuestionDto[];
}

export interface QuestionBankSetsResponse {
  group: QuestionBankGroup;
  items: QuestionBankSetDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface QuestionBankFiltersResponse {
  group: QuestionBankGroup;
  /** Group 1: each belt with its own weeks — belts differ in length. */
  belts: { belt: number; weeks: number[] }[];
  /** Group 2: weeks 1-16 present in the data. */
  weeks: number[];
  weekdays: string[];
  topics: string[];
  patterns: string[];
  dailyThemes: string[];
  roles: string[];
  difficulties: ('EASY' | 'MEDIUM' | 'HARD')[];
  totals: { sets: number; questions: number };
}
