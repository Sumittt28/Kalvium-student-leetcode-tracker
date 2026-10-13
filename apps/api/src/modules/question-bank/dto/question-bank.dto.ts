import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { QUESTION_BANK_GROUPS, QUESTION_ROLES, type QuestionBankGroup } from '@dsa/shared';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class QuestionBankFiltersQueryDto {
  @ApiProperty({ enum: QUESTION_BANK_GROUPS })
  @IsIn(QUESTION_BANK_GROUPS as unknown as string[])
  group!: QuestionBankGroup;
}

export class QuestionBankSetsQueryDto extends QuestionBankFiltersQueryDto {
  @ApiPropertyOptional({ description: 'Group 1 only' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10)
  belt?: number;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(16)
  week?: number;

  @ApiPropertyOptional({ description: 'Group 1: curriculum day 1-6. Group 2: running Day # 1-80.' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(80)
  day?: number;

  @ApiPropertyOptional({ description: 'Group 2 only: Mon-Fri' })
  @IsOptional() @IsIn(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
  weekday?: string;

  @ApiPropertyOptional({ description: 'Group 1 only' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120)
  topic?: string;

  @ApiPropertyOptional({ description: 'Group 1 only' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(160)
  pattern?: string;

  @ApiPropertyOptional({ description: 'Group 2 only' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(160)
  theme?: string;

  @ApiPropertyOptional({ enum: QUESTION_ROLES, description: 'Group 2 only' })
  @IsOptional() @IsIn(QUESTION_ROLES as unknown as string[])
  role?: string;

  @ApiPropertyOptional({ enum: ['EASY', 'MEDIUM', 'HARD'] })
  @IsOptional() @IsIn(['EASY', 'MEDIUM', 'HARD'])
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';

  @ApiPropertyOptional({ description: 'Problem title, or a LeetCode number' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 12, maximum: 60 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60)
  pageSize: number = 12;
}

/** Update a single question in a set (replace the problem, or edit metadata). */
export class UpdateQuestionBankEntryDto {
  @ApiPropertyOptional({ description: 'New LeetCode URL to replace this question with', example: 'https://leetcode.com/problems/two-sum/' })
  @IsOptional() @IsUrl() @MaxLength(200)
  leetcodeUrl?: string;

  @ApiPropertyOptional({ description: 'Topic (Group 1 only)', example: 'Arrays' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120)
  topic?: string;

  @ApiPropertyOptional({ description: 'Pattern (Group 1 only)', example: 'Two Pointers' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(160)
  pattern?: string;

  @ApiPropertyOptional({ description: 'Role (Group 2 only): Warm-up, Core, or Stretch' })
  @IsOptional() @IsIn(QUESTION_ROLES as unknown as string[])
  role?: string;
}

/** Add a new question to a set. */
export class AddQuestionBankEntryDto {
  @ApiProperty({ description: 'LeetCode URL for the new question', example: 'https://leetcode.com/problems/two-sum/' })
  @IsUrl() @MaxLength(200)
  leetcodeUrl!: string;

  @ApiProperty({ description: 'Position in the set (1-4 typically, or next available)', example: 5 })
  @Type(() => Number) @IsInt() @Min(1) @Max(10)
  position!: number;

  @ApiPropertyOptional({ description: 'Topic (Group 1 only)' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120)
  topic?: string;

  @ApiPropertyOptional({ description: 'Pattern (Group 1 only)' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(160)
  pattern?: string;

  @ApiPropertyOptional({ description: 'Role (Group 2 only): Warm-up, Core, or Stretch' })
  @IsOptional() @IsIn(QUESTION_ROLES as unknown as string[])
  role?: string;
}
