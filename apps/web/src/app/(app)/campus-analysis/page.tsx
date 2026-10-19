'use client';

/**
 * Campus Analysis — Coding Hours Analytics Dashboard
 *
 * Three banners, one source of truth:
 *   1. Weekly Campus Overview (4 metric cards)
 *   2. Daily Assignment Performance (date-wise table)
 *   3. Student-wise Weekly Performance (student × date matrix with bands)
 *
 * All sections share the same underlying data from a single API call
 * (`/campus-analysis/coding-hours-overview`), so totals always reconcile.
 *
 * Definitions:
 *   Attempt Rate = Distinct questions attempted at least once / Total assigned × 100
 *   Solve Rate   = Distinct questions solved / Total assigned × 100
 *   Accuracy     = Solved / Attempted × 100 (conversion rate)
 *   Week         = Tuesday to Saturday (Coding Hours schedule)
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, BookOpen, Target, CheckCircle, ChevronLeft, ChevronRight, Search } from 'lucide-react';

import { api, type CodingHoursOverview } from '@/lib/api';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Skeleton,
  StatTile,
  TableShell,
  Td,
  Th,
} from '@/components/ui';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtPct = (v: number | null): string => (v === null ? '—' : `${v}%`);

const fmtDate = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

const BAND_STYLES: Record<string, { bg: string; text: string }> = {
  'Consistent Progress': { bg: 'bg-green-100', text: 'text-green-800' },
  'Active — Accuracy Needs Improvement': { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  'Strong Accuracy — Low Activity': { bg: 'bg-blue-100', text: 'text-blue-800' },
  'Low Participation': { bg: 'bg-orange-100', text: 'text-orange-800' },
  'No Recorded Activity': { bg: 'bg-red-100', text: 'text-red-800' },
  'Insufficient Data': { bg: 'bg-gray-100', text: 'text-gray-600' },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CampusAnalysisPage() {
  const [campusId, setCampusId] = useState('');
  const [weekDate, setWeekDate] = useState(''); // any date in the target week
  const [studentSearch, setStudentSearch] = useState('');
  const [bandFilter, setBandFilter] = useState('ALL');

  // Load campuses for the picker
  const campuses = useQuery({
    queryKey: ['campuses', 'coding-hours-activity'],
    queryFn: () => api.campuses(true),
  });

  // Auto-select first campus once loaded
  const effectiveCampusId = campusId || campuses.data?.[0]?.id || '';

  // Main data query
  const overview = useQuery({
    queryKey: ['coding-hours-overview', effectiveCampusId, weekDate],
    queryFn: () =>
      api.codingHoursOverview({
        campusId: effectiveCampusId,
        date: weekDate || undefined,
      }),
    enabled: !!effectiveCampusId,
  });

  const data = overview.data;

  // Derive available bands for filter
  const availableBands = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.students.map((s) => s.band));
    return [...set].sort();
  }, [data]);

  // Filtered students
  const filteredStudents = useMemo(() => {
    if (!data) return [];
    return data.students.filter((s) => {
      if (bandFilter !== 'ALL' && s.band !== bandFilter) return false;
      if (studentSearch) {
        const q = studentSearch.toLowerCase();
        if (!s.name.toLowerCase().includes(q) && !s.email.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [data, bandFilter, studentSearch]);

  // Band summary counts
  const bandCounts = useMemo(() => {
    if (!data) return {};
    const counts: Record<string, number> = {};
    for (const s of data.students) {
      counts[s.band] = (counts[s.band] ?? 0) + 1;
    }
    return counts;
  }, [data]);

  // Week navigation helpers
  const shiftWeek = (days: number) => {
    if (!data) return;
    const base = new Date(`${data.week.from}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() + days);
    setWeekDate(base.toISOString().slice(0, 10));
  };

  return (
    <div className="space-y-8">
      {/* ----------------------------------------------------------------- */}
      {/* Filters                                                           */}
      {/* ----------------------------------------------------------------- */}
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Campus Analysis</h1>
        <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
          Coding Hours weekly overview — Attempt Rate = distinct questions attempted / assigned.
          Solve Rate = questions solved / assigned.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-xs text-[var(--color-fg-muted)]">
            Campus
            <select
              value={effectiveCampusId}
              onChange={(e) => setCampusId(e.target.value)}
              className="mt-1 block rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-2 py-1.5 text-sm"
            >
              {(campuses.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-[var(--color-fg-muted)]">
            Week (pick any date)
            <input
              type="date"
              value={weekDate}
              onChange={(e) => setWeekDate(e.target.value)}
              className="mt-1 block rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-2 py-1.5 text-sm"
            />
          </label>

          {data && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" onClick={() => shiftWeek(-7)} title="Previous week">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="rounded-md bg-[var(--color-surface-sunken)] px-3 py-1.5 text-sm font-medium">
                {data.week.label}
              </span>
              <Button variant="ghost" onClick={() => shiftWeek(7)} title="Next week">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Loading / Error */}
      {overview.isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-64" />
        </div>
      )}
      {overview.error && <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />}

      {data && (
        <>
          {/* --------------------------------------------------------------- */}
          {/* Banner 1: Weekly Campus Overview                                 */}
          {/* --------------------------------------------------------------- */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
              Weekly Campus Overview
            </h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile
                label="Total Students"
                value={data.summary.totalStudents}
                hint={`Active students at ${data.campus.code}`}
                tone="info"
                icon={<Users className="h-4 w-4" />}
              />
              <StatTile
                label="Qs Assigned / Student"
                value={data.summary.questionsPerStudent}
                hint={`${data.summary.totalAssigned} total assigned opportunities`}
                tone="neutral"
                icon={<BookOpen className="h-4 w-4" />}
              />
              <StatTile
                label="Attempt Rate"
                value={fmtPct(data.summary.attemptRate)}
                hint={`${data.summary.totalAttempted} of ${data.summary.totalAssigned} question slots attempted`}
                tone={
                  data.summary.attemptRate === null
                    ? 'neutral'
                    : data.summary.attemptRate >= 50
                      ? 'success'
                      : data.summary.attemptRate >= 25
                        ? 'warning'
                        : 'danger'
                }
                icon={<Target className="h-4 w-4" />}
              />
              <StatTile
                label="Solve Rate"
                value={fmtPct(data.summary.solveRate)}
                hint={`${data.summary.totalSolved} of ${data.summary.totalAssigned} question slots solved`}
                tone={
                  data.summary.solveRate === null
                    ? 'neutral'
                    : data.summary.solveRate >= 50
                      ? 'success'
                      : data.summary.solveRate >= 25
                        ? 'warning'
                        : 'danger'
                }
                icon={<CheckCircle className="h-4 w-4" />}
              />
            </div>
          </section>

          {/* --------------------------------------------------------------- */}
          {/* Banner 2: Daily Assignment Performance                           */}
          {/* --------------------------------------------------------------- */}
          <section>
            <Card>
              <CardHeader
                title="Daily Assignment Performance"
                description="Date-wise breakdown of assignments, attempts, and solves for the selected week."
              />
              <div className="px-5 pb-4">
                {data.dailyBreakdown.every((d) => d.totalAssigned === 0) ? (
                  <EmptyState title="No assignments" description="No questions were assigned during this week." />
                ) : (
                  <TableShell>
                    <thead>
                      <tr>
                        <Th>Date</Th>
                        <Th className="text-right">Qs / Student</Th>
                        <Th className="text-right">Total Assigned</Th>
                        <Th className="text-right">Total Attempted</Th>
                        <Th className="text-right">Attempt Rate</Th>
                        <Th className="text-right">Total Solved</Th>
                        <Th className="text-right">Solve Rate</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.dailyBreakdown.map((day) => (
                        <tr key={day.date} className={day.totalAssigned === 0 ? 'opacity-40' : ''}>
                          <Td className="whitespace-nowrap font-medium">{fmtDate(day.date)}</Td>
                          <Td className="text-right tabular-nums">{day.questionsPerStudent || '—'}</Td>
                          <Td className="text-right tabular-nums">{day.totalAssigned || '—'}</Td>
                          <Td className="text-right tabular-nums">{day.totalAssigned > 0 ? day.totalAttempted : '—'}</Td>
                          <Td className="text-right tabular-nums">
                            <span className={
                              day.attemptRate === null ? '' :
                              day.attemptRate >= 50 ? 'text-green-600' :
                              day.attemptRate >= 25 ? 'text-yellow-600' : 'text-red-600'
                            }>
                              {fmtPct(day.attemptRate)}
                            </span>
                          </Td>
                          <Td className="text-right tabular-nums">{day.totalAssigned > 0 ? day.totalSolved : '—'}</Td>
                          <Td className="text-right tabular-nums">
                            <span className={
                              day.solveRate === null ? '' :
                              day.solveRate >= 50 ? 'text-green-600' :
                              day.solveRate >= 25 ? 'text-yellow-600' : 'text-red-600'
                            }>
                              {fmtPct(day.solveRate)}
                            </span>
                          </Td>
                        </tr>
                      ))}
                      {/* Totals row */}
                      <tr className="border-t-2 border-[var(--color-border)] font-semibold">
                        <Td>Week Total</Td>
                        <Td className="text-right tabular-nums">{data.summary.questionsPerStudent}</Td>
                        <Td className="text-right tabular-nums">{data.summary.totalAssigned}</Td>
                        <Td className="text-right tabular-nums">{data.summary.totalAttempted}</Td>
                        <Td className="text-right tabular-nums">{fmtPct(data.summary.attemptRate)}</Td>
                        <Td className="text-right tabular-nums">{data.summary.totalSolved}</Td>
                        <Td className="text-right tabular-nums">{fmtPct(data.summary.solveRate)}</Td>
                      </tr>
                    </tbody>
                  </TableShell>
                )}
              </div>
            </Card>
          </section>

          {/* --------------------------------------------------------------- */}
          {/* Banner 3: Student-wise Weekly Performance                        */}
          {/* --------------------------------------------------------------- */}
          <section>
            <Card>
              <CardHeader
                title="Student-wise Weekly Performance"
                description="Each student's daily assignments, attempts, solves, and overall performance band."
              />
              <div className="px-5 pb-4">
                {/* Band summary pills */}
                <div className="mb-4 flex flex-wrap gap-2">
                  {Object.entries(bandCounts).sort(([a], [b]) => a.localeCompare(b)).map(([band, count]) => {
                    const style = BAND_STYLES[band] ?? BAND_STYLES['Insufficient Data'];
                    return (
                      <button
                        key={band}
                        onClick={() => setBandFilter(bandFilter === band ? 'ALL' : band)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-opacity ${style.bg} ${style.text} ${
                          bandFilter !== 'ALL' && bandFilter !== band ? 'opacity-40' : ''
                        }`}
                      >
                        {band} <span className="font-bold">{count}</span>
                      </button>
                    );
                  })}
                  {bandFilter !== 'ALL' && (
                    <button
                      onClick={() => setBandFilter('ALL')}
                      className="text-xs text-[var(--color-fg-muted)] underline"
                    >
                      Clear filter
                    </button>
                  )}
                </div>

                {/* Search */}
                <div className="relative mb-4 max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--color-fg-muted)]" />
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] py-2 pl-8 pr-3 text-sm"
                  />
                </div>

                {filteredStudents.length === 0 ? (
                  <EmptyState
                    title="No students match"
                    description={studentSearch || bandFilter !== 'ALL' ? 'Try adjusting your filters.' : 'No students found for this campus.'}
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        {/* Level 1: Date groups */}
                        <tr>
                          <th
                            className="sticky left-0 z-20 border-b border-r border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-left text-xs font-semibold"
                            rowSpan={2}
                          >
                            Student
                          </th>
                          {data.dailyBreakdown.map((day) => (
                            <th
                              key={day.date}
                              colSpan={3}
                              className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-1 py-1.5 text-center text-xs font-semibold"
                            >
                              {fmtDate(day.date)}
                            </th>
                          ))}
                          <th
                            colSpan={4}
                            className="border-b border-l border-[var(--color-border)] bg-[var(--color-surface-raised)] px-1 py-1.5 text-center text-xs font-semibold"
                          >
                            Weekly
                          </th>
                          <th
                            className="sticky right-0 z-20 border-b border-l border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-left text-xs font-semibold"
                            rowSpan={2}
                          >
                            Band
                          </th>
                        </tr>
                        {/* Level 2: Sub-columns */}
                        <tr>
                          {data.dailyBreakdown.map((day) => (
                            <React.Fragment key={`sub-${day.date}`}>
                              <th className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-1.5 py-1 text-center text-[10px] font-medium text-[var(--color-fg-muted)]">
                                Asgn
                              </th>
                              <th className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-1.5 py-1 text-center text-[10px] font-medium text-[var(--color-fg-muted)]">
                                Att
                              </th>
                              <th className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-1.5 py-1 text-center text-[10px] font-medium text-[var(--color-fg-muted)]">
                                Solv
                              </th>
                            </React.Fragment>
                          ))}
                          <th className="border-b border-l border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-1.5 py-1 text-center text-[10px] font-medium text-[var(--color-fg-muted)]">
                            Att%
                          </th>
                          <th className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-1.5 py-1 text-center text-[10px] font-medium text-[var(--color-fg-muted)]">
                            Solv%
                          </th>
                          <th className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-1.5 py-1 text-center text-[10px] font-medium text-[var(--color-fg-muted)]">
                            Acc%
                          </th>
                          <th className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-1.5 py-1 text-center text-[10px] font-medium text-[var(--color-fg-muted)]">
                            Solved
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStudents.map((s) => {
                          const style = BAND_STYLES[s.band] ?? BAND_STYLES['Insufficient Data'];
                          return (
                            <tr key={s.studentId} className="hover:bg-[var(--color-surface-sunken)]">
                              {/* Sticky student column */}
                              <td className="sticky left-0 z-10 border-r border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs">
                                <div className="font-medium">{s.name}</div>
                                {s.email !== s.name && (
                                  <div className="text-[10px] text-[var(--color-fg-muted)]">{s.email}</div>
                                )}
                              </td>
                              {/* Daily cells */}
                              {s.days.map((day) => (
                                <React.Fragment key={day.date}>
                                  <td className="px-1.5 py-2 text-center tabular-nums text-xs">
                                    {day.assigned || <span className="text-[var(--color-fg-muted)]">—</span>}
                                  </td>
                                  <td className={`px-1.5 py-2 text-center tabular-nums text-xs ${
                                    day.assigned > 0 && day.attempted === 0 ? 'text-red-500' : ''
                                  }`}>
                                    {day.assigned > 0 ? day.attempted : <span className="text-[var(--color-fg-muted)]">—</span>}
                                  </td>
                                  <td className={`px-1.5 py-2 text-center tabular-nums text-xs ${
                                    day.solved === day.assigned && day.assigned > 0
                                      ? 'text-green-600 font-semibold'
                                      : day.solved > 0
                                        ? 'text-yellow-600'
                                        : ''
                                  }`}>
                                    {day.assigned > 0 ? day.solved : <span className="text-[var(--color-fg-muted)]">—</span>}
                                  </td>
                                </React.Fragment>
                              ))}
                              {/* Weekly aggregates */}
                              <td className="border-l border-[var(--color-border)] px-1.5 py-2 text-center tabular-nums text-xs font-medium">
                                {fmtPct(s.weekly.attemptRate)}
                              </td>
                              <td className="px-1.5 py-2 text-center tabular-nums text-xs font-medium">
                                {fmtPct(s.weekly.solveRate)}
                              </td>
                              <td className="px-1.5 py-2 text-center tabular-nums text-xs font-medium">
                                {fmtPct(s.weekly.accuracy)}
                              </td>
                              <td className="px-1.5 py-2 text-center tabular-nums text-xs font-medium">
                                {s.weekly.solved}/{s.weekly.assigned}
                              </td>
                              {/* Sticky band column */}
                              <td className="sticky right-0 z-10 border-l border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2">
                                <span
                                  className={`inline-block max-w-[140px] truncate rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}
                                  title={s.bandReason}
                                >
                                  {s.band}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

// React is needed for the Fragment usage in the multi-level header
import React from 'react';
