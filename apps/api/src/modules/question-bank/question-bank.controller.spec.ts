import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { RolesGuard } from '../../common/guards/roles.guard';
import type { RequestUser } from '../../common/decorators';
import { QuestionBankController } from './question-bank.controller';

const user = (role: RequestUser['role']): RequestUser => ({
  id: 'u', email: 'u@kalvium.com', name: 'U', role, studentId: role === 'STUDENT' ? 's1' : null, mustChangePassword: false,
});

function decide(role: RequestUser['role'], handler: 'filters' | 'sets') {
  const guard = new RolesGuard(new Reflector());
  const context = {
    getHandler: () => QuestionBankController.prototype[handler],
    getClass: () => QuestionBankController,
    switchToHttp: () => ({ getRequest: () => ({ user: user(role) }) }),
  };
  return guard.canActivate(context as never);
}

describe('question bank access', () => {
  it.each(['filters', 'sets'] as const)('lets staff browse (%s)', (handler) => {
    expect(decide('ADMIN', handler)).toBe(true);
    expect(decide('MENTOR', handler)).toBe(true);
    expect(decide('VIEWER', handler)).toBe(true);
  });

  it.each(['filters', 'sets'] as const)('keeps students out of the upcoming curriculum (%s)', (handler) => {
    expect(() => decide('STUDENT', handler)).toThrow(ForbiddenException);
  });
});
