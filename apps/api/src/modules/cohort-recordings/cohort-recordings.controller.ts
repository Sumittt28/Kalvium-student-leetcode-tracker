import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

import { Roles } from '../../common/decorators';
import { CohortRecordingsService } from './cohort-recordings.service';

class UpsertCohortRecordingDto {
  @IsString()
  campusCode!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  cohort!: number;

  @IsOptional()
  @IsUrl()
  recordingUrl?: string;

  @IsOptional()
  @IsString()
  label?: string;
}

@ApiTags('Cohort Recordings')
@ApiBearerAuth()
@Controller('cohort-recordings')
export class CohortRecordingsController {
  constructor(private readonly service: CohortRecordingsService) {}

  @Get()
  @Roles('ADMIN', 'MENTOR', 'VIEWER')
  @ApiOperation({ summary: 'List all cohort recordings, optionally filtered by campus' })
  findAll(@Query('campusCode') campusCode?: string) {
    if (campusCode) {
      return this.service.findByCampus(campusCode);
    }
    return this.service.findAll();
  }

  @Put()
  @Roles('ADMIN', 'MENTOR')
  @ApiOperation({ summary: 'Create or update a cohort recording' })
  upsert(@Body() dto: UpsertCohortRecordingDto) {
    return this.service.upsert(dto.campusCode, dto.cohort, {
      recordingUrl: dto.recordingUrl,
      label: dto.label,
    });
  }

  @Delete(':id')
  @Roles('ADMIN', 'MENTOR')
  @ApiOperation({ summary: 'Delete a cohort recording' })
  async delete(@Param('id') id: string) {
    await this.service.delete(id);
    return { deleted: true };
  }
}
