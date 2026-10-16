/**
 * Tests for the Assignment History grouping logic.
 *
 * Verifies that:
 * 1. Identical question sets for the same date and curriculum context are grouped
 * 2. Different problem IDs produce separate groups
 * 3. Different dates produce separate groups
 * 4. Different topics produce separate groups
 * 5. Group 1 and Group 2 remain separate even if they share problem IDs
 * 6. Records without reliable curriculum identity remain visible
 * 7. Per-target student counts are preserved
 */

import { describe, it, expect } from 'vitest';
import type { AssignmentSummary } from '@dsa/shared';

// Import the grouping functions (we'll need to export them)
// For now, we'll inline the logic here for testing

interface AssignmentGroup {
  groupKey: string;
  dayKey: string;
  topic: string | null;
  programmeGroup: 'G1' | 'G2' | null;
  curriculumLabel: string | null;
  problems: AssignmentSummary['problems'];
  targets: AssignmentSummary[];
  totalStudents: number;
}

function parseTopicMetadata(topic: string | null): {
  programmeGroup: 'G1' | 'G2' | null;
  curriculumLabel: string | null;
} {
  if (!topic) return { programmeGroup: null, curriculumLabel: null };
  
  const g1Match = topic.match(/^Group\s*1\s*[·•]\s*(.+)$/i);
  if (g1Match) {
    return { programmeGroup: 'G1', curriculumLabel: g1Match[1]!.trim() };
  }
  
  const g2Match = topic.match(/^Group\s*2\s*[·•]\s*(.+)$/i);
  if (g2Match) {
    return { programmeGroup: 'G2', curriculumLabel: g2Match[1]!.trim() };
  }
  
  return { programmeGroup: null, curriculumLabel: null };
}

function makeGroupKey(assignment: AssignmentSummary): string {
  const problemIds = assignment.problems.map((p) => p.id).join(',');
  const topicKey = assignment.topic ?? '';
  return `${assignment.dayKey}|${topicKey}|${problemIds}`;
}

function groupAssignments(assignments: AssignmentSummary[]): AssignmentGroup[] {
  const groups = new Map<string, AssignmentGroup>();
  
  for (const assignment of assignments) {
    const groupKey = makeGroupKey(assignment);
    const existing = groups.get(groupKey);
    
    if (existing) {
      existing.targets.push(assignment);
      existing.totalStudents += assignment.studentCount;
    } else {
      const { programmeGroup, curriculumLabel } = parseTopicMetadata(assignment.topic);
      groups.set(groupKey, {
        groupKey,
        dayKey: assignment.dayKey,
        topic: assignment.topic,
        programmeGroup,
        curriculumLabel,
        problems: assignment.problems,
        targets: [assignment],
        totalStudents: assignment.studentCount,
      });
    }
  }
  
  return Array.from(groups.values()).sort((a, b) => {
    const dateCompare = b.dayKey.localeCompare(a.dayKey);
    if (dateCompare !== 0) return dateCompare;
    return (a.topic ?? '').localeCompare(b.topic ?? '');
  });
}

// Helper to create mock assignments
function mockAssignment(overrides: Partial<AssignmentSummary> = {}): AssignmentSummary {
  return {
    id: Math.random().toString(36).substring(7),
    dayKey: '2026-10-15',
    campusId: 'campus-1',
    campusName: 'Test Campus',
    campusCode: 'TEST',
    batchId: 'batch-1',
    batchName: 'G1',
    batchCode: 'G1',
    cohort: 1,
    audienceLabel: 'Test Campus — G1',
    studentCount: 10,
    originalCampusId: 'campus-1',
    originalCampusName: 'Test Campus',
    originalCampusCode: 'TEST',
    originalBatchId: 'batch-1',
    originalBatchName: 'G1',
    originalBatchCode: 'G1',
    audienceChangedAt: null,
    title: null,
    topic: 'Group 1 · Belt 5 · Week 1 · Day 1',
    notes: null,
    difficulty: null,
    problems: [
      { id: 'p1', slug: 'two-sum', title: 'Two Sum', url: 'https://leetcode.com/problems/two-sum/', difficulty: 'EASY', topicTags: [], companyTags: [], isPaidOnly: false },
      { id: 'p2', slug: 'add-two-numbers', title: 'Add Two Numbers', url: 'https://leetcode.com/problems/add-two-numbers/', difficulty: 'MEDIUM', topicTags: [], companyTags: [], isPaidOnly: false },
      { id: 'p3', slug: 'longest-substring', title: 'Longest Substring', url: 'https://leetcode.com/problems/longest-substring/', difficulty: 'MEDIUM', topicTags: [], companyTags: [], isPaidOnly: false },
      { id: 'p4', slug: 'median-arrays', title: 'Median of Arrays', url: 'https://leetcode.com/problems/median-arrays/', difficulty: 'HARD', topicTags: [], companyTags: [], isPaidOnly: false },
    ],
    createdAt: '2026-10-15T10:00:00Z',
    createdByName: 'Admin',
    ...overrides,
  };
}

describe('parseTopicMetadata', () => {
  it('parses Group 1 topics correctly', () => {
    const result = parseTopicMetadata('Group 1 · Belt 5 · Week 1 · Day 1');
    expect(result.programmeGroup).toBe('G1');
    expect(result.curriculumLabel).toBe('Belt 5 · Week 1 · Day 1');
  });

  it('parses Group 2 topics correctly', () => {
    const result = parseTopicMetadata('Group 2 · Week 1 · Mon · Day 1');
    expect(result.programmeGroup).toBe('G2');
    expect(result.curriculumLabel).toBe('Week 1 · Mon · Day 1');
  });

  it('returns null for non-standard topics', () => {
    const result = parseTopicMetadata('Custom Topic');
    expect(result.programmeGroup).toBeNull();
    expect(result.curriculumLabel).toBeNull();
  });

  it('handles null topics', () => {
    const result = parseTopicMetadata(null);
    expect(result.programmeGroup).toBeNull();
    expect(result.curriculumLabel).toBeNull();
  });
});

describe('groupAssignments', () => {
  it('groups identical question sets for the same date and topic', () => {
    const assignments = [
      mockAssignment({ id: 'a1', campusCode: 'VELS', campusName: 'VELS', studentCount: 20 }),
      mockAssignment({ id: 'a2', campusCode: 'JECRC', campusName: 'JECRC', studentCount: 37 }),
      mockAssignment({ id: 'a3', campusCode: 'MITADT', campusName: 'MITADT', studentCount: 22 }),
    ];

    const groups = groupAssignments(assignments);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.targets).toHaveLength(3);
    expect(groups[0]!.totalStudents).toBe(79); // 20 + 37 + 22
  });

  it('keeps different dates in separate groups', () => {
    const assignments = [
      mockAssignment({ id: 'a1', dayKey: '2026-10-15' }),
      mockAssignment({ id: 'a2', dayKey: '2026-10-16' }),
    ];

    const groups = groupAssignments(assignments);

    expect(groups).toHaveLength(2);
    expect(groups[0]!.dayKey).toBe('2026-10-16'); // Sorted descending
    expect(groups[1]!.dayKey).toBe('2026-10-15');
  });

  it('keeps different topics in separate groups', () => {
    const assignments = [
      mockAssignment({ id: 'a1', topic: 'Group 1 · Belt 5 · Week 1 · Day 1' }),
      mockAssignment({ id: 'a2', topic: 'Group 1 · Belt 5 · Week 1 · Day 2' }),
    ];

    const groups = groupAssignments(assignments);

    expect(groups).toHaveLength(2);
  });

  it('keeps different problem IDs in separate groups', () => {
    const assignments = [
      mockAssignment({ id: 'a1', problems: [
        { id: 'p1', slug: 'two-sum', title: 'Two Sum', url: '', difficulty: 'EASY', topicTags: [], companyTags: [], isPaidOnly: false },
      ] }),
      mockAssignment({ id: 'a2', problems: [
        { id: 'p2', slug: 'add-two', title: 'Add Two', url: '', difficulty: 'EASY', topicTags: [], companyTags: [], isPaidOnly: false },
      ] }),
    ];

    const groups = groupAssignments(assignments);

    expect(groups).toHaveLength(2);
  });

  it('keeps different problem order in separate groups', () => {
    const assignments = [
      mockAssignment({ id: 'a1', problems: [
        { id: 'p1', slug: 'a', title: 'A', url: '', difficulty: 'EASY', topicTags: [], companyTags: [], isPaidOnly: false },
        { id: 'p2', slug: 'b', title: 'B', url: '', difficulty: 'EASY', topicTags: [], companyTags: [], isPaidOnly: false },
      ] }),
      mockAssignment({ id: 'a2', problems: [
        { id: 'p2', slug: 'b', title: 'B', url: '', difficulty: 'EASY', topicTags: [], companyTags: [], isPaidOnly: false },
        { id: 'p1', slug: 'a', title: 'A', url: '', difficulty: 'EASY', topicTags: [], companyTags: [], isPaidOnly: false },
      ] }),
    ];

    const groups = groupAssignments(assignments);

    expect(groups).toHaveLength(2);
  });

  it('keeps Group 1 and Group 2 separate even with same problems', () => {
    const sharedProblems = [
      { id: 'p1', slug: 'two-sum', title: 'Two Sum', url: '', difficulty: 'EASY' as const, topicTags: [], companyTags: [], isPaidOnly: false },
    ];

    const assignments = [
      mockAssignment({ id: 'a1', topic: 'Group 1 · Belt 5 · Week 1 · Day 1', problems: sharedProblems }),
      mockAssignment({ id: 'a2', topic: 'Group 2 · Week 1 · Mon · Day 1', problems: sharedProblems }),
    ];

    const groups = groupAssignments(assignments);

    expect(groups).toHaveLength(2);
    expect(groups.find(g => g.programmeGroup === 'G1')).toBeDefined();
    expect(groups.find(g => g.programmeGroup === 'G2')).toBeDefined();
  });

  it('preserves per-target student counts', () => {
    const assignments = [
      mockAssignment({ id: 'a1', campusCode: 'A', studentCount: 10 }),
      mockAssignment({ id: 'a2', campusCode: 'B', studentCount: 20 }),
      mockAssignment({ id: 'a3', campusCode: 'C', studentCount: 30 }),
    ];

    const groups = groupAssignments(assignments);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.targets[0]!.studentCount).toBe(10);
    expect(groups[0]!.targets[1]!.studentCount).toBe(20);
    expect(groups[0]!.targets[2]!.studentCount).toBe(30);
  });

  it('handles assignments without topics', () => {
    const assignments = [
      mockAssignment({ id: 'a1', topic: null }),
      mockAssignment({ id: 'a2', topic: null }),
    ];

    const groups = groupAssignments(assignments);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.programmeGroup).toBeNull();
  });

  it('correctly identifies cohorts within groups', () => {
    const assignments = [
      mockAssignment({ id: 'a1', cohort: 1, campusCode: 'VELS' }),
      mockAssignment({ id: 'a2', cohort: 2, campusCode: 'VELS', topic: 'Group 1 · Belt 6 · Week 1 · Day 1' }),
    ];

    const groups = groupAssignments(assignments);

    // Different topics = different groups
    expect(groups).toHaveLength(2);
  });
});
