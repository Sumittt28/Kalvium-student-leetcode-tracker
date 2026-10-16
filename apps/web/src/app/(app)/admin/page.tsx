'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ShieldAlert, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { MentorManagement } from '@/components/mentor-management';
import { StudentAccountsPanel } from '@/components/student-accounts-panel';
import { AdminManagement } from '@/components/admin-management';
import { timeAgo } from '@/lib/utils';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  StatTile,
  TableShell,
  TableSkeleton,
  Td,
  Th,
} from '@/components/ui';

export default function AdminPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Check if user has admin access
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });
  const isAdmin = me.data?.role === 'ADMIN';
  const isSuperAdmin = me.data?.isSuperAdmin ?? false;

  // Redirect non-admins to dashboard
  useEffect(() => {
    if (me.data && !isAdmin) {
      toast.error('Access denied', { description: 'Only admins can access this page.' });
      router.replace('/');
    }
  }, [me.data, isAdmin, router]);

  const queue = useQuery({
    queryKey: ['sync', 'queue'],
    queryFn: api.queueHealth,
    refetchInterval: 10_000,
    enabled: isAdmin,
  });

  const latest = useQuery({
    queryKey: ['sync', 'latest'],
    queryFn: api.latestSync,
    refetchInterval: 10_000,
    enabled: isAdmin,
  });

  const items = useQuery({
    queryKey: ['sync', 'items', latest.data?.id],
    queryFn: () => api.syncJobItems(latest.data!.id),
    enabled: Boolean(latest.data?.id) && isAdmin,
  });

  const recompute = useMutation({
    mutationFn: () => api.recompute({}),
    onSuccess: (result) => {
      toast.success(`Recomputed ${result.days} days`, {
        description: 'Scores, streaks and leaderboards rebuilt from stored submissions.',
      });
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error('Recompute failed', { description: error.message }),
  });

  const retry = useMutation({
    mutationFn: api.retryFailedSync,
    onSuccess: (job) =>
      toast.success('Retrying failed students', {
        description: `${job.totalStudents} students queued.`,
      }),
    onError: (error: Error) => toast.error('Nothing to retry', { description: error.message }),
  });

  const failedItems = items.data?.filter((item) => item.status !== 'OK') ?? [];

  // Show loading while checking auth
  if (me.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-brand)] border-t-transparent" />
      </div>
    );
  }

  // Don't render anything if not admin (will redirect)
  if (!isAdmin) return null;

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Admin Panel</h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            Manage admins, mentors, student logins, and system health.
          </p>
        </div>
        {isSuperAdmin && (
          <Badge tone="brand" className="flex items-center gap-1">
            <ShieldAlert className="size-3.5" />
            Super Admin
          </Badge>
        )}
      </header>

      {/* Admin Management - Super Admin only for editing */}
      <AdminManagement isSuperAdmin={isSuperAdmin} />

      {/* Mentor Management */}
      <MentorManagement />

      <StudentAccountsPanel />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Queue driver"
          value={queue.data?.driver ?? '—'}
          hint={queue.data?.connected ? 'Connected' : 'Not connected'}
          tone={queue.data?.connected ? 'success' : 'warning'}
        />
        <StatTile label="Waiting" value={queue.data?.waiting ?? 0} />
        <StatTile label="Active" value={queue.data?.active ?? 0} />
        <StatTile
          label="Failed"
          value={queue.data?.failed ?? 0}
          tone={(queue.data?.failed ?? 0) > 0 ? 'danger' : 'neutral'}
        />
      </div>

      <Card>
        <CardHeader
          title="Latest sync"
          description={
            latest.data
              ? `${latest.data.mode} · triggered ${latest.data.trigger.toLowerCase()} · ${timeAgo(
                  latest.data.createdAt,
                )}`
              : undefined
          }
          action={
            <div className="flex gap-2">
              <Button onClick={() => retry.mutate()} loading={retry.isPending}>
                Retry failed
              </Button>
              <Button
                variant="primary"
                onClick={() => recompute.mutate()}
                loading={recompute.isPending}
              >
                Recalculate scores
              </Button>
            </div>
          }
        />
        {latest.data ? (
          <div className="grid gap-3 p-5 sm:grid-cols-4">
            <Metric label="Students" value={latest.data.totalStudents} />
            <Metric label="Succeeded" value={latest.data.succeededStudents} />
            <Metric label="Failed" value={latest.data.failedStudents} />
            <Metric label="New submissions" value={latest.data.newSubmissions} />
          </div>
        ) : (
          <EmptyState title="No syncs recorded yet" description="Press Sync in the top bar." />
        )}
      </Card>

      <Card>
        <CardHeader
          title="Students needing attention"
          description="Failures from the most recent sync, with the reason for each."
        />
        {items.isLoading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : failedItems.length === 0 ? (
          <EmptyState
            title="Every student synced cleanly"
            description="No usernames failed to resolve in the last run."
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>LeetCode handle</Th>
                <Th>Status</Th>
                <Th>Error</Th>
              </tr>
            </thead>
            <tbody>
              {failedItems.map((item) => (
                <tr key={item.studentId}>
                  <Td className="font-medium">{item.name}</Td>
                  <Td className="font-mono text-xs">{item.leetcodeUsername}</Td>
                  <Td>
                    <Badge tone="danger">{item.status}</Badge>
                  </Td>
                  <Td className="max-w-md truncate text-[var(--color-fg-muted)]">
                    {item.error ?? '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
