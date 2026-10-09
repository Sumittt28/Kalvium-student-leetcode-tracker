import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../../common/decorators';
import { QuestionBankFiltersQueryDto, QuestionBankSetsQueryDto } from './dto/question-bank.dto';
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
}
