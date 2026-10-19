/**
 * How a student is categorised based on their overall solve percentage.
 *
 * Categories are based on total questions solved vs total assigned across the period:
 *
 *   Solving Well    >= 75% questions solved overall
 *   Solving Some    25-74% questions solved overall
 *   Struggling      < 25% questions solved, but has at least one solve or attempt
 *   Not Attempting  No attempts made on any question (0% with no activity)
 *
 * Two additional states exist for measurement gaps:
 *
 *  * `DATA_UNAVAILABLE` — we could not read this student's LeetCode data, so we do not
 *    know what they did.
 *
 *  * `NOT_OBSERVED` — the student was not in the tracker for enough of the period for any
 *    meaningful categorisation.
 *
 * Neither is a performance category and neither is ever counted as one.
 */

import type { DayKey } from './time';

/** Threshold for solving well category (>= 75% solved). */
export const SOLVING_WELL_THRESHOLD = 0.75;
/** Threshold for solving some category (>= 25% and < 75%). */
export const SOLVING_SOME_THRESHOLD = 0.25;
/** Minimum assigned questions to be categorised (avoid edge cases with 0 assignments). */
export const MIN_ASSIGNED_FOR_CATEGORY = 1;

// Legacy exports for backward compatibility
export const CONSISTENT_SOLVER_THRESHOLD = SOLVING_WELL_THRESHOLD;
export const ATTEMPTING_SOLVING_LESS_THRESHOLD = SOLVING_SOME_THRESHOLD;
/**
 * How much of the period a student must have been observable for categorisation.
 *
 * Below this they are `NOT_OBSERVED`: the tracker simply was not watching for enough of
 * the period, and a half-measured student placed in a performance bucket is misleading.
 */
export const MIN_OBSERVED_WEEKS = 1;

// Legacy thresholds kept for backward compatibility with old categoriseStudent function
export const STRONG_WEEK_THRESHOLD = 0.6;
export const NOT_PARTICIPATING_THRESHOLD = 0.2;
export const INCONSISTENT_MIN_STRONG_WEEKS = 2;

export type CampusCategory =
  | 'SOLVING_WELL'
  | 'SOLVING_SOME'
  | 'STRUGGLING'
  | 'NOT_ATTEMPTING'
  | 'NOT_OBSERVED'
  | 'DATA_UNAVAILABLE';

// Legacy type alias for backward compatibility
export type LegacyCampusCategory = 'CONSISTENT_SOLVER' | 'ATTEMPTING_SOLVING_LESS' | 'ATTEMPTING_NOT_SOLVING';

/** Display order: the performance categories in severity order, then the two states. */
export const CAMPUS_CATEGORIES: CampusCategory[] = [
  'SOLVING_WELL',
  'SOLVING_SOME',
  'STRUGGLING',
  'NOT_ATTEMPTING',
  'NOT_OBSERVED',
  'DATA_UNAVAILABLE',
];

export const CAMPUS_CATEGORY_LABELS: Record<CampusCategory, string> = {
  SOLVING_WELL: 'Solving Well',
  SOLVING_SOME: 'Solving Some',
  STRUGGLING: 'Struggling',
  NOT_ATTEMPTING: 'Not Attempting',
  NOT_OBSERVED: 'Not Observed',
  DATA_UNAVAILABLE: 'Data Unavailable',
};

/** Mentor-facing wording explaining each category. */
export const CAMPUS_CATEGORY_MEANINGS: Record<CampusCategory, string> = {
  SOLVING_WELL: 'Solving 75% or more of all assigned questions.',
  SOLVING_SOME: 'Solving 25-74% of assigned questions.',
  STRUGGLING: 'Attempting but solving less than 25%.',
  NOT_ATTEMPTING: 'Not attempting any questions at all.',
  NOT_OBSERVED: 'Joined recently — not enough data to categorise.',
  DATA_UNAVAILABLE: 'Their LeetCode data could not be read. This is not a score of zero.',
};

/** How each category is decided, so a mentor can check the verdict. */
export const CAMPUS_CATEGORY_RULES: Record<CampusCategory, string> = {
  SOLVING_WELL: 'Solved ≥ 75% of all assigned questions in the period.',
  SOLVING_SOME: 'Solved 25-74% of all assigned questions in the period.',
  STRUGGLING: 'Solved < 25% but has at least one attempt or partial solve.',
  NOT_ATTEMPTING: 'No solves and no attempts on any assigned question.',
  NOT_OBSERVED: `Fewer than ${MIN_OBSERVED_WEEKS} week(s) of data available for this student.`,
  DATA_UNAVAILABLE: 'No reliable reading of this student’s submissions for this period.',
};

/** One week of one student, as the canonical daily rows add up to. */
export interface StudentWeek {
  weekNumber: number;
  /** Inclusive program-day bounds. */
  from: string;
  to: string;
  assigned: number;
  /** Distinct assigned problems ever solved — never a windowed figure. */
  solved: number;
  /** Assigned problems submitted against without an accepted verdict. */
  attemptedNotSolved: number;
  /** Assigned problems with no submission at all. */
  notAttempted: number;
  /** False when the tracker was not watching this student for this week. */
  observed: boolean;
}

export interface CategoryInput {
  weeks: StudentWeek[];
  /** False when the provider could not be read for this student at all. */
  dataAvailable: boolean;
}

export interface CategoryVerdict {
  category: CampusCategory;
  /** The weeks the verdict was actually computed over — observed, with work assigned. */
  consideredWeeks: number;
  strongWeeks: number;
  firstHalfPercent: number | null;
  secondHalfPercent: number | null;
  overallPercent: number | null;
  /** One sentence naming the evidence, for the drill-down to show beside the word. */
  because: string;
}

const pct = (solved: number, assigned: number): number | null =>
  assigned === 0 ? null : solved / assigned;

const share = (weeks: StudentWeek[]): number | null => {
  const assigned = weeks.reduce((sum, w) => sum + w.assigned, 0);
  const solved = weeks.reduce((sum, w) => sum + w.solved, 0);
  return pct(solved, assigned);
};

/**
 * Place one student based on their overall solve percentage.
 *
 * Categories:
 *   - SOLVING_WELL: >= 75% solved overall
 *   - SOLVING_SOME: 25-74% solved overall
 *   - STRUGGLING: < 25% solved but has attempts
 *   - NOT_ATTEMPTING: No attempts at all
 *
 * Pure, and takes the weeks rather than fetching them, so the category shown on a campus
 * summary card and the category shown in that card's drill-down are the same function of
 * the same rows.
 */
export function categoriseStudent(input: CategoryInput): CategoryVerdict {
  const { weeks, dataAvailable } = input;

  // Weeks with nothing assigned carry no evidence either way
  const considered = weeks.filter((w) => w.observed && w.assigned > 0);
  
  // Calculate totals across all considered weeks
  const totalAssigned = considered.reduce((sum, w) => sum + w.assigned, 0);
  const totalSolved = considered.reduce((sum, w) => sum + w.solved, 0);
  const totalAttemptedNotSolved = considered.reduce((sum, w) => sum + w.attemptedNotSolved, 0);
  
  // Overall percentage
  const overall = totalAssigned > 0 ? totalSolved / totalAssigned : null;
  const overallPct = overall !== null ? Math.round(overall * 100) : 0;
  
  // Has any activity (solved or attempted)
  const hasActivity = totalSolved > 0 || totalAttemptedNotSolved > 0;

  // Legacy fields for backward compatibility
  const strongWeeks = considered.filter(
    (w) => (pct(w.solved, w.assigned) ?? 0) >= STRONG_WEEK_THRESHOLD,
  ).length;
  const midpoint = Math.ceil(considered.length / 2);
  const firstHalf = share(considered.slice(0, midpoint));
  const secondHalf = share(considered.slice(midpoint));

  const base = {
    consideredWeeks: considered.length,
    strongWeeks,
    firstHalfPercent: firstHalf,
    secondHalfPercent: secondHalf,
    overallPercent: overall,
  };

  // Checked before anything else: no basis for a claim about behaviour
  if (!dataAvailable) {
    return {
      ...base,
      category: 'DATA_UNAVAILABLE',
      because: 'Their LeetCode data could not be read for this period, so no verdict is claimed.',
    };
  }

  if (considered.length < MIN_OBSERVED_WEEKS) {
    return {
      ...base,
      category: 'NOT_OBSERVED',
      because:
        `Only ${considered.length} week(s) of this period fall inside their time in the ` +
        `tracker, which is fewer than the ${MIN_OBSERVED_WEEKS} needed for categorisation.`,
    };
  }

  // Categorisation based on overall percentage
  if (overall !== null && overall >= SOLVING_WELL_THRESHOLD) {
    return {
      ...base,
      category: 'SOLVING_WELL',
      because: `Solved ${overallPct}% of all assigned questions (≥ 75%).`,
    };
  }

  if (overall !== null && overall >= SOLVING_SOME_THRESHOLD) {
    return {
      ...base,
      category: 'SOLVING_SOME',
      because: `Solved ${overallPct}% of all assigned questions (25-74%).`,
    };
  }

  if (hasActivity) {
    return {
      ...base,
      category: 'STRUGGLING',
      because: `Solved ${overallPct}% of assigned questions but has ${totalSolved + totalAttemptedNotSolved} attempt(s).`,
    };
  }

  return {
    ...base,
    category: 'NOT_ATTEMPTING',
    because: `No attempts made on any of the ${totalAssigned} assigned questions.`,
  };
}

/**
 * Monday-to-Sunday weeks covering `[from, to]`, numbered from 1.
 *
 * The first and last weeks are clipped to the period rather than extended outside it, so
 * "Week 1 (06 Aug - 09 Aug)" stays four days long and its percentage is measured against
 * the four days of work actually set — which is how the reference workbook reads.
 */
export function analysisWeeks(from: string, to: string): { weekNumber: number; from: string; to: string }[] {
  const weeks: { weekNumber: number; from: string; to: string }[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return weeks;

  const key = (d: Date): string => d.toISOString().slice(0, 10);
  let cursor = new Date(start);
  let n = 1;
  while (cursor <= end) {
    // 0 = Sunday, so Monday-based offset is (dow + 6) % 7.
    const daysToSunday = 6 - ((cursor.getUTCDay() + 6) % 7);
    const weekEnd = new Date(cursor);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + daysToSunday);
    const clipped = weekEnd > end ? end : weekEnd;
    weeks.push({ weekNumber: n, from: key(cursor), to: key(clipped) });
    cursor = new Date(clipped);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    n += 1;
  }
  return weeks;
}

/* ------------------------------------------------------------------------- *
 * Response shapes.
 *
 * Declared here rather than in the API module so the web client and the server
 * are typed from one definition. A summary card and its drill-down disagreeing
 * is the failure this feature exists to prevent; two copies of the shape they
 * are rendered from is how that starts.
 * ------------------------------------------------------------------------- */

export interface CampusAnalysisPeriod {
  from: DayKey;
  to: DayKey;
}

export interface StudentAnalysis {
  studentId: string;
  name: string;
  campusId: string | null;
  campusCode: string | null;
  squad: string | null;
  batch: string | null;
  leetcodeUsername: string | null;
  leetcodeUrl: string | null;
  /** Distinct assigned problems ever solved across the whole period. */
  solved: number;
  assigned: number;
  attemptedNotSolved: number;
  notAttempted: number;
  /** The tracker's canonical lifetime distinct-solved figure, not a per-period one. */
  totalSolvedAllTime: number;
  dataAvailable: boolean;
  /** Named when `dataAvailable` is false, so the drill-down can say *why*. */
  dataIssue: string | null;
  weeks: StudentWeek[];
  verdict: CategoryVerdict;
}

/**
 * One assigned question, at a campus, in a week.
 *
 * The unit the campus summary counts. A LeetCode problem is one question however many
 * students received it, and a question is *solved* when at least one of the students it
 * was set for has an accepted solution for it — the three outcomes are properties of the
 * question, not sums over students.
 *
 * The student figures riding alongside are supporting detail, never the headline. They
 * are what tells "one of ninety-eight students solved it" apart from "ninety-five did",
 * which the question-level verdict alone cannot say.
 */
export interface CampusQuestion {
  /** Canonical identity. Lowercased LeetCode slug — the only thing deduplication uses. */
  slug: string;
  title: string;
  weekNumber: number;
  /** Assignment dates this question was set on inside the week; usually one. */
  dayKeys: DayKey[];
  outcome: 'SOLVED' | 'ATTEMPTED_NOT_SOLVED' | 'NOT_ATTEMPTED';
  /** Students this question was actually set for — the denominator of the three below. */
  studentsAssigned: number;
  studentsSolved: number;
  studentsAttemptedNotSolved: number;
  studentsNotAttempted: number;
  /** Targeted students with no evidence and no readable LeetCode data — never counted as
   * "not attempted", because that would be a zero nobody measured. */
  studentsNoData: number;
}

/**
 * The outcome counts a week (or the period) reports, in **student x question** units.
 *
 * The first version counted questions: a question was "attempted, not solved" only when
 * *no* targeted student had solved it. At a campus of 20-140 students somebody always
 * had, so the column read 0 for every campus and every week while individual students
 * were plainly failing questions. The outcome of a question is a property of each
 * student who was set it, so these count those pairs, from the same ever-solved
 * per-problem statuses the rest of Campus Analysis reads. `assigned` stays a count of
 * distinct questions — never students x questions — and `questionsSolved` keeps the
 * question-level "did anyone solve it" figure.
 *
 * `solved + attemptedNotSolved + notAttempted + noData = studentQuestions`, and the
 * percentages are over `studentQuestions - noData`.
 */
export interface CampusOutcomeTally {
  /** Distinct LeetCode problems set. Never students x questions. */
  assigned: number;
  /** Distinct problems at least one targeted student has ever solved. */
  questionsSolved: number;
  /** Student x question pairs evaluated (each student set each question). */
  studentQuestions: number;
  solved: number;
  attemptedNotSolved: number;
  notAttempted: number;
  noData: number;
  solvePercent: number | null;
  /** (solved + attemptedNotSolved) / evaluated pairs. */
  attemptPercent: number | null;
  notAttemptedPercent: number | null;
}

/**
 * A campus's week: distinct questions set, and what the students set them did.
 *
 * The outcome counts partition the week's student x question pairs by construction;
 * `assertQuestionTotalsReconcile` checks it anyway, because "by construction" is a claim
 * about the code as written, not as edited.
 */
export interface CampusQuestionWeek extends CampusOutcomeTally {
  weekNumber: number;
  from: DayKey;
  to: DayKey;
  /**
   * Share of the week's set work the campus actually completed, per student.
   *
   * Question-level solve% answers "did anyone get this?", which at a 98-student campus is
   * yes for almost every question — 20 of 20 solved, while the best-answered question
   * reached 15 students and the worst 3. True, and nearly content-free.
   *
   * This is the number that separates those: total student-solves over total
   * student-assignments, which is the mean share of targeted students solving each
   * question. It is deliberately the same figure the old summary reported as its solve
   * percentage — that percentage was always meaningful; what was wrong was the counts
   * beside it, which presented student-question pairs as questions. Keeping it under an
   * honest name preserves the signal instead of throwing it out with the inflated counts.
   */
  studentCompletionPercent: number | null;

  /** Supporting, and kept separate from the question counts on purpose. */
  studentsActive: number;
  studentsObserved: number;
}

export interface CampusAnalysisSummary extends CampusOutcomeTally {
  campusId: string;
  campusCode: string;
  campusName: string;
  activeStudents: number;
  studentsWithUsableData: number;

  /*
   * Period figures: `assigned`/`questionsSolved` are distinct questions over the whole
   * period (a problem set in two weeks is one question), while the student x question
   * counts add every week's pairs.
   */
  /** See `CampusQuestionWeek.studentCompletionPercent`. */
  studentCompletionPercent: number | null;

  categories: {
    category: CampusCategory;
    label: string;
    meaning: string;
    rule: string;
    students: number;
    /** A category of zero is shown, not hidden — "nobody is consistent" is a finding. */
    isPerformanceCategory: boolean;
  }[];
  weeks: CampusQuestionWeek[];
}

/**
 * Check the partition actually partitions, for one campus-week.
 *
 * Returns the complaint rather than throwing: a reconciliation failure is a finding to
 * report on, and an analysis screen that 500s tells a mentor less than one that renders
 * with the discrepancy named.
 */
export function assertQuestionTotalsReconcile(
  week: Pick<CampusQuestionWeek, 'weekNumber' | 'studentQuestions' | 'solved' | 'attemptedNotSolved' | 'notAttempted' | 'noData'>,
): string | null {
  const parts = week.solved + week.attemptedNotSolved + week.notAttempted + week.noData;
  if (parts === week.studentQuestions) return null;
  return (
    `Week ${week.weekNumber}: ${week.solved} solved + ${week.attemptedNotSolved} attempted ` +
    `+ ${week.notAttempted} not attempted + ${week.noData} no data = ${parts}, but ` +
    `${week.studentQuestions} student-question pairs were set.`
  );
}
