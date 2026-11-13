import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { QuestionBankSetsQueryDto } from './question-bank.dto';

const errorsFor = async (query: Record<string, string>) =>
  validate(plainToInstance(QuestionBankSetsQueryDto, { group: 'GROUP_2', ...query }));

describe('QuestionBankSetsQueryDto - extension weeks and days', () => {
  it('accepts the Group 2 extension weeks (17, 18) and their running days (87-93)', async () => {
    expect(await errorsFor({ week: '17' })).toHaveLength(0);
    expect(await errorsFor({ week: '18' })).toHaveLength(0);
    expect(await errorsFor({ day: '87' })).toHaveLength(0);
    expect(await errorsFor({ day: '93' })).toHaveLength(0);
  });

  it('still accepts every normal week and day', async () => {
    expect(await errorsFor({ week: '1', day: '1' })).toHaveLength(0);
    expect(await errorsFor({ week: '16', day: '80' })).toHaveLength(0);
  });

  it('still rejects nonsense', async () => {
    expect(await errorsFor({ week: '0' })).not.toHaveLength(0);
    expect(await errorsFor({ week: '99' })).not.toHaveLength(0);
    expect(await errorsFor({ day: '500' })).not.toHaveLength(0);
  });
});
