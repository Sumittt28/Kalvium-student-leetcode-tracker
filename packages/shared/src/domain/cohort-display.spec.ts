import { describe, expect, it } from 'vitest';

import {
  revisionWeekOf,
  srmPlanOf,
  extensionOf,
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

describe('extension weeks', () => {
  const ext = (group: 'GROUP_1' | 'GROUP_2', belt: number | null, week: number, day: number, focus: string, setKey: string) => ({
    group, belt, week, day, weekday: null, dayFocus: focus, dailyTheme: group === 'GROUP_2' ? focus : null, setKey,
  });

  it('shows Belt 5/6 and Group 2 extension days as "Week N Extended" with the in-extension day', () => {
    expect(cohortSetTitle(ext('GROUP_1', 5, 8, 2, 'Week 3 Extended \u2014 Stacks & queues', 'G1-C1-W8-D2'))).toBe('Week 3 Extended · Day 2');
    expect(cohortSetTitle(ext('GROUP_1', 6, 7, 4, 'Week 2 Extended \u2014 Divide & conquer', 'G1-C2-W7-D4'))).toBe('Week 2 Extended · Day 4');
    expect(cohortSetTitle(ext('GROUP_2', null, 17, 90, 'Week 2 Extended \u2014 Strings & two pointers', 'G2-W17-EXT-D4'))).toBe('Week 2 Extended · Day 4');
  });

  it('files them under the same cohort tab and builds the assignment topic from the title', () => {
    const s = ext('GROUP_1', 5, 8, 1, 'Week 3 Extended \u2014 Stacks & queues', 'G1-C1-W8-D1');
    expect(cohortTabOfSet(s)).toBe('C1');
    expect(cohortAssignmentTopic(s)).toBe('C1 · Week 3 Extended · Day 1');
    const g2 = ext('GROUP_2', null, 18, 91, 'Week 3 Extended \u2014 Sliding window', 'G2-W18-EXT-D1');
    expect(cohortTabOfSet(g2)).toBe('C3');
    expect(cohortAssignmentTopic(g2)).toBe('C3 · Week 3 Extended · Day 1');
  });

  it('does not touch the older extension sets or normal curriculum days', () => {
    expect(extensionOf({ dayFocus: 'Week 1 Concepts Extended', dailyTheme: null, setKey: 'G1-C1-W5-D1', day: 1 })).toBeNull();
    expect(cohortSetTitle({ group: 'GROUP_1', belt: 5, week: 5, day: 1, weekday: null, dayFocus: 'Week 1 Concepts Extended', setKey: 'G1-C1-W5-D1' })).toBe('Week 5 · Day 1');
    expect(cohortSetTitle({ group: 'GROUP_1', belt: 5, week: 2, day: 3, dayFocus: 'Adding numbers stored as linked lists', setKey: 'G1-B5-W2-D3' })).toBe('Week 2 · Day 3');
    expect(cohortSetTitle({ group: 'GROUP_2', belt: null, week: 2, day: 8, weekday: 'Wed', dailyTheme: 'Two pointers: opposite ends', setKey: 'G2-D8' })).toBe('Week 2 · Wed · Day 8');
  });

  it('is exactly parseable back from the stored assignment topic', () => {
    expect(parseAssignmentTopic('C3 · Week 2 Extended · Day 1')).toEqual({ cohort: 'C3', label: 'Week 2 Extended · Day 1' });
  });
});

describe('SRM plan days', () => {
  const srm = (day: number) => ({
    group: 'GROUP_1' as const, belt: 5, week: 11, day, weekday: null,
    dayFocus: 'SRM Week 1 \u2014 Reading & traversal', dailyTheme: null, setKey: `G1-SRM5-W1-D${day}`,
  });

  it('titles SRM days "SRM Week N · Day D" using the day in the set key', () => {
    expect(cohortSetTitle(srm(1))).toBe('SRM Week 1 · Day 1');
    expect(cohortSetTitle(srm(5))).toBe('SRM Week 1 · Day 5');
    expect(srmPlanOf(srm(3))).toEqual({ week: 1, day: 3 });
  });

  it('builds an assignment topic without a C1/C2/C3 prefix, and still files the set under Belt 5', () => {
    expect(cohortAssignmentTopic(srm(2))).toBe('SRM Week 1 · Day 2');
    expect(cohortTabOfSet(srm(2))).toBe('C1');
    expect(parseAssignmentTopic('SRM Week 1 · Day 2')).toEqual({ cohort: null, label: null });
  });

  it('leaves extension weeks, curriculum days and older extension sets exactly as they were', () => {
    expect(srmPlanOf({ dayFocus: 'Week 3 Extended \u2014 Stacks', dailyTheme: null, setKey: 'G1-C1-W8-D1', day: 1 })).toBeNull();
    expect(cohortSetTitle({ group: 'GROUP_1', belt: 5, week: 8, day: 1, dayFocus: 'Week 3 Extended \u2014 Stacks & queues', setKey: 'G1-C1-W8-D1' })).toBe('Week 3 Extended · Day 1');
    expect(cohortSetTitle({ group: 'GROUP_1', belt: 5, week: 2, day: 3, dayFocus: 'Adding numbers stored as linked lists', setKey: 'G1-B5-W2-D3' })).toBe('Week 2 · Day 3');
  });
});

describe('revision week', () => {
  const rev = (day: number) => ({
    group: 'GROUP_1' as const, belt: 5, week: 9, day, weekday: null,
    dayFocus: 'Week 5 Extended week for Revision \u2014 Stacks', dailyTheme: null, setKey: `G1-C1-W9-D${day}`,
  });

  it('titles revision days "Week 5 · Extended week for Revision · Day D" and files them under C1', () => {
    expect(cohortSetTitle(rev(3))).toBe('Week 5 · Extended week for Revision · Day 3');
    expect(revisionWeekOf(rev(3))).toEqual({ week: 5, day: 3 });
    expect(cohortTabOfSet(rev(3))).toBe('C1');
    expect(cohortAssignmentTopic(rev(2))).toBe('C1 · Week 5 · Extended week for Revision · Day 2');
    expect(parseAssignmentTopic('C1 · Week 5 · Extended week for Revision · Day 2')).toEqual({ cohort: 'C1', label: 'Week 5 · Extended week for Revision · Day 2' });
  });

  it('is not mistaken for an extension week, and extension weeks are not mistaken for it', () => {
    expect(extensionOf(rev(1))).toBeNull();
    expect(revisionWeekOf({ dayFocus: 'Week 3 Extended \u2014 Stacks & queues', dailyTheme: null, setKey: 'G1-C1-W8-D1', day: 1 })).toBeNull();
    expect(cohortSetTitle({ group: 'GROUP_1', belt: 5, week: 8, day: 1, dayFocus: 'Week 3 Extended \u2014 Stacks & queues', setKey: 'G1-C1-W8-D1' })).toBe('Week 3 Extended · Day 1');
  });
});
