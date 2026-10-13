import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../../common/decorators';
import {
  AddQuestionBankEntryDto,
  QuestionBankFiltersQueryDto,
  QuestionBankSetsQueryDto,
  UpdateQuestionBankEntryDto,
} from './dto/question-bank.dto';
import { QuestionBankService } from './question-bank.service';

/**
 * Staff-only reference data. `STUDENT` is denied by `RolesGuard`'s fail-closed default
 * (it is not listed), so a student can never browse the upcoming curriculum.
 */
@ApiTags('Question Bank')
@ApiBearerAuth()
@Controller('question-bank')
@Roles('ADMIN', 'MENTOR', 'VIEWER')
export class QuestionBankController {
  constructor(private readonly bank: QuestionBankService) {}

  @Get('filters')
  @ApiOperation({ summary: 'Filter options for one group (belts with their own weeks, topics, themes…)' })
  filters(@Query() query: QuestionBankFiltersQueryDto) {
    return this.bank.filters(query.group);
  }

  @Get('sets/:setKey')
  @ApiOperation({ summary: 'One four-question curriculum day by its key (e.g. G1-B4-W2-D3, G2-D17)' })
  set(@Param('setKey') setKey: string) {
    return this.bank.set(setKey);
  }

  @Get('sets')
  @ApiOperation({
    summary: 'Four-question curriculum days for one group, in curriculum order, Q1-Q4 within each',
  })
  sets(@Query() query: QuestionBankSetsQueryDto) {
    return this.bank.sets(query);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Write operations — ADMIN and MENTOR only
  // ─────────────────────────────────────────────────────────────────────────────

  @Patch('entries/:entryId')
  @Roles('ADMIN', 'MENTOR')
  @ApiOperation({ summary: 'Update a question (replace problem, edit topic/pattern/role)' })
  updateEntry(@Param('entryId') entryId: string, @Body() dto: UpdateQuestionBankEntryDto) {
    return this.bank.updateEntry(entryId, dto);
  }

  @Delete('entries/:entryId')
  @Roles('ADMIN', 'MENTOR')
  @ApiOperation({ summary: 'Remove a question from a set' })
  deleteEntry(@Param('entryId') entryId: string) {
    return this.bank.deleteEntry(entryId);
  }

  @Post('sets/:setKey/entries')
  @Roles('ADMIN', 'MENTOR')
  @ApiOperation({ summary: 'Add a question to a set' })
  addEntry(@Param('setKey') setKey: string, @Body() dto: AddQuestionBankEntryDto) {
    return this.bank.addEntry(setKey, dto);
  }
}
