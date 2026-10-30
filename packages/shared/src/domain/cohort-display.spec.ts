import { describe, expect, it } from 'vitest';

import {
  cohortAssignmentTopic,
  cohortSetTitle,
  cohortTabFromParam,
  cohortTabOfSet,
  cohortTabQuery,
  parseAssignmentTopic,
} from './cohort-display';

const g1 = (belt: number, week = 2, day = 3) => ({ group: 'GROUP_1' as const, belt, week, day });
const g2 = { group: 'GROUP_2' as const, belt: null, week: 2, day: 8, weekday: 'Wed' };

describe('cohort display mapping', () => {
  it('files Belt 5 under C1, Belt 6 under C2, Group 2 under C3, the rest under Other', () => {
    expect(cohortTabOfSet(g1(5))).toBe('C1');
    expect(cohortTabOfSet(g1(6))).toBe('C2');
    expect(cohortTabOfSet(g2)).toBe('C3');
    expect(cohortTabOfSet(g1(4))).toBe('OTHER');
    expect(cohortTabOfSet(g1(10))).toBe('OTHER');
  });

  it('maps every tab to a storage query that returns only its days', () => {
    expect(cohortTabQuery('C1')).toEqual({ group: 'GROUP_1', belt: '5' });
    expect(cohortTabQuery('C2')).toEqual({ group: 'GROUP_1', belt: '6' });
    expect(cohortTabQuery('C3')).toEqual({ group: 'GROUP_2', belt: '' });
    expect(cohortTabQuery('OTHER').group).toBe('GROUP_1');
  });

  it('keeps old ?group= links working', () => {
    expect(cohortTabFromParam('GROUP_2')).toBe('C3');
    expect(cohortTabFromParam('GROUP_1')).toBe('C1');
    expect(cohortTabFromParam('c2')).toBe('C2');
    expect(cohortTabFromParam(null)).toBe('C1');
  });

  it('titles and topics read in cohort terms', () => {
    expect(cohortSetTitle(g1(5))).toBe('Week 2 · Day 3');
    expect(cohortSetTitle(g2)).toBe('Week 2 · Wed · Day 8');
    expect(cohortSetTitle(g1(4, 1, 2))).toBe('Belt 4 · Week 1 · Day 2');
    expect(cohortAssignmentTopic(g1(6))).toBe('C2 · Week 2 · Day 3');
    expect(cohortAssignmentTopic(g2)).toBe('C3 · Week 2 · Wed · Day 8');
    expect(cohortAssignmentTopic(g1(4, 1, 2))).toBe('Belt 4 · Week 1 · Day 2');
  });
});

describe('parseAssignmentTopic', () => {
  it('reads the new format', () => {
    expect(parseAssignmentTopic('C1 · Week 2 · Day 3')).toEqual({ cohort: 'C1', label: 'Week 2 · Day 3' });
  });

  it('still reads every old format (nothing already stored changes)', () => {
    expect(parseAssignmentTopic('Group 1 · Belt 5 · Week 2 · Day 3')).toEqual({ cohort: 'C1', label: 'Week 2 · Day 3' });
    expect(parseAssignmentTopic('Group 1 · Belt 6 · Week 1 · Day 2')).toEqual({ cohort: 'C2', label: 'Week 1 · Day 2' });
    expect(parseAssignmentTopic('Group 2 · Week 1 · Tue · Day 2')).toEqual({ cohort: 'C3', label: 'Week 1 · Tue · Day 2' });
    expect(parseAssignmentTopic('Group 1 · Belt 4 · Week 1 · Day 1')).toEqual({ cohort: null, label: 'Belt 4 · Week 1 · Day 1' });
  });

  it('leaves free-text topics alone', () => {
    expect(parseAssignmentTopic('Sliding Window')).toEqual({ cohort: null, label: null });
    expect(parseAssignmentTopic(null)).toEqual({ cohort: null, label: null });
  });
});
