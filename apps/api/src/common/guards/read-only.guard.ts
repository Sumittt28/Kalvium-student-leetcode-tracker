import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ALLOWS_READ_ONLY_WRITE_KEY, IS_PUBLIC_KEY, type RequestUser } from '../decorators';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Roles that may look but never change programme data. ADMIN (incl. super admin) is exempt. */
const VIEW_ONLY_ROLES = new Set(['MENTOR', 'VIEWER']);

/**
 * View-only access for the campus team.
 *
 * A MENTOR or VIEWER can read everything they could already read, but any request that is
 * not a read (POST, PUT, PATCH, DELETE) is refused unless the route opts in with
 * `@AllowsReadOnlyWrite()`.
 *
 * Doing this in one guard, keyed on the HTTP method, rather than editing every controller
 * is deliberate: a write endpoint added next year is closed to view-only accounts by
 * default, instead of being open until somebody remembers to restrict it. It sits after
 * `RolesGuard`, so role checks and error messages for other cases are unchanged, and it
 * never touches ADMIN or STUDENT (students have their own guard and portal).
 */
@Injectable()
export class ReadOnlyGuard implements CanActivate {
  private readonly logger = new Logger(ReadOnlyGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{ user?: RequestUser; method?: string }>();
    const user = request.user;
    if (!user || !VIEW_ONLY_ROLES.has(user.role)) return true;
    if (SAFE_METHODS.has((request.method ?? 'GET').toUpperCase())) return true;

    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOWS_READ_ONLY_WRITE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed) return true;

    const handler = `${context.getClass().name}.${context.getHandler().name}`;
    this.logger.warn(`View-only denied: ${user.role} "${user.email}" -> ${request.method} ${handler}`);
    throw new ForbiddenException('Your account has view-only access. Contact the Coding Hours team to make changes.');
  }
}
