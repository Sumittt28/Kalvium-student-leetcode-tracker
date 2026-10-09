'use client';

/**
 * Coding Hours Question Bank.
 *
 * Reference data only: it shows what the curriculum prescribes for a day and hands the four
 * questions to the existing Assignments page. It reads nothing about students and creates
 * nothing itself.
 *
 * The two groups are separate, first-class states, never one merged list. The selected group
 * lives in the URL (`?group=`) so a link, a refresh or the back button can never land on the
 * other group's questions by accident, and every filter is reset when the group changes so a
 * Group 1 belt can never silently narrow a Group 2 view.
 */

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, ExternalLink, Search, X } from 'lucide-react';
import {
  GROUP_1_OPERATIONAL_DAYS_PER_WEEK,
  GROUP_1_SOURCE_DAYS_PER_WEEK,
  QUESTION_BANK_GROUPS,
  QUESTION_BANK_GROUP_DESCRIPTIONS,
  QUESTION_BANK_GROUP_LABELS,
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
  Skeleton,
  TableShell,
  Td,
  Th,
} from '@/components/ui';

const PAGE_SIZE = 12;

/** A group's identity colour, used everywhere that group appears so it is never ambiguous. */
const GROUP_TONE: Record<QuestionBankGroup, 'brand' | 'info'> = { GROUP_1: 'brand', GROUP_2: 'info' };
const GROUP_ACCENT: Record<QuestionBankGroup, string> = {
  GROUP_1: 'border-l-[var(--color-brand)]',
  GROUP_2: 'border-l-[var(--color-info)]',
};
const GROUP_SHORT: Record<QuestionBankGroup, string> = { GROUP_1: 'Group 1', GROUP_2: 'Group 2' };

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
  const requested = params.get('group');
  const group: QuestionBankGroup = (QUESTION_BANK_GROUPS as readonly string[]).includes(requested ?? '')
    ? (requested as QuestionBankGroup)
    : 'GROUP_1';

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);

  // Switching group clears everything: filters from one group mean nothing in the other.
  useEffect(() => {
    setFilters(NO_FILTERS);
    setPage(1);
  }, [group]);

  const setGroup = (next: QuestionBankGroup) => {
    if (next !== group) router.replace(`/question-bank?group=${next}`);
  };
  const update = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const options = useQuery({
    queryKey: ['question-bank-filters', group],
    queryFn: () => api.questionBankFilters(group),
    staleTime: 5 * 60_000,
  });

  const query = useMemo(
    () => ({ group, ...filters, page, pageSize: PAGE_SIZE }),
    [group, filters, page],
  );
  const sets = useQuery({
    queryKey: ['question-bank-sets', query],
    queryFn: () => api.questionBankSets(query),
    placeholderData: (previous) => previous,
  });

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Coding Hours Question Bank</h1>
        <p className="mt-1 max-w-3xl text-xs text-[var(--color-fg-muted)]">
          The curated questions for each curriculum day. Pick the right group, find the day, and use its
          four questions in an assignment — no searching the internet.
        </p>
      </div>

      <div role="tablist" aria-label="Question bank group" className="grid gap-3 md:grid-cols-2">
        {QUESTION_BANK_GROUPS.map((g) => {
          const active = g === group;
          return (
            <button
              key={g}
              role="tab"
              aria-selected={active}
              onClick={() => setGroup(g)}
              className={cn(
                'rounded-xl border border-l-4 p-4 text-left transition-colors',
                GROUP_ACCENT[g],
                active
                  ? 'border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] shadow-sm'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] opacity-75 hover:opacity-100',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{QUESTION_BANK_GROUP_LABELS[g]}</span>
                {active ? <Badge tone={GROUP_TONE[g]}>Viewing</Badge> : null}
              </div>
              <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{QUESTION_BANK_GROUP_DESCRIPTIONS[g]}</p>
            </button>
          );
        })}
      </div>

      {group === 'GROUP_1' ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-4 py-3 text-xs text-[var(--color-fg-muted)]">
          The Group 1 curriculum lists <strong>{GROUP_1_SOURCE_DAYS_PER_WEEK} days per week</strong>, while
          questions are shared on <strong>{GROUP_1_OPERATIONAL_DAYS_PER_WEEK}</strong> practice days (none on the
          concept-session day). All {GROUP_1_SOURCE_DAYS_PER_WEEK} are shown here unchanged — choose the day you
          want to assign.
        </div>
      ) : null}

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Badge tone={GROUP_TONE[group]}>{GROUP_SHORT[group]}</Badge>
              <span>Filters</span>
            </span>
          }
          description={
            options.data
              ? `${options.data.totals.sets} days · ${options.data.totals.questions} questions in ${GROUP_SHORT[group]}`
              : 'Loading…'
          }
          action={
            activeFilterCount > 0 ? (
              <Button variant="ghost" onClick={() => update({ ...NO_FILTERS })}>
                <X className="h-3.5 w-3.5" /> Reset filters
              </Button>
            ) : null
          }
        />
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <FilterBar group={group} filters={filters} update={update} options={options.data} />
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
            title={`No ${GROUP_SHORT[group]} days match these filters`}
            description="Try removing a filter, or reset them all."
            action={
              activeFilterCount > 0 ? (
                <Button variant="secondary" onClick={() => update({ ...NO_FILTERS })}>
                  Reset filters
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className={cn('space-y-4', sets.isFetching && 'opacity-70')}>
          {sets.data.items.map((set) => (
            <SetCard key={set.setKey} set={set} />
          ))}
          <div className="flex items-center justify-between text-xs text-[var(--color-fg-muted)]">
            <span>
              {GROUP_SHORT[group]} · {sets.data.total} {sets.data.total === 1 ? 'day' : 'days'} · page {sets.data.page}{' '}
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
    </div>
  );
}

function Select({
  id, label, value, onChange, children,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>{label}</label>
      <select id={id} className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {children}
      </select>
    </div>
  );
}

function FilterBar({
  group, filters, update, options,
}: {
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
          <Select id="qb-belt" label="Belt" value={filters.belt} onChange={(v) => update({ belt: v, week: '' })}>
            {(options?.belts ?? []).map((b) => <option key={b.belt} value={b.belt}>Belt {b.belt}</option>)}
          </Select>
          <Select id="qb-week" label="Week" value={filters.week} onChange={(v) => update({ week: v })}>
            {opt(g1Weeks)}
          </Select>
          <Select id="qb-day" label="Curriculum day" value={filters.day} onChange={(v) => update({ day: v })}>
            {opt([1, 2, 3, 4, 5, 6])}
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

function setHeading(set: QuestionBankSetDto): string {
  return set.group === 'GROUP_1'
    ? `Belt ${set.belt} · Week ${set.week} · Day ${set.day}`
    : `Week ${set.week} · ${set.weekday} · Day ${set.day}`;
}

function SetCard({ set }: { set: QuestionBankSetDto }) {
  const group = set.group;
  const subtitle = group === 'GROUP_1' ? set.dayFocus : set.dailyTheme;
  const anyMatched = set.questions.some((q) => q.matched);
  return (
    <Card className={cn('border-l-4', GROUP_ACCENT[group])}>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={GROUP_TONE[group]}>{GROUP_SHORT[group]}</Badge>
            <span>{setHeading(set)}</span>
          </span>
        }
        description={subtitle}
        action={
          // Hands the four questions to the existing Assignments form. That form still asks
          // for the campus and batch explicitly; nothing is created from here.
          <Link
            href={`/assignments?fromBank=${encodeURIComponent(set.setKey)}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-xs font-medium text-[var(--color-brand-fg)] hover:opacity-90"
          >
            Use these 4 questions <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
      <TableShell fixed>
        {/* Fixed widths so every day's table lines up with the one above it. */}
        <colgroup>
          <col className="w-12" />
          <col className="w-24" />
          <col />
          <col className="w-28" />
          {group === 'GROUP_1' ? (
            <>
              <col className="w-52" />
              <col className="w-60" />
            </>
          ) : (
            <col className="w-32" />
          )}
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
          </tr>
        </thead>
        <tbody>
          {set.questions.map((q) => (
            <QuestionRow key={q.position} q={q} group={group} highlight={anyMatched && q.matched} />
          ))}
        </tbody>
      </TableShell>
      {group === 'GROUP_1' && set.questions[0]?.usage ? (
        <p className="border-t border-[var(--color-border)] px-5 py-2 text-[11px] text-[var(--color-fg-subtle)]">
          Source reference: {set.questions[0].usage.replace(/ Q1$/, '')}
        </p>
      ) : null}
    </Card>
  );
}

function QuestionRow({ q, group, highlight }: { q: QuestionBankQuestionDto; group: QuestionBankGroup; highlight: boolean }) {
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
    </tr>
  );
}
