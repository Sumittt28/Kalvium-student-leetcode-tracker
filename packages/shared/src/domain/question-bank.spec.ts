import { describe, expect, it } from 'vitest';

import {
  checkCrossDataset,
  group1SetKey,
  group2SetKey,
  toProblemDifficulty,
  validateGroup1,
  validateGroup2,
  type Group1SourceRow,
  type Group2SourceRow,
  type SlugCorrection,
} from './question-bank';

function g1(over: Partial<Group1SourceRow> = {}): Group1SourceRow {
  return {
    sourceRow: 2,
    leetcodeNumber: 1,
    title: 'Two Sum',
    difficulty: 'Easy',
    topic: 'Hashing',
    pattern: 'Hash map',
    dayFocus: 'Complements',
    url: 'https://leetcode.com/problems/two-sum/',
    titleSlug: 'two-sum',
    belt: 4,
    week: 2,
    day: 3,
    position: 1,
    usage: 'Belt 4 Week 2 Day 3 Q1',
    ...over,
  };
}

function g1Set(belt = 4, week = 2, day = 3, startRow = 2): Group1SourceRow[] {
  return [1, 2, 3, 4].map((position) =>
    g1({
      sourceRow: startRow + position - 1,
      leetcodeNumber: 100 * day + position,
      titleSlug: `problem-${belt}-${week}-${day}-${position}`,
      belt,
      week,
      day,
      position,
    }),
  );
}

function g2(over: Partial<Group2SourceRow> = {}): Group2SourceRow {
  return {
    sourceRow: 2,
    week: 1,
    weekday: 'Mon',
    dayNumber: 1,
    dailyTheme: 'Arrays',
    position: 1,
    role: 'Warm-up',
    leetcodeNumber: 88,
    title: 'Merge Sorted Array',
    difficulty: 'Easy',
    url: 'https://leetcode.com/problems/merge-sorted-array/',
    titleSlug: 'merge-sorted-array',
    ...over,
  };
}

function g2Set(dayNumber = 1): Group2SourceRow[] {
  const roles = ['Warm-up', 'Core', 'Core', 'Stretch'];
  return [1, 2, 3, 4].map((position) =>
    g2({
      sourceRow: dayNumber * 4 + position - 3,
      dayNumber,
      position,
      role: roles[position - 1]!,
      leetcodeNumber: 1000 + dayNumber * 10 + position,
      titleSlug: `g2-${dayNumber}-${position}`,
    }),
  );
}

describe('set keys', () => {
  it('are stable and group-distinct', () => {
    expect(group1SetKey(4, 2, 3)).toBe('G1-B4-W2-D3');
    expect(group2SetKey(17)).toBe('G2-D17');
    expect(group1SetKey(1, 1, 1)).not.toBe(group2SetKey(1));
  });
});

describe('validateGroup1', () => {
  it('accepts complete four-question sets and counts them', () => {
    const report = validateGroup1([...g1Set(4, 2, 3), ...g1Set(4, 2, 4, 6)]);
    expect(report.issues).toEqual([]);
    expect(report.rowCount).toBe(8);
    expect(report.setCount).toBe(2);
  });

  it('reports an incomplete set rather than dropping it', () => {
    const rows = g1Set().slice(0, 3);
    const report = validateGroup1(rows);
    expect(report.issues.map((i) => i.code)).toContain('INCOMPLETE_SET');
    expect(report.rowCount).toBe(3);
  });

  it('reports a duplicated question slot with its row', () => {
    const rows = g1Set();
    rows[3] = { ...rows[3]!, position: 2 };
    const report = validateGroup1(rows);
    const dup = report.issues.find((i) => i.code === 'DUPLICATE_POSITION');
    expect(dup?.sourceRow).toBe(rows[3]!.sourceRow);
  });

  it('flags missing fields, bad difficulty and unreadable links with the exact row', () => {
    const rows = g1Set();
    rows[0] = { ...rows[0]!, topic: '  ', difficulty: 'Nightmare', titleSlug: null };
    const codes = validateGroup1(rows)
      .issues.filter((i) => i.sourceRow === rows[0]!.sourceRow)
      .map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['MISSING_FIELD', 'INVALID_DIFFICULTY', 'INVALID_URL']));
  });

  it('keeps belts of different lengths distinct (no fixed week count assumed)', () => {
    const report = validateGroup1([...g1Set(1, 3, 6), ...g1Set(10, 6, 6, 6)]);
    expect(report.issues).toEqual([]);
    expect(report.setCount).toBe(2);
  });
});

describe('validateGroup2', () => {
  it('accepts a complete day and validates role and week bounds', () => {
    expect(validateGroup2(g2Set(1)).issues).toEqual([]);
    const bad = g2Set(1);
    bad[1] = { ...bad[1]!, role: 'Bonus', week: 17 };
    const codes = validateGroup2(bad).issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['INVALID_ROLE', 'INVALID_IDENTIFIER']));
  });

  it('reports a missing hyperlink instead of inventing a URL', () => {
    const rows = g2Set(2);
    rows[0] = { ...rows[0]!, url: null, titleSlug: null };
    const issue = validateGroup2(rows).issues.find((i) => i.code === 'INVALID_URL');
    expect(issue?.sourceRow).toBe(rows[0]!.sourceRow);
    expect(issue?.message).toContain('(no link)');
  });
});

describe('checkCrossDataset', () => {
  it('counts shared problems and keeps differing titles as notes, not errors', () => {
    const a = g1({ leetcodeNumber: 6, titleSlug: 'zigzag-conversion', title: 'ZigZag Conversion' });
    const b = g2({ leetcodeNumber: 6, titleSlug: 'zigzag-conversion', title: 'Zigzag Conversion' });
    const report = checkCrossDataset([a], [b]);
    expect(report.issues).toEqual([]);
    expect(report.notes.join('\n')).toContain('1 problems appear in both groups');
    expect(report.notes.join('\n')).toContain('Title differs for #6');
  });

  it('reports a slug conflict between groups with both rows', () => {
    const a = g1({ sourceRow: 10, leetcodeNumber: 518, titleSlug: 'coin-change-ii' });
    const b = g2({ sourceRow: 291, leetcodeNumber: 518, titleSlug: 'coin-change-2' });
    const [issue] = checkCrossDataset([a], [b]).issues;
    expect(issue?.code).toBe('SLUG_CONFLICT');
    expect(issue?.sourceRow).toBe(291);
    expect(issue?.message).toContain('GROUP_1 row 10');
  });

  it('accepts a conflict only when an explicit correction records the decision', () => {
    const a = g1({ leetcodeNumber: 518, titleSlug: 'coin-change-ii' });
    const b = g2({ leetcodeNumber: 518, titleSlug: 'coin-change-2' });
    const fix: SlugCorrection = {
      leetcodeNumber: 518,
      group: 'GROUP_2',
      from: 'coin-change-2',
      to: 'coin-change-ii',
      evidence: 'verified against LeetCode',
    };
    expect(checkCrossDataset([a], [b], [fix]).issues).toEqual([]);
    // A correction for a different group does not silently apply.
    expect(checkCrossDataset([a], [b], [{ ...fix, group: 'GROUP_1' }]).issues).toHaveLength(1);
  });

  it('flags one slug claimed by two different LeetCode numbers', () => {
    const a = g1({ leetcodeNumber: 1, titleSlug: 'same' });
    const b = g2({ leetcodeNumber: 2, titleSlug: 'same' });
    expect(checkCrossDataset([a], [b]).issues.map((i) => i.code)).toContain('SLUG_REUSED');
  });
});

describe('helpers', () => {
  it('maps source difficulty and rejects unknown values', () => {
    expect(toProblemDifficulty('Easy')).toBe('EASY');
    expect(toProblemDifficulty('Hard')).toBe('HARD');
    expect(() => toProblemDifficulty('easy')).toThrow();
  });
});
