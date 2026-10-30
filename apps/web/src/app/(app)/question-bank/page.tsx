'use client';

/**
 * Coding Hours Question Bank.
 *
 * Reference data only: it shows what the curriculum prescribes for a day and hands the four
 * questions to the existing Assignments page. It reads nothing about students and creates
 * nothing itself.
 *
 * Questions are shown by cohort - C1, C2, C3 - the same names used for batches, assignments
 * and analysis, plus an "Other belts" reference tab. Underneath, C1 and C2 are Belt 5 and Belt 6
 * of the stored Group 1 and C3 is Group 2; `cohort-display` maps between the two, so no stored
 * data or set key changes.
 *
 * Each tab is a separate, first-class state, never one merged list. The selected tab lives in
 * the URL (`?cohort=`) so a link, a refresh or the back button can never land on another
 * cohort's questions by accident, and every filter is reset when the tab changes. Old
 * `?group=` links still work.
 */

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, Edit2, ExternalLink, Plus, Search, Trash2, X } from 'lucide-react';
import {
  COHORT_TABS,
  COHORT_TAB_INFO,
  GROUP_1_PRACTICE_DAYS_PER_WEEK,
  cohortSetTitle,
  cohortTabFromParam,
  cohortTabOfSet,
  cohortTabQuery,
  type CohortTab,
  type QuestionBankGroup,
  type QuestionBankQuestionDto,
  type QuestionBankSetDto,
} from '@dsa/shared';

import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DifficultyBadge,
  EmptyState,
  ErrorState,
  Modal,
  Skeleton,
  TableShell,
  Td,
  Th,
} from '@/components/ui';
import { toast } from 'sonner';

const PAGE_SIZE = 12;

/** A cohort's identity colour, used everywhere that cohort appears so it is never ambiguous. */
const TAB_TONE: Record<CohortTab, 'brand' | 'info' | 'success' | 'neutral'> = {
  C1: 'brand', C2: 'success', C3: 'info', OTHER: 'neutral',
};
const TAB_ACCENT: Record<CohortTab, string> = {
  C1: 'border-l-[var(--color-brand)]',
  C2: 'border-l-[var(--color-success)]',
  C3: 'border-l-[var(--color-info)]',
  OTHER: 'border-l-[var(--color-border-strong)]',
};

interface Filters {
  belt: string;
  week: string;
  day: string;
  weekday: string;
  topic: string;
  pattern: string;
  theme: string;
  role: string;
  difficulty: string;
  q: string;
}
const NO_FILTERS: Filters = {
  belt: '', week: '', day: '', weekday: '', topic: '', pattern: '', theme: '', role: '', difficulty: '', q: '',
};

const selectClass =
  'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-brand)]';
const labelClass = 'text-xs font-medium text-[var(--color-fg-muted)]';

export default function QuestionBankPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <QuestionBank />
    </Suspense>
  );
}

function QuestionBank() {
  const router = useRouter();
  const params = useSearchParams();
  const tab: CohortTab = cohortTabFromParam(params.get('cohort') ?? params.get('group'));
  const { group, belt: tabBelt } = cohortTabQuery(tab);
  const tabInfo = COHORT_TAB_INFO[tab];

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [editState, setEditState] = useState<EditState | null>(null);

  // Only ADMIN can edit questions (mentors have read-only access)
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });
  const canEdit = me.data?.role === 'ADMIN';

  // Switching tab clears everything: filters from one cohort mean nothing in another. C1 and C2
  // are fixed to their belt, so the belt is part of the tab rather than a filter to set.
  useEffect(() => {
    setFilters({ ...NO_FILTERS, belt: tabBelt });
    setPage(1);
  }, [tab, tabBelt]);

  const setTab = (next: CohortTab) => {
    if (next !== tab) router.replace(`/question-bank?cohort=${next}`);
  };
  // "Other belts" always sits on one specific belt (never "all", which would include C1 and C2's).
  const otherBelts = (options0Belts: { belt: number }[] | undefined) =>
    (options0Belts ?? []).map((b) => b.belt).filter((b) => b !== 5 && b !== 6);
  const resetFilters = () => update({ ...NO_FILTERS, belt: tab === 'OTHER' ? (filters.belt || tabBelt) : tabBelt });
  const update = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const options = useQuery({
    queryKey: ['question-bank-filters', group],
    queryFn: () => api.questionBankFilters(group),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (tab !== 'OTHER' || filters.belt) return;
    const first = otherBelts(options.data?.belts)[0];
    if (first !== undefined) setFilters((current) => ({ ...current, belt: String(first) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filters.belt, options.data]);

  const query = useMemo(
    () => ({ group, ...filters, belt: filters.belt || tabBelt, page, pageSize: PAGE_SIZE }),
    [group, filters, tabBelt, page],
  );
  const sets = useQuery({
    queryKey: ['question-bank-sets', query],
    queryFn: () => api.questionBankSets(query),
    // "Other belts" waits for its belt so it never briefly lists C1 and C2's questions.
    enabled: tab !== 'OTHER' || Boolean(query.belt),
    placeholderData: (previous) => previous,
  });

  // The tab's own belt is not a filter the user chose, so it does not count as one.
  const activeFilterCount = Object.entries(filters).filter(([key, value]) =>
    Boolean(value) && key !== 'belt',
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Coding Hours Question Bank</h1>
        <p className="mt-1 max-w-3xl text-xs text-[var(--color-fg-muted)]">
          Ready-made questions for every day of the programme. Choose your cohort, find the day, and
          use its four questions in an assignment.
        </p>
      </div>

      <div role="tablist" aria-label="Cohort" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {COHORT_TABS.map((t) => {
          const active = t === tab;
          const info = COHORT_TAB_INFO[t];
          return (
            <button
              key={t}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t)}
              className={cn(
                'rounded-xl border border-l-4 p-4 text-left transition-colors',
                TAB_ACCENT[t],
                active
                  ? 'border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] shadow-sm'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] opacity-75 hover:opacity-100',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{info.title}</span>
                {active ? <Badge tone={TAB_TONE[t]}>Viewing</Badge> : null}
              </div>
              <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{info.subtitle}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-4 py-3 text-xs text-[var(--color-fg-muted)]">
        <strong>{tabInfo.title}{tab === 'OTHER' ? '' : ` · ${tabInfo.subtitle}`}.</strong> {tabInfo.description}{' '}
        No questions are shared on the weekly session day.
      </div>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Badge tone={TAB_TONE[tab]}>{tabInfo.title}</Badge>
              <span>Filters</span>
            </span>
          }
          description={
            options.data
              ? `${options.data.totals.sets} days · ${options.data.totals.questions} questions in ${tabInfo.title}`
              : 'Loading…'
          }
          action={
            activeFilterCount > 0 ? (
              <Button variant="ghost" onClick={resetFilters}>
                <X className="h-3.5 w-3.5" /> Reset filters
              </Button>
            ) : null
          }
        />
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <FilterBar tab={tab} group={group} filters={filters} update={update} options={options.data} />
        </div>
      </Card>

      {sets.error ? (
        <ErrorState error={sets.error} onRetry={() => void sets.refetch()} />
      ) : !sets.data ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : sets.data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title={`No ${tabInfo.title} days match these filters`}
            description="Try removing a filter, or reset them all."
            action={
              activeFilterCount > 0 ? (
                <Button variant="secondary" onClick={resetFilters}>
                  Reset filters
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className={cn('space-y-4', sets.isFetching && 'opacity-70')}>
          {sets.data.items.map((set) => (
            <SetCard
              key={set.setKey}
              set={set}
              canEdit={canEdit}
              onEdit={setEditState}
              onRefresh={() => void sets.refetch()}
            />
          ))}
          <div className="flex items-center justify-between text-xs text-[var(--color-fg-muted)]">
            <span>
              {tabInfo.title} · {sets.data.total} {sets.data.total === 1 ? 'day' : 'days'} · page {sets.data.page}{' '}
              of {Math.max(sets.data.totalPages, 1)}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </Button>
              <Button variant="secondary" disabled={page >= sets.data.totalPages} onClick={() => setPage(page + 1)}>
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <EditQuestionModal
        editState={editState}
        onClose={() => setEditState(null)}
        onSuccess={() => void sets.refetch()}
      />
    </div>
  );
}

function Select({
  id, label, value, onChange, children, noAll = false,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void; children: React.ReactNode; noAll?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>{label}</label>
      <select id={id} className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {noAll ? null : <option value="">All</option>}
        {children}
      </select>
    </div>
  );
}

function FilterBar({
  tab, group, filters, update, options,
}: {
  tab: CohortTab;
  group: QuestionBankGroup;
  filters: Filters;
  update: (patch: Partial<Filters>) => void;
  options: import('@dsa/shared').QuestionBankFiltersResponse | undefined;
}) {
  const opt = (values: (string | number)[] | undefined) =>
    (values ?? []).map((v) => <option key={v} value={v}>{v}</option>);

  // A belt only has its own weeks — offering another belt's weeks would build an empty query.
  const beltWeeks = options?.belts.find((b) => String(b.belt) === filters.belt)?.weeks;
  const g1Weeks = beltWeeks ?? [...new Set((options?.belts ?? []).flatMap((b) => b.weeks))].sort((a, b) => a - b);

  return (
    <>
      {group === 'GROUP_1' ? (
        <>
          {/* C1 and C2 are fixed to their belt, so the belt picker only appears for "Other belts",
              where it lists just the belts no cohort is running. */}
          {tab === 'OTHER' ? (
            <Select id="qb-belt" label="Belt" noAll value={filters.belt} onChange={(v) => update({ belt: v, week: '' })}>
              {(options?.belts ?? []).filter((b) => b.belt !== 5 && b.belt !== 6).map((b) => (
                <option key={b.belt} value={b.belt}>Belt {b.belt}</option>
              ))}
            </Select>
          ) : null}
          <Select id="qb-week" label="Week" value={filters.week} onChange={(v) => update({ week: v })}>
            {opt(g1Weeks)}
          </Select>
          <Select id="qb-day" label="Curriculum day" value={filters.day} onChange={(v) => update({ day: v })}>
            {opt(Array.from({ length: GROUP_1_PRACTICE_DAYS_PER_WEEK }, (_, i) => i + 1))}
          </Select>
          <Select id="qb-topic" label="Topic" value={filters.topic} onChange={(v) => update({ topic: v })}>
            {opt(options?.topics)}
          </Select>
          <Select id="qb-pattern" label="Pattern" value={filters.pattern} onChange={(v) => update({ pattern: v })}>
            {opt(options?.patterns)}
          </Select>
        </>
      ) : (
        <>
          <Select id="qb-week" label="Week" value={filters.week} onChange={(v) => update({ week: v })}>
            {opt(options?.weeks)}
          </Select>
          <Select id="qb-weekday" label="Weekday" value={filters.weekday} onChange={(v) => update({ weekday: v })}>
            {opt(options?.weekdays)}
          </Select>
          <div className="flex flex-col gap-1">
            <label htmlFor="qb-daynum" className={labelClass}>Day #</label>
            <input
              id="qb-daynum" type="number" min={1} max={80} placeholder="1–80" className={selectClass}
              value={filters.day} onChange={(e) => update({ day: e.target.value })}
            />
          </div>
          <Select id="qb-theme" label="Daily theme" value={filters.theme} onChange={(v) => update({ theme: v })}>
            {opt(options?.dailyThemes)}
          </Select>
          <Select id="qb-role" label="Question role" value={filters.role} onChange={(v) => update({ role: v })}>
            {opt(options?.roles)}
          </Select>
        </>
      )}
      <Select id="qb-diff" label="Difficulty" value={filters.difficulty} onChange={(v) => update({ difficulty: v })}>
        {(options?.difficulties ?? []).map((d) => (
          <option key={d} value={d}>{d.charAt(0) + d.slice(1).toLowerCase()}</option>
        ))}
      </Select>
      <div className="flex flex-col gap-1 sm:col-span-2">
        <label htmlFor="qb-search" className={labelClass}>Problem title or LeetCode #</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-[var(--color-fg-subtle)]" />
          <input
            id="qb-search" type="search" placeholder="e.g. Two Sum, or 560"
            className={cn(selectClass, 'w-full pl-8')}
            value={filters.q} onChange={(e) => update({ q: e.target.value })}
          />
        </div>
      </div>
    </>
  );
}

interface EditState {
  question: QuestionBankQuestionDto;
  setKey: string;
  group: QuestionBankGroup;
}

function SetCard({ set, onEdit, onRefresh, canEdit }: {
  set: QuestionBankSetDto;
  onEdit: (state: EditState) => void;
  onRefresh: () => void;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const group = set.group;
  const cohortTab = cohortTabOfSet(set);
  const subtitle = group === 'GROUP_1' ? set.dayFocus : set.dailyTheme;
  const anyMatched = set.questions.some((q) => q.matched);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [addPosition, setAddPosition] = useState(set.questions.length + 1);
  const [addTopic, setAddTopic] = useState('');
  const [addPattern, setAddPattern] = useState('');
  const [addRole, setAddRole] = useState('');

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) => api.questionBankDeleteEntry(entryId),
    onSuccess: () => {
      toast.success('Question removed');
      void queryClient.invalidateQueries({ queryKey: ['question-bank-sets'] });
      onRefresh();
    },
    onError: (err: Error) => toast.error('Failed to remove question', { description: err.message }),
  });

  const addMutation = useMutation({
    mutationFn: () => api.questionBankAddEntry(set.setKey, {
      leetcodeUrl: addUrl,
      position: addPosition,
      ...(group === 'GROUP_1' ? { topic: addTopic || undefined, pattern: addPattern || undefined } : { role: addRole || undefined }),
    }),
    onSuccess: () => {
      toast.success('Question added');
      setShowAddForm(false);
      setAddUrl('');
      void queryClient.invalidateQueries({ queryKey: ['question-bank-sets'] });
      onRefresh();
    },
    onError: (err: Error) => toast.error('Failed to add question', { description: err.message }),
  });

  const handleDelete = (q: QuestionBankQuestionDto) => {
    if (confirm(`Remove Q${q.position} "${q.title}" from ${set.setKey}?`)) {
      deleteMutation.mutate(q.id);
    }
  };

  const usedPositions = new Set(set.questions.map((q) => q.position));
  const nextAvailable = Array.from({ length: 10 }, (_, i) => i + 1).find((p) => !usedPositions.has(p)) ?? set.questions.length + 1;

  return (
    <Card className={cn('border-l-4', TAB_ACCENT[cohortTab])}>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={TAB_TONE[cohortTab]}>{COHORT_TAB_INFO[cohortTab].title}</Badge>
            <span>{cohortSetTitle(set)}</span>
          </span>
        }
        description={subtitle}
        action={canEdit ? (
          <Link
            href={`/assignments?fromBank=${encodeURIComponent(set.setKey)}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-xs font-medium text-[var(--color-brand-fg)] hover:opacity-90"
          >
            Use these {set.questions.length} questions <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : undefined}
      />
      <TableShell fixed>
        <colgroup>
          <col className="w-12" />
          <col className="w-24" />
          <col />
          <col className="w-28" />
          {group === 'GROUP_1' ? (
            <>
              <col className="w-44" />
              <col className="w-52" />
            </>
          ) : (
            <col className="w-28" />
          )}
          {canEdit && <col className="w-24" />}
        </colgroup>
        <thead>
          <tr>
            <Th>Q</Th>
            <Th>LeetCode #</Th>
            <Th>Problem</Th>
            <Th>Difficulty</Th>
            {group === 'GROUP_1' ? (
              <>
                <Th>Topic</Th>
                <Th>Pattern</Th>
              </>
            ) : (
              <Th>Role</Th>
            )}
            {canEdit && <Th>Actions</Th>}
          </tr>
        </thead>
        <tbody>
          {set.questions.map((q) => (
            <QuestionRow
              key={q.position}
              q={q}
              group={group}
              highlight={anyMatched && q.matched}
              canEdit={canEdit}
              onEdit={() => onEdit({ question: q, setKey: set.setKey, group })}
              onDelete={() => handleDelete(q)}
              isDeleting={deleteMutation.isPending}
            />
          ))}
        </tbody>
      </TableShell>

      {canEdit && (
        <div className="border-t border-[var(--color-border)] p-3">
          {!showAddForm ? (
            <Button variant="ghost" onClick={() => { setAddPosition(nextAvailable); setShowAddForm(true); }}>
              <Plus className="h-3.5 w-3.5" /> Add question
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2">
                  <label className={labelClass}>LeetCode URL</label>
                  <input
                    className={cn(selectClass, 'mt-1 w-full')}
                    placeholder="https://leetcode.com/problems/two-sum/"
                    value={addUrl}
                    onChange={(e) => setAddUrl(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Position</label>
                  <input
                    type="number" min={1} max={10}
                    className={cn(selectClass, 'mt-1 w-full')}
                    value={addPosition}
                    onChange={(e) => setAddPosition(Number(e.target.value))}
                  />
                </div>
                {group === 'GROUP_1' ? (
                  <>
                    <div>
                      <label className={labelClass}>Topic</label>
                      <input className={cn(selectClass, 'mt-1 w-full')} value={addTopic} onChange={(e) => setAddTopic(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelClass}>Pattern</label>
                      <input className={cn(selectClass, 'mt-1 w-full')} value={addPattern} onChange={(e) => setAddPattern(e.target.value)} />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className={labelClass}>Role</label>
                    <select className={cn(selectClass, 'mt-1 w-full')} value={addRole} onChange={(e) => setAddRole(e.target.value)}>
                      <option value="">Select...</option>
                      <option value="Warm-up">Warm-up</option>
                      <option value="Core">Core</option>
                      <option value="Stretch">Stretch</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="primary" loading={addMutation.isPending} onClick={() => addMutation.mutate()} disabled={!addUrl}>
                  Add Question
                </Button>
                <Button variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {group === 'GROUP_1' && set.questions[0]?.usage ? (
        <p className="border-t border-[var(--color-border)] px-5 py-2 text-[11px] text-[var(--color-fg-subtle)]">
          Source reference: {set.questions[0].usage.replace(/ Q1$/, '')}
        </p>
      ) : null}
    </Card>
  );
}

function QuestionRow({
  q, group, highlight, canEdit, onEdit, onDelete, isDeleting,
}: {
  q: QuestionBankQuestionDto;
  group: QuestionBankGroup;
  highlight: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <tr className={cn(highlight && 'bg-[var(--color-brand-soft)]')}>
      <Td className="font-mono text-xs">Q{q.position}</Td>
      <Td className="font-mono text-xs">{q.leetcodeNumber}</Td>
      <Td>
        <a
          href={q.url} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium hover:text-[var(--color-brand)]"
        >
          {q.title} <ExternalLink className="h-3 w-3 opacity-60" />
        </a>
      </Td>
      <Td><DifficultyBadge difficulty={q.difficulty} /></Td>
      {group === 'GROUP_1' ? (
        <>
          <Td className="text-xs text-[var(--color-fg-muted)]">{q.topic}</Td>
          <Td className="text-xs text-[var(--color-fg-muted)]">{q.pattern}</Td>
        </>
      ) : (
        <Td>
          <Badge tone={q.role === 'Stretch' ? 'danger' : q.role === 'Core' ? 'info' : 'success'}>{q.role}</Badge>
        </Td>
      )}
      {canEdit && (
        <Td>
          <div className="flex gap-1">
            <button
              onClick={onEdit}
              className="rounded p-1 text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-brand)]"
              title="Edit question"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className="rounded p-1 text-[var(--color-fg-muted)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)] disabled:opacity-50"
              title="Remove question"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </Td>
      )}
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit Question Modal
// ─────────────────────────────────────────────────────────────────────────────

function EditQuestionModal({
  editState,
  onClose,
  onSuccess,
}: {
  editState: EditState | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const [leetcodeUrl, setLeetcodeUrl] = useState('');
  const [topic, setTopic] = useState('');
  const [pattern, setPattern] = useState('');
  const [role, setRole] = useState('');

  useEffect(() => {
    if (editState) {
      setLeetcodeUrl('');
      setTopic(editState.question.topic ?? '');
      setPattern(editState.question.pattern ?? '');
      setRole(editState.question.role ?? '');
    }
  }, [editState]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!editState) throw new Error('No question selected');
      return api.questionBankUpdateEntry(editState.question.id, {
        ...(leetcodeUrl ? { leetcodeUrl } : {}),
        ...(editState.group === 'GROUP_1' ? { topic, pattern } : { role }),
      });
    },
    onSuccess: () => {
      toast.success('Question updated');
      void queryClient.invalidateQueries({ queryKey: ['question-bank-sets'] });
      onSuccess();
      onClose();
    },
    onError: (err: Error) => toast.error('Failed to update question', { description: err.message }),
  });

  if (!editState) return null;

  const { question: q, group } = editState;
  const hasChanges = leetcodeUrl || topic !== (q.topic ?? '') || pattern !== (q.pattern ?? '') || role !== (q.role ?? '');

  return (
    <Modal open={!!editState} onClose={onClose} title={`Edit Q${q.position}: ${q.title}`}>
      <div className="space-y-4 p-5">
        <div className="rounded-lg bg-[var(--color-surface-sunken)] p-3 text-sm">
          <p className="font-medium">Current: #{q.leetcodeNumber} {q.title}</p>
          <p className="text-xs text-[var(--color-fg-muted)]">{q.url}</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Replace with different LeetCode problem</label>
            <input
              className={cn(selectClass, 'mt-1 w-full')}
              placeholder="https://leetcode.com/problems/another-problem/ (leave empty to keep current)"
              value={leetcodeUrl}
              onChange={(e) => setLeetcodeUrl(e.target.value)}
            />
            <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
              Leave empty to keep the current problem and only update metadata below.
            </p>
          </div>

          {group === 'GROUP_1' ? (
            <>
              <div>
                <label className="text-sm font-medium">Topic</label>
                <input
                  className={cn(selectClass, 'mt-1 w-full')}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Pattern</label>
                <input
                  className={cn(selectClass, 'mt-1 w-full')}
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                />
              </div>
            </>
          ) : (
            <div>
              <label className="text-sm font-medium">Role</label>
              <select className={cn(selectClass, 'mt-1 w-full')} value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">None</option>
                <option value="Warm-up">Warm-up</option>
                <option value="Core">Core</option>
                <option value="Stretch">Stretch</option>
              </select>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={mutation.isPending} disabled={!hasChanges} onClick={() => mutation.mutate()}>
            Save Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
}
