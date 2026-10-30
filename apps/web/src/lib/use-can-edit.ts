'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

/**
 * Whether the signed-in user may change programme data.
 *
 * Only admins can; mentors (the campus team) are view-only. The API enforces this on every
 * write (`ReadOnlyGuard`) - this hook only decides what to *show*, so a view-only user is not
 * offered buttons that would answer 403. It is false while the profile is still loading, which
 * means controls appear a moment later for admins rather than flashing for mentors.
 */
export function useCanEdit(): boolean {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });
  return me.data?.role === 'ADMIN';
}
