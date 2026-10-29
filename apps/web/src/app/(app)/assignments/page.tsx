'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Plus, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { QUESTION_BANK_GROUP_LABELS, type AssignmentSummary, type QuestionBankGroup, type QuestionBankSetDto } from '@dsa/shared';

import { api } from '@/lib/api';
import { todayKey } from '@/lib/utils';
import { BatchChip, CampusChip, ScopeFilter, useScopeFilter } from '@/components/scope-filter';
import { ChangeAssignmentTargetDialog } from '@/components/change-assignment-target-dialog';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DifficultyBadge,
  EmptyState,
  ErrorState,
  TableShell,
  TableSkeleton,
  Td,
  Th,
} from '@/components/ui';

/**
 * The default number of problem inputs shown, not a limit.
 *
 * The programme assigns four a day, but nothing downstream assumes it: a batch can be
 * given any number, and every completion figure is computed against that batch's actual
 * count (§10).
 */
const DEFAULT_PROBLEM_SLOTS = 4;

/** `useSearchParams` needs a Suspense boundary for the page to build. */
export default function AssignmentsPage() {
  return (
    <Suspense fallback={null}>
      <AssignmentsPageInner />
    </Suspense>
  );
}

/** "Belt 4 · Week 2 · Day 3" / "Week 5 · Mon · Day 22", for the topic and the banner. */
function bankSetLabel(set: QuestionBankSetDto): string {
  return set.group === 'GROUP_1'
    ? `Belt ${set.belt} · Week ${set.week} · Day ${set.day}`
    : `Week ${set.week} · ${set.weekday} · Day ${set.day}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Assignment Grouping for History View
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A group of assignments that share the same curriculum set (date + topic + problems).
 * Visual grouping only — each target is still a real assignment record.
 */
interface AssignmentGroup {
  /** Unique key for this group: dayKey|topic|problemId1,problemId2,... */
  groupKey: string;
  /** The common date for all assignments in this group */
  dayKey: string;
  /** The common topic/curriculum context */
  topic: string | null;
  /** Programme group extracted from topic: 'G1', 'G2', or null if undetermined */
  programmeGroup: 'G1' | 'G2' | null;
  /** Curriculum metadata extracted from topic */
  curriculumLabel: string | null;
  /** The common problems (same for all targets) */
  problems: AssignmentSummary['problems'];
  /** Individual assignment targets within this group */
  targets: AssignmentSummary[];
  /** Total distinct student count across all targets */
  totalStudents: number;
}

/**
 * Extracts programme group and curriculum label from the topic string.
 * Group 1 topics: "Group 1 · Belt X · Week Y · Day Z"
 * Group 2 topics: "Group 2 · Week X · Weekday · Day Y"
 */
function parseTopicMetadata(topic: string | null): {
  programmeGroup: 'G1' | 'G2' | null;
  curriculumLabel: string | null;
} {
  if (!topic) return { programmeGroup: null, curriculumLabel: null };
  
  // Check for Group 1 pattern: "Group 1 · Belt X · Week Y · Day Z"
  const g1Match = topic.match(/^Group\s*1\s*[·•]\s*(.+)$/i);
  if (g1Match) {
    return { programmeGroup: 'G1', curriculumLabel: g1Match[1]!.trim() };
  }
  
  // Check for Group 2 pattern: "Group 2 · Week X · Weekday · Day Y"
  const g2Match = topic.match(/^Group\s*2\s*[·•]\s*(.+)$/i);
  if (g2Match) {
    return { programmeGroup: 'G2', curriculumLabel: g2Match[1]!.trim() };
  }
  
  return { programmeGroup: null, curriculumLabel: null };
}

/**
 * Creates a deterministic group key from assignment properties.
 * Two assignments with the same group key have identical curriculum content.
 */
function makeGroupKey(assignment: AssignmentSummary): string {
  const problemIds = assignment.problems.map((p) => p.id).join(',');
  // Include topic for curriculum context, even if problems are the same
  const topicKey = assignment.topic ?? '';
  return `${assignment.dayKey}|${topicKey}|${problemIds}`;
}

/**
 * Groups assignments by their curriculum content (date + topic + ordered problems).
 * Returns groups sorted by date descending, with targets within each group.
 */
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
  
  // Sort groups by date descending, then by topic
  return Array.from(groups.values()).sort((a, b) => {
    const dateCompare = b.dayKey.localeCompare(a.dayKey);
    if (dateCompare !== 0) return dateCompare;
    return (a.topic ?? '').localeCompare(b.topic ?? '');
  });
}

/**
 * Expandable row component for a grouped assignment set.
 */
function GroupedAssignmentRow({
  group,
  isAdmin,
  onRetarget,
}: {
  group: AssignmentGroup;
  isAdmin: boolean;
  onRetarget: (assignment: AssignmentSummary) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMultipleTargets = group.targets.length > 1;
  
  // Sort targets: by campus name, then by batch code, then by cohort
  const sortedTargets = useMemo(
    () =>
      [...group.targets].sort((a, b) => {
        const campusCompare = (a.campusName ?? '').localeCompare(b.campusName ?? '');
        if (campusCompare !== 0) return campusCompare;
        const batchCompare = (a.batchCode ?? '').localeCompare(b.batchCode ?? '');
        if (batchCompare !== 0) return batchCompare;
        return (a.cohort ?? 0) - (b.cohort ?? 0);
      }),
    [group.targets],
  );

  return (
    <>
      {/* Parent row - always visible */}
      <tr
        className={`transition ${hasMultipleTargets ? 'cursor-pointer hover:bg-[var(--color-surface-sunken)]' : 'hover:bg-[var(--color-surface-sunken)]'}`}
        onClick={() => hasMultipleTargets && setExpanded(!expanded)}
      >
        {/* Expand/collapse indicator + Date */}
        <Td className="font-medium tabular-nums">
          <span className="inline-flex items-center gap-1.5">
            {hasMultipleTargets ? (
              <button
                type="button"
                className="rounded p-0.5 hover:bg-[var(--color-surface-raised)]"
                aria-expanded={expanded}
                aria-label={expanded ? 'Collapse targets' : 'Expand targets'}
              >
                {expanded ? (
                  <ChevronDown className="size-4 text-[var(--color-fg-muted)]" />
                ) : (
                  <ChevronRight className="size-4 text-[var(--color-fg-muted)]" />
                )}
              </button>
            ) : (
              <span className="size-4" /> // Spacer for alignment
            )}
            {group.dayKey}
          </span>
        </Td>
        
        {/* Programme Group Badge */}
        <Td>
          {group.programmeGroup ? (
            <Badge tone={group.programmeGroup === 'G1' ? 'brand' : 'info'}>
              {group.programmeGroup}
            </Badge>
          ) : (
            <span className="text-[var(--color-fg-muted)]">—</span>
          )}
        </Td>
        
        {/* Curriculum Context / Topic */}
        <Td className="text-[var(--color-fg-muted)]">
          {group.curriculumLabel ?? group.topic ?? '—'}
        </Td>
        
        {/* Problems - displayed once for the group */}
        <Td>
          <div className="flex flex-wrap gap-1.5">
            {group.problems.map((problem) => (
              <a
                key={problem.id}
                href={problem.url}
                target="_blank"
                rel="noreferrer noopener"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2 py-0.5 text-xs hover:border-[var(--color-brand)]"
              >
                {problem.title}
                <DifficultyBadge difficulty={problem.difficulty} />
              </a>
            ))}
          </div>
        </Td>
        
        {/* Targets summary */}
        <Td>
          {hasMultipleTargets ? (
            <Badge tone="neutral">
              {group.targets.length} target{group.targets.length !== 1 ? 's' : ''}
            </Badge>
          ) : (
            // Single target - show inline
            <span className="inline-flex items-center gap-1.5">
              {sortedTargets[0]?.campusCode ? (
                <CampusChip
                  code={sortedTargets[0].campusCode}
                  name={sortedTargets[0].campusName}
                />
              ) : (
                <Badge tone="neutral">All</Badge>
              )}
              {sortedTargets[0]?.batchCode ? (
                <span className="inline-flex items-center gap-1">
                  <BatchChip
                    code={sortedTargets[0].batchCode}
                    name={sortedTargets[0].batchName}
                  />
                  {sortedTargets[0].cohort && `C${sortedTargets[0].cohort}` !== sortedTargets[0].batchCode ? (
                    <span className="text-xs text-[var(--color-fg-muted)]">cohort {sortedTargets[0].cohort}</span>
                  ) : null}
                </span>
              ) : null}
            </span>
          )}
        </Td>
        
        {/* Student count */}
        <Td className="text-right tabular-nums text-[var(--color-fg-muted)]">
          {group.totalStudents}
        </Td>
        
        {/* Problem count */}
        <Td className="text-right tabular-nums">{group.problems.length}</Td>
        
        {/* Actions - only for single target */}
        {isAdmin ? (
          <Td className="text-right">
            {!hasMultipleTargets && sortedTargets[0] ? (
              <Button
                variant="ghost"
                className="text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetarget(sortedTargets[0]!);
                }}
              >
                <Settings2 className="size-3.5" aria-hidden />
                Change target
              </Button>
            ) : null}
          </Td>
        ) : null}
      </tr>
      
      {/* Expanded target rows */}
      {expanded &&
        sortedTargets.map((target) => (
          <tr
            key={target.id}
            className="bg-[var(--color-surface-sunken)] transition hover:bg-[var(--color-surface-raised)]"
          >
            {/* Indent spacer */}
            <Td className="border-l-2 border-l-[var(--color-brand-soft)] pl-8">
              <span className="text-xs text-[var(--color-fg-subtle)]">↳</span>
            </Td>
            
            {/* Empty cell for group badge column */}
            <Td />
            
            {/* Target campus/batch/cohort info */}
            <Td colSpan={2}>
              <span className="inline-flex flex-wrap items-center gap-2">
                {target.campusCode ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CampusChip code={target.campusCode} name={target.campusName} />
                    <span className="text-xs text-[var(--color-fg-muted)]">
                      {target.campusName}
                    </span>
                  </span>
                ) : (
                  <Badge tone="neutral">All campuses</Badge>
                )}
                {target.batchCode ? (
                  <span className="inline-flex items-center gap-1">
                    <BatchChip code={target.batchCode} name={target.batchName} />
                    {target.cohort && `C${target.cohort}` !== target.batchCode ? (
                      <span className="text-xs text-[var(--color-fg-muted)]">cohort {target.cohort}</span>
                    ) : null}
                  </span>
                ) : (
                  <Badge tone="neutral">All batches</Badge>
                )}
                {target.audienceChangedAt ? (
                  <span
                    className="text-xs text-[var(--color-fg-subtle)]"
                    title={`Originally ${target.originalCampusName ?? 'All campuses'} — ${target.originalBatchName ?? 'All batches'}`}
                  >
                    (retargeted)
                  </span>
                ) : null}
              </span>
            </Td>
            
            {/* Empty cell for targets column */}
            <Td />
            
            {/* Student count for this target */}
            <Td className="text-right tabular-nums text-[var(--color-fg-muted)]">
              {target.studentCount}
            </Td>
            
            {/* Empty cell for problem count column */}
            <Td />
            
            {/* Actions for this target */}
            {isAdmin ? (
              <Td className="text-right">
                <Button
                  variant="ghost"
                  className="text-xs"
                  onClick={() => onRetarget(target)}
                >
                  <Settings2 className="size-3.5" aria-hidden />
                  Change target
                </Button>
              </Td>
            ) : null}
          </tr>
        ))}
    </>
  );
}

/**
 * The Assignment History card with grouped view.
 * Groups identical curriculum sets and shows targets as expandable rows.
 */
function AssignmentHistoryCard({
  assignments,
  isLoading,
  error,
  isAdmin,
  onRetry,
  onRetarget,
}: {
  assignments: AssignmentSummary[];
  isLoading: boolean;
  error: Error | null;
  isAdmin: boolean;
  onRetry: () => void;
  onRetarget: (assignment: AssignmentSummary) => void;
}) {
  // Memoize the grouping to avoid recalculating on every render
  const groups = useMemo(() => groupAssignments(assignments), [assignments]);
  
  return (
    <Card>
      <CardHeader
        title="Assignment history"
        description={
          groups.length > 0
            ? `${assignments.length} assignment${assignments.length !== 1 ? 's' : ''} across ${groups.length} curriculum set${groups.length !== 1 ? 's' : ''}`
            : undefined
        }
      />
      {isLoading ? (
        <TableSkeleton rows={8} cols={8} />
      ) : error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : assignments.length === 0 ? (
        <EmptyState
          title="No assignments yet"
          description="Create the first one so the sync engine knows what to check."
        />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th style={{ width: '120px' }}>Date</Th>
              <Th style={{ width: '60px' }}>Group</Th>
              <Th>Curriculum</Th>
              <Th>Problems</Th>
              <Th style={{ width: '120px' }}>Targets</Th>
              <Th className="text-right" style={{ width: '80px' }}>Students</Th>
              <Th className="text-right" style={{ width: '60px' }}>Count</Th>
              {isAdmin ? <Th className="text-right" style={{ width: '120px' }}>Actions</Th> : null}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <GroupedAssignmentRow
                key={group.groupKey}
                group={group}
                isAdmin={isAdmin}
                onRetarget={onRetarget}
              />
            ))}
          </tbody>
        </TableShell>
      )}
    </Card>
  );
}

function AssignmentsPageInner() {
  const queryClient = useQueryClient();
  const [dayKey, setDayKey] = useState(todayKey());
  const [topic, setTopic] = useState('');
  const [urls, setUrls] = useState<string[]>(Array(DEFAULT_PROBLEM_SLOTS).fill(''));
  const [creating, setCreating] = useState(false);

  /**
   * Hand-off from the Question Bank: `?fromBank=<setKey>` pre-fills the four problem links
   * and the topic, nothing else. The date and — deliberately — the campus and batch are left
   * for the mentor to choose, exactly as for a hand-typed assignment: the bank never decides
   * who receives a set. Applied once, so editing the form afterwards is never overwritten.
   */
  const fromBankKey = useSearchParams().get('fromBank');
  const bankSet = useQuery({
    queryKey: ['question-bank-set', fromBankKey],
    queryFn: () => api.questionBankSet(fromBankKey!),
    enabled: Boolean(fromBankKey),
    retry: false,
  });
  const [bankLabel, setBankLabel] = useState<string | null>(null);
  const [bankGroup, setBankGroup] = useState<QuestionBankGroup | null>(null);
  const [bankExpectedBatch, setBankExpectedBatch] = useState<string | null>(null);
  const bankApplied = useRef(false);
  useEffect(() => {
    if (!bankSet.data || bankApplied.current) return;
    bankApplied.current = true;
    const set = bankSet.data;
    setUrls(set.questions.map((question) => question.url));
    setTopic(`${QUESTION_BANK_GROUP_LABELS[set.group].split(' — ')[0]} · ${bankSetLabel(set)}`);
    setBankLabel(`${QUESTION_BANK_GROUP_LABELS[set.group]} · ${bankSetLabel(set)}`);
    setBankGroup(set.group);
    // Which batch this set belongs to: Belt 5 → C1, Belt 6 → C2, placement (Group 2) → C3.
    setBankExpectedBatch(
      set.group === 'GROUP_2'
        ? 'C3'
        : set.group === 'GROUP_1' && set.belt === 5
          ? 'C1'
          : set.group === 'GROUP_1' && set.belt === 6
            ? 'C2'
            : null,
    );
    setCreating(true);
  }, [bankSet.data]);
  useEffect(() => {
    if (bankSet.error) {
      toast.error('Could not load that Question Bank day', {
        description: (bankSet.error as Error).message,
      });
    }
  }, [bankSet.error]);

  const { campus: campusFilter, batch: batchFilter, campuses } = useScopeFilter();

  const me = useQuery({ queryKey: ['me'], queryFn: api.me });
  const isAdmin = me.data?.role === 'ADMIN';
  const [retargeting, setRetargeting] = useState<AssignmentSummary | null>(null);

  /**
   * Which campus receives this problem set. `null` means every campus.
   *
   * Held separately from the page's filter: an admin often browses one campus's history
   * while writing another campus's assignment, and silently inheriting the filter would
   * make the target depend on where they happened to be looking.
   */
  const [targetCampusId, setTargetCampusId] = useState<string | null>(null);
  // Cluster mode: campuses that share a schedule. Replaces the old "All campuses" option.
  const [targetCluster, setTargetCluster] = useState<number | null>(null);
  const [campusChoiceMade, setCampusChoiceMade] = useState(false);

  /**
   * Which batches receive this problem set, within the chosen campus. Empty means every
   * batch at that campus.
   *
   * Assigning different questions to each batch on the same date is two saves, one per
   * batch — which is exactly how the batches are meant to diverge (§9).
   */
  const [targetBatchIds, setTargetBatchIds] = useState<string[]>([]);

  /**
   * When "All campuses" is selected, we use batch codes (C1, C2, C3) instead of IDs.
   * This allows targeting one cohort across all campuses in one assignment.
   */
  const [globalBatchCode, setGlobalBatchCode] = useState<'C1' | 'C2' | 'C3' | null>(null);
  const [globalBatchChoiceMade, setGlobalBatchChoiceMade] = useState(false);
  const COHORT_LABELS = { C1: 'Belt 5 prep', C2: 'Belt 6 prep', C3: 'Placement' } as const;

  /**
   * Whether the mentor has *actually* touched each selector.
   *
   * "All campuses" and "All batches" are real, supported choices, but neither must ever
   * be the thing a mentor gets by default just because they never looked — that is
   * exactly how an SRM-only assignment quietly becomes everyone's (§10). The create
   * button stays disabled until a deliberate choice is made, either way.
   */
  const [batchChoiceMade, setBatchChoiceMade] = useState(false);

  // Batches at the chosen target campus. Only fetched once a campus is chosen: with no
  // campus there is no single batch list, and offering one would be a guess.
  const targetBatches = useQuery({
    queryKey: ['campus-batches', targetCampusId],
    queryFn: () => api.campusBatches(targetCampusId!),
    enabled: targetCampusId !== null,
    staleTime: 5 * 60_000,
  });
  const batches = targetBatches.data ?? [];
  const batchesLoading = targetBatches.isLoading;

  /**
   * Each Question Bank set belongs to one cohort's batch: Belt 5 → C1, Belt 6 → C2,
   * placement (Group 2) → C3. Nothing enforces that — the audience is the mentor's
   * explicit choice, as always — so a mismatch (or "all batches") is flagged rather than
   * blocked. Only campuses that actually have C1/C2/C3 batches are checked.
   */
  const campusIsSplit = batches.some((b) => /^C[123]$/.test(b.code));
  const bankAudienceWarning =
    bankExpectedBatch && campusIsSplit && batchChoiceMade
      ? targetBatchIds.length === 0
        ? `These are ${bankExpectedBatch} questions, but "All batches" is selected — that would also reach the other cohorts.`
        : batches.some((b) => targetBatchIds.includes(b.id) && b.code !== bankExpectedBatch)
          ? `These are ${bankExpectedBatch} questions, but a batch other than ${bankExpectedBatch} is selected.`
          : null
      : null;
  const batchSelectionRequired = targetCampusId !== null && batches.length > 0;

  const history = useQuery({
    queryKey: ['assignments', campusFilter, batchFilter],
    queryFn: () =>
      api.assignments({
        page: 1,
        pageSize: 30,
        campus: campusFilter ?? undefined,
        batch: batchFilter ?? undefined,
      }),
  });

  // What already exists for the chosen date, so the form can refuse a duplicate before
  // the request rather than surfacing a server error afterwards (§10).
  const existingForDay = useQuery({
    queryKey: ['assignments', 'day', dayKey],
    queryFn: () => api.assignmentsForDay(dayKey),
    enabled: creating,
  });

  // Keyed on the *pair*: SRM/Foundation being taken must not grey out Vels/Foundation.
  const takenBatchIds = new Set(
    (existingForDay.data ?? [])
      .filter((a) => targetCampusId === null || a.campusId === targetCampusId)
      .map((a) => a.batchId),
  );
  const wholeCampusTaken = (existingForDay.data ?? []).some(
    (a) => a.campusId === targetCampusId && a.batchId === null,
  );

  const targetCampusName =
    campuses.find((entry) => entry.id === targetCampusId)?.name ??
    (targetCluster !== null ? `Cluster ${targetCluster}` : '');
  const clusterNumbers = Array.from(
    new Set(campuses.map((c) => c.cluster).filter((c): c is number => c !== null)),
  ).sort((a, b) => a - b);
  const clusterCampusNames = (n: number) =>
    campuses.filter((c) => c.cluster === n).map((c) => c.name).join(', ');

  const create = useMutation({
    mutationFn: () =>
      api.createAssignment({
        dayKey,
        topic: topic || undefined,
        campus: targetCampusId ?? undefined,
        cluster: targetCampusId === null ? (targetCluster ?? undefined) : undefined,
        // When "All campuses" is selected, use the global batch code (C1/C2/C3) — the API derives the cohort from the code
        // When a specific campus is selected, use the batch IDs
        batches: targetCampusId === null
          ? (globalBatchCode ? [globalBatchCode] : undefined)
          : (targetBatchIds.length > 0 ? targetBatchIds : undefined),
        problemUrls: urls.map((url) => url.trim()).filter(Boolean),
      }),
    onSuccess: (created) => {
      toast.success(
        created.length === 1
          ? `Assignment created for ${created[0]!.audienceLabel}`
          : `Assignment created for ${created.length} audiences`,
      );
      setUrls(Array(DEFAULT_PROBLEM_SLOTS).fill(''));
      setTopic('');
      setTargetCampusId(null);
      setTargetCluster(null);
      setCampusChoiceMade(false);
      setTargetBatchIds([]);
      setBatchChoiceMade(false);
      setGlobalBatchCode(null);
      setGlobalBatchChoiceMade(false);
      setCreating(false);
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['mentor'] });
    },
    onError: (error: Error) =>
      toast.error('Could not create assignment', { description: error.message }),
  });

  const filledCount = urls.filter((url) => url.trim()).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Assignments</h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            Problem titles, difficulty and tags are fetched from LeetCode automatically.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScopeFilter />
          <Button
            variant="primary"
            onClick={() =>
              setCreating((open) => {
                // Reopening (or opening fresh) always starts with no choice made, so a
                // stale "All campuses" or "All batches" selection from a previous
                // session can never carry forward silently.
                if (!open) {
                  setTargetCampusId(null);
                  setCampusChoiceMade(false);
                  setTargetBatchIds([]);
                  setBatchChoiceMade(false);
                  setGlobalBatchCode(null);
                  setGlobalBatchChoiceMade(false);
                }
                return !open;
              })
            }
          >
            <Plus className="size-3.5" aria-hidden />
            New assignment
          </Button>
        </div>
      </header>

      {creating ? (
        <Card>
          <CardHeader
            title="Create assignment"
            description="Paste LeetCode problem URLs. Slugs also work."
          />
          <div className="space-y-4 p-5">
            {bankLabel ? (
              <div className="rounded-lg border border-[var(--color-brand)] bg-[var(--color-brand-soft)] px-3 py-2 text-xs">
                <strong>Pre-filled from the Question Bank:</strong> {bankLabel}. Pick the date and choose the
                campus and batch below — they are not set for you.
              </div>
            ) : null}
            {bankAudienceWarning ? (
              <div className="rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-2 text-xs text-[var(--color-warning)]">
                {bankAudienceWarning}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="date" className="mb-1.5 block text-xs font-medium">
                  Date
                </label>
                <input
                  id="date"
                  type="date"
                  value={dayKey}
                  onChange={(event) => setDayKey(event.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)]"
                />
              </div>
              <div>
                <label htmlFor="topic" className="mb-1.5 block text-xs font-medium">
                  Topic (optional)
                </label>
                <input
                  id="topic"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="Sliding Window"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)]"
                />
              </div>
            </div>

            {/*
              Target Campus. Required, and never pre-selected, for the same reason the
              batch selector is: an assignment must not reach a campus because nobody
              looked at the control (§10).
            */}
            <div>
              <span className="mb-1.5 block text-xs font-medium">
                Campus <span className="text-[var(--color-danger)]">*</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {/* Clusters are admin-only; "All campuses" no longer exists because campuses run on different weeks. */}
                {isAdmin &&
                  clusterNumbers.map((n) => {
                    const on = campusChoiceMade && targetCampusId === null && targetCluster === n;
                    return (
                      <button
                        key={`cluster-${n}`}
                        type="button"
                        aria-pressed={on}
                        title={clusterCampusNames(n)}
                        onClick={() => {
                          setTargetCampusId(null);
                          setTargetCluster(n);
                          setCampusChoiceMade(true);
                          setTargetBatchIds([]);
                          setBatchChoiceMade(false);
                          setGlobalBatchCode(null);
                          setGlobalBatchChoiceMade(false);
                        }}
                        className={on ? 'rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-sm font-medium text-[var(--color-brand-fg)]' : 'rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'}
                      >
                        Cluster {n}
                      </button>
                    );
                  })}
                {campuses.map((entry) => {
                  const isSelected = campusChoiceMade && targetCampusId === entry.id;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        setTargetCampusId(entry.id);
                        setTargetCluster(null);
                        setCampusChoiceMade(true);
                        setTargetBatchIds([]);
                        setBatchChoiceMade(false);
                      }}
                      className={
                        isSelected
                          ? 'rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-sm font-medium text-[var(--color-brand-fg)]'
                          : 'rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
                      }
                    >
                      {entry.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Global batch selector when "All campuses" is selected */}
            {campusChoiceMade && targetCampusId === null ? (
              <div>
                <span className="mb-1.5 block text-xs font-medium">
                  Target Batch <span className="text-[var(--color-fg-muted)]">({targetCluster !== null ? clusterCampusNames(targetCluster) : ''})</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {(['C1', 'C2', 'C3'] as const).map((code) => (
                    <button
                      key={code}
                      type="button"
                      aria-pressed={globalBatchChoiceMade && globalBatchCode === code}
                      onClick={() => {
                        setGlobalBatchCode(code);
                        setGlobalBatchChoiceMade(true);
                      }}
                      className={
                        globalBatchChoiceMade && globalBatchCode === code
                          ? 'rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-sm font-medium text-[var(--color-brand-fg)]'
                          : 'rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
                      }
                    >
                      {code}
                      <span className="ml-1 text-xs opacity-70">{COHORT_LABELS[code]}</span>
                    </button>
                  ))}
                </div>
                {!globalBatchChoiceMade ? (
                  <p className="mt-1.5 text-xs text-[var(--color-fg-subtle)]">
                    Pick the cohort (C1, C2 or C3). One assignment is created for every campus in this cluster that has that batch.
                  </p>
                ) : null}
              </div>
            ) : null}

            {/*
              Target Batch, resolved *within* the chosen campus. Required, and never
              pre-selected: a mentor must actively pick Foundation, Intermediate, or
              explicitly "All batches" before they can create anything (§10).

              There is no target for students without a batch. Work is set for a level,
              and someone who has not been placed into one has no level's work to do —
              a campus-wide assignment still reaches them.
            */}
            {targetCampusId === null ? null : batchesLoading ? (
              <p className="text-xs text-[var(--color-fg-subtle)]">Loading batches…</p>
            ) : batches.length > 0 ? (
              <div>
                <span className="mb-1.5 block text-xs font-medium">
                  Target Batch <span className="text-[var(--color-danger)]">*</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={batchChoiceMade && targetBatchIds.length === 0}
                    disabled={wholeCampusTaken}
                    title={
                      wholeCampusTaken
                        ? `${dayKey} already has a whole-campus assignment for ${targetCampusName}.`
                        : undefined
                    }
                    onClick={() => {
                      setTargetBatchIds([]);
                      setBatchChoiceMade(true);
                    }}
                    className={
                      batchChoiceMade && targetBatchIds.length === 0
                        ? 'rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-sm font-medium text-[var(--color-brand-fg)]'
                        : 'rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:cursor-not-allowed disabled:opacity-50'
                    }
                  >
                    All batches at {targetCampusName}
                  </button>
                  {batches.map((batch) => {
                    const isSelected = batchChoiceMade && targetBatchIds.includes(batch.id);
                    const isTaken = takenBatchIds.has(batch.id);
                    return (
                      <button
                        key={batch.id}
                        type="button"
                        aria-pressed={isSelected}
                        disabled={isTaken}
                        title={
                          isTaken
                            ? `${dayKey} already has an assignment for ${batch.name}.`
                            : undefined
                        }
                        onClick={() => {
                          setTargetBatchIds((current) =>
                            current.includes(batch.id)
                              ? current.filter((id) => id !== batch.id)
                              : [...current, batch.id],
                          );
                          setBatchChoiceMade(true);
                        }}
                        className={
                          isSelected
                            ? 'rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-sm font-medium text-[var(--color-brand-fg)]'
                            : 'rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:cursor-not-allowed disabled:opacity-50'
                        }
                      >
                        {batch.name}
                        {isTaken ? ' · already set' : ''}
                      </button>
                    );
                  })}
                </div>
                {/* One line per taken audience — SRM/Foundation's message never mentions
                    Vels/Foundation and vice versa, and neither blocks picking the other. */}
                {(existingForDay.data ?? [])
                  .filter((a) => a.campusId === targetCampusId)
                  .map((a) => (
                    <p key={a.id} className="mt-1.5 text-xs text-[var(--color-warning)]">
                      {dayKey} already has an assignment for {a.audienceLabel}. Edit the
                      existing assignment instead.
                    </p>
                  ))}
                {!batchChoiceMade ? (
                  <p className="mt-1.5 text-xs text-[var(--color-fg-subtle)]">
                    Pick a target batch before adding problems.
                  </p>
                ) : null}
              </div>
            ) : null}


            {urls.map((url, index) => (
              <div key={index}>
                <label htmlFor={`problem-${index}`} className="mb-1.5 block text-xs font-medium">
                  Problem {index + 1}
                </label>
                <input
                  id={`problem-${index}`}
                  value={url}
                  onChange={(event) => {
                    const next = [...urls];
                    next[index] = event.target.value;
                    setUrls(next);
                  }}
                  placeholder="https://leetcode.com/problems/two-sum/"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs outline-none focus:border-[var(--color-brand)]"
                />
              </div>
            ))}

            {/*
              A plain statement of what is about to be saved, before it is saved (§20).
              Never guesses a batch count: until the mentor has made an explicit choice,
              this says so rather than defaulting to "every batch".
            */}
            {filledCount > 0 ? (
              <div className="rounded-lg bg-[var(--color-surface-sunken)] p-3 text-sm">
                <p className="font-medium">Preview</p>
                <p className="mt-1 text-[var(--color-fg-muted)]">
                  {!campusChoiceMade
                    ? 'Pick a target campus above to see what will be created.'
                    : targetCampusId === null && !globalBatchChoiceMade
                      ? 'Pick a target batch above to see what will be created.'
                      : batchSelectionRequired && !batchChoiceMade
                        ? 'Pick a target batch above to see what will be created.'
                        : targetCampusId === null
                          ? `${filledCount} problem${filledCount === 1 ? '' : 's'} on ${dayKey} for ${targetCampusName} (${targetCluster !== null ? clusterCampusNames(targetCluster) : ''}) — ${globalBatchCode}.`
                          : `${filledCount} problem${filledCount === 1 ? '' : 's'} on ${dayKey} for ${
                              targetBatchIds.length === 0
                                ? `${targetCampusName} — All batches`
                                : batches
                                    .filter((batch) => targetBatchIds.includes(batch.id))
                                    .map((batch) => `${targetCampusName} — ${batch.name}`)
                                    .join('; ')
                            }.`}
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                onClick={() => create.mutate()}
                loading={create.isPending}
                disabled={
                  filledCount === 0 ||
                  !campusChoiceMade ||
                  // For "All campuses", require global batch selection
                  (targetCampusId === null && !globalBatchChoiceMade) ||
                  // For specific campus, require batch selection if batches exist
                  (targetCampusId !== null && batchSelectionRequired && !batchChoiceMade) ||
                  targetBatchIds.some((id) => takenBatchIds.has(id)) ||
                  (targetBatchIds.length === 0 && wholeCampusTaken)
                }
              >
                Create assignment
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button
                variant="ghost"
                onClick={() => setUrls((current) => [...current, ''])}
                className="text-xs"
              >
                Add another problem
              </Button>
              <p className="text-xs text-[var(--color-fg-subtle)]">
                {filledCount} problem{filledCount === 1 ? '' : 's'} entered
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <AssignmentHistoryCard
        assignments={history.data?.items ?? []}
        isLoading={history.isLoading}
        error={history.error}
        isAdmin={isAdmin}
        onRetry={() => void history.refetch()}
        onRetarget={setRetargeting}
      />

      <ChangeAssignmentTargetDialog
        assignment={retargeting}
        campuses={campuses}
        open={!!retargeting}
        onClose={() => setRetargeting(null)}
      />
    </div>
  );
}
