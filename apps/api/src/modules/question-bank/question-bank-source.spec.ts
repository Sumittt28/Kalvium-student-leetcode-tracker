import { describe, expect, it } from 'vitest';

import { loadQuestionBankSource, prepareQuestionBank } from './question-bank-source';

/**
 * These run against the *committed* source files, so a bad edit to the data fails CI rather
 * than a Render deploy.
 */
describe('committed question-bank source', () => {
  const source = loadQuestionBankSource();
  const plan = prepareQuestionBank(source);

  it('preserves every supplied row and every four-question day', () => {
    expect(plan.counts).toEqual({ group1Rows: 800, group1Sets: 200, group2Rows: 320, group2Sets: 80 });
    expect(plan.entries).toHaveLength(1120);
  });

  it('passes validation with no issues', () => {
    expect(plan.issues).toEqual([]);
  });

  it('covers belts 1-10 and weeks 1-16 without assuming equal lengths', () => {
    const g1 = plan.entries.filter((e) => e.group === 'GROUP_1');
    expect([...new Set(g1.map((e) => e.belt))].sort((a, b) => a! - b!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const weeksByBelt = new Map<number, Set<number>>();
    for (const e of g1) weeksByBelt.set(e.belt!, (weeksByBelt.get(e.belt!) ?? new Set()).add(e.week));
    expect(weeksByBelt.get(1)!.size).toBe(1);
    expect(weeksByBelt.get(2)!.size).toBe(3);
    expect(weeksByBelt.get(9)!.size).toBe(5);
    expect(weeksByBelt.get(10)!.size).toBe(6);
    const g2 = plan.entries.filter((e) => e.group === 'GROUP_2');
    expect(new Set(g2.map((e) => e.week)).size).toBe(16);
    expect(new Set(g2.map((e) => e.weekday))).toEqual(new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']));
  });

  it('gives every Group 1 belt-week exactly five practice days of four questions (no concept-session day)', () => {
    const g1 = plan.entries.filter((e) => e.group === 'GROUP_1');
    const days = new Map<string, Set<number>>();
    for (const e of g1) {
      const k = `${e.belt}-${e.week}`;
      days.set(k, (days.get(k) ?? new Set()).add(e.day));
    }
    expect(days.size).toBe(40);
    for (const set of days.values()) expect([...set].sort()).toEqual([1, 2, 3, 4, 5]);
    // The old sixth day is gone, not renumbered or hidden.
    expect(g1.some((e) => e.day === 6)).toBe(false);
  });

  it('keeps each Group 1 day Easy -> Medium -> Hard, and Belts 1-3 free of Hard problems', () => {
    const g1 = plan.entries.filter((e) => e.group === 'GROUP_1');
    const rank = { EASY: 0, MEDIUM: 1, HARD: 2 } as const;
    const byDay = new Map<string, typeof g1>();
    for (const e of g1) byDay.set(e.setKey, [...(byDay.get(e.setKey) ?? []), e]);
    for (const day of byDay.values()) {
      const ranks = day.sort((a, b) => a.position - b.position).map((e) => rank[e.sourceDifficulty]);
      expect(ranks).toEqual([...ranks].sort());
    }
    expect(g1.filter((e) => e.belt! <= 3 && e.sourceDifficulty === 'HARD')).toEqual([]);
  });

  it('never repeats a problem inside Group 1', () => {
    const slugs = plan.entries.filter((e) => e.group === 'GROUP_1').map((e) => e.titleSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('keeps Group 2 role and theme metadata, and Group 1 topic/pattern/focus/usage', () => {
    const g2 = plan.entries.filter((e) => e.group === 'GROUP_2');
    expect(g2.every((e) => e.role && e.dailyTheme)).toBe(true);
    const g1 = plan.entries.filter((e) => e.group === 'GROUP_1');
    expect(g1.every((e) => e.topic && e.pattern && e.dayFocus && e.usage)).toBe(true);
  });

  it('shares one problem identity across groups but keeps both occurrences', () => {
    expect(plan.problems).toHaveLength(894);
    const bySlug = new Map<string, Set<string>>();
    for (const e of plan.entries) bySlug.set(e.titleSlug, (bySlug.get(e.titleSlug) ?? new Set()).add(e.group));
    expect([...bySlug.values()].filter((g) => g.size === 2)).toHaveLength(226);
    expect(plan.entries.filter((e) => e.group === 'GROUP_2')).toHaveLength(320);
  });

  it('applies exactly the two recorded slug corrections, visibly, and only to Group 2', () => {
    expect(plan.appliedCorrections.map((c) => [c.leetcodeNumber, c.group, c.to])).toEqual(
      expect.arrayContaining([
        [540, 'GROUP_2', 'single-element-in-a-sorted-array'],
        [518, 'GROUP_2', 'coin-change-ii'],
      ]),
    );
    expect(plan.appliedCorrections).toHaveLength(2);
    // Supplied display titles are never rewritten.
    const coin = plan.entries.find((e) => e.group === 'GROUP_2' && e.leetcodeNumber === 518)!;
    expect(coin.sourceTitle).toBe('Coin Change 2');
    expect(coin.titleSlug).toBe('coin-change-ii');
  });

  it('refuses a conflicting slug when no correction records the decision', () => {
    const raw = loadQuestionBankSource();
    const without = prepareQuestionBank({ ...raw, corrections: [] });
    expect(without.issues.map((i) => i.code)).toContain('SLUG_CONFLICT');
  });

  it('is deterministic, so a re-run plans the identical write set (idempotency basis)', () => {
    const again = prepareQuestionBank(loadQuestionBankSource());
    expect(again.entries).toEqual(plan.entries);
    expect(new Set(plan.entries.map((e) => `${e.setKey}#${e.position}`)).size).toBe(1120);
  });
});
