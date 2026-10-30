/**
 * How the Question Bank and assignment history are *named on screen*.
 *
 * The curriculum is stored as Group 1 (by belt) and Group 2, but the programme is run by
 * cohort: C1 prepares for Belt 5, C2 for Belt 6, C3 is placement practice. Showing the
 * storage names made the Question Bank say "Group 1" while everything else said "C1".
 *
 * This module is display only. Set keys (`G1-B5-W1-D1`, `G2-D1`), the `group` and `belt`
 * columns and stored assignment topics are untouched - it maps them to the cohort names a
 * mentor uses, and reads old *and* new topic strings, so no existing data has to change.
 *
 * Pure: no I/O.
 */

export type CohortCode = 'C1' | 'C2' | 'C3';
export type CohortTab = CohortCode | 'OTHER';
export const COHORT_TABS: readonly CohortTab[] = ['C1', 'C2', 'C3', 'OTHER'];

export const COHORT_TAB_INFO: Record<CohortTab, { title: string; subtitle: string; description: string }> = {
  C1: {
    title: 'C1',
    subtitle: 'Preparing for Belt 5',
    description: 'Questions for the cohort preparing for Belt 5. Four questions a day, five practice days a week.',
  },
  C2: {
    title: 'C2',
    subtitle: 'Preparing for Belt 6',
    description: 'Questions for the cohort preparing for Belt 6. Four questions a day, five practice days a week.',
  },
  C3: {
    title: 'C3',
    subtitle: 'Placement practice',
    description: 'The 16-week placement track for students who have cleared Belt 6. Four questions a day, five days a week.',
  },
  OTHER: {
    title: 'Other belts',
    subtitle: 'Belts 1-4 and 7-10',
    description: 'Reference questions for belts that no cohort is currently running.',
  },
};

/** Belt a cohort's questions are filed under (Group 1 only). C3 lives in Group 2. */
const COHORT_BELT: Partial<Record<CohortCode, number>> = { C1: 5, C2: 6 };

interface SetLike {
  group: 'GROUP_1' | 'GROUP_2';
  belt: number | null;
  week: number | null;
  day: number | null;
  weekday?: string | null;
}

/** Which tab a Question Bank day belongs to. */
export function cohortTabOfSet(set: Pick<SetLike, 'group' | 'belt'>): CohortTab {
  if (set.group === 'GROUP_2') return 'C3';
  if (set.belt === COHORT_BELT.C1) return 'C1';
  if (set.belt === COHORT_BELT.C2) return 'C2';
  return 'OTHER';
}

/** The storage query that returns exactly one tab's days. `belt` is '' when not narrowed. */
export function cohortTabQuery(tab: CohortTab): { group: 'GROUP_1' | 'GROUP_2'; belt: string } {
  if (tab === 'C3') return { group: 'GROUP_2', belt: '' };
  if (tab === 'C1') return { group: 'GROUP_1', belt: String(COHORT_BELT.C1) };
  if (tab === 'C2') return { group: 'GROUP_1', belt: String(COHORT_BELT.C2) };
  return { group: 'GROUP_1', belt: '' };
}

/** Old links used `?group=GROUP_1|GROUP_2`; keep them landing somewhere sensible. */
export function cohortTabFromParam(param: string | null | undefined): CohortTab {
  const value = (param ?? '').toUpperCase();
  if ((COHORT_TABS as readonly string[]).includes(value)) return value as CohortTab;
  if (value === 'GROUP_2') return 'C3';
  return 'C1';
}

/** "Week 2 · Day 3" for C1/C2, "Week 2 · Wed · Day 8" for C3, "Belt 4 · Week 1 · Day 2" otherwise. */
export function cohortSetTitle(set: SetLike): string {
  const tab = cohortTabOfSet(set);
  if (tab === 'C3') return `Week ${set.week} · ${set.weekday} · Day ${set.day}`;
  if (tab === 'OTHER') return `Belt ${set.belt} · Week ${set.week} · Day ${set.day}`;
  return `Week ${set.week} · Day ${set.day}`;
}

/** The topic stored on a new assignment made from the Question Bank: "C1 · Week 2 · Day 3". */
export function cohortAssignmentTopic(set: SetLike): string {
  const tab = cohortTabOfSet(set);
  return tab === 'OTHER' ? cohortSetTitle(set) : `${tab} · ${cohortSetTitle(set)}`;
}

/**
 * Cohort and readable label from a stored assignment topic. Understands the new
 * "C1 · Week 2 · Day 3" and the older "Group 1 · Belt 5 · Week 2 · Day 3" /
 * "Group 2 · Week 1 · Tue · Day 2", so history written before the rename still reads right.
 */
export function parseAssignmentTopic(topic: string | null): { cohort: CohortCode | null; label: string | null } {
  if (!topic) return { cohort: null, label: null };

  const fresh = topic.match(/^(C[123])\s*[·•]\s*(.+)$/i);
  if (fresh) return { cohort: fresh[1]!.toUpperCase() as CohortCode, label: fresh[2]!.trim() };

  const g1 = topic.match(/^Group\s*1\s*[·•]\s*(.+)$/i);
  if (g1) {
    const rest = g1[1]!.trim();
    const belt = rest.match(/^Belt\s*(\d+)\s*[·•]\s*(.+)$/i);
    if (belt && Number(belt[1]) === COHORT_BELT.C1) return { cohort: 'C1', label: belt[2]!.trim() };
    if (belt && Number(belt[1]) === COHORT_BELT.C2) return { cohort: 'C2', label: belt[2]!.trim() };
    return { cohort: null, label: rest };
  }

  const g2 = topic.match(/^Group\s*2\s*[·•]\s*(.+)$/i);
  if (g2) return { cohort: 'C3', label: g2[1]!.trim() };

  return { cohort: null, label: null };
}
