import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ReadOnlyGuard } from './read-only.guard';
import { ALLOWS_READ_ONLY_WRITE_KEY, IS_PUBLIC_KEY, type RequestUser } from '../decorators';

function run(opts: { role?: string; method: string; allowed?: boolean; isPublic?: boolean }) {
  const meta = new Map<string, unknown>([
    [ALLOWS_READ_ONLY_WRITE_KEY, opts.allowed],
    [IS_PUBLIC_KEY, opts.isPublic],
  ]);
  const guard = new ReadOnlyGuard({ getAllAndOverride: vi.fn((k: string) => meta.get(k)) } as never);
  const user = opts.role ? ({ id: 'u', email: 'x@kalvium.com', role: opts.role } as RequestUser) : undefined;
  const ctx = {
    getHandler: () => ({ name: 'h' }),
    getClass: () => ({ name: 'C' }),
    switchToHttp: () => ({ getRequest: () => ({ user, method: opts.method }) }),
  };
  return () => guard.canActivate(ctx as never);
}

describe('ReadOnlyGuard', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])('lets a mentor read with %s', (method) => {
    expect(run({ role: 'MENTOR', method })()).toBe(true);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('refuses a mentor %s', (method) => {
    expect(run({ role: 'MENTOR', method })).toThrow(ForbiddenException);
  });

  it('refuses a viewer write too', () => {
    expect(run({ role: 'VIEWER', method: 'POST' })).toThrow(ForbiddenException);
  });

  it('lets a mentor use a route that opts in (change password, sync)', () => {
    expect(run({ role: 'MENTOR', method: 'POST', allowed: true })()).toBe(true);
  });

  it('never restricts an admin', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(run({ role: 'ADMIN', method })()).toBe(true);
    }
  });

  it('leaves students to their own guard', () => {
    expect(run({ role: 'STUDENT', method: 'POST' })()).toBe(true);
  });

  it('ignores public routes (login, refresh)', () => {
    expect(run({ method: 'POST', isPublic: true })()).toBe(true);
  });
});
