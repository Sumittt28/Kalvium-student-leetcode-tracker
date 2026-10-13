import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUrl, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

import { Roles } from '../../common/decorators';
import { CohortRecordingsService } from './cohort-recordings.service';

class CreateCohortRecordingDto {
  @IsString()
  campusCode!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  cohort!: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'sessionDate must be in YYYY-MM-DD format' })
  sessionDate!: string;

  @IsUrl()
  recordingUrl!: string;

  @IsOptional()
  @IsString()
  topic?: string;
}

class UpdateCohortRecordingDto {
  @IsOptional()
  @IsUrl()
  recordingUrl?: string;

  @IsOptional()
  @IsString()
  topic?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'sessionDate must be in YYYY-MM-DD format' })
  sessionDate?: string;
}

@ApiTags('Cohort Recordings')
@ApiBearerAuth()
@Controller('cohort-recordings')
export class CohortRecordingsController {
  constructor(private readonly service: CohortRecordingsService) {}

  @Get()
  @Roles('ADMIN', 'MENTOR', 'VIEWER')
  @ApiOperation({ summary: 'List all session recordings, optionally filtered by campus and cohort' })
  findAll(
    @Query('campusCode') campusCode?: string,
    @Query('cohort', new (class { transform(v: string) { return v ? parseInt(v, 10) : undefined; } })()) cohort?: number,
  ) {
    return this.service.findAll(campusCode, cohort);
  }

  @Post()
  @Roles('ADMIN', 'MENTOR')
  @ApiOperation({ summary: 'Add a new session recording' })
  create(@Body() dto: CreateCohortRecordingDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MENTOR')
  @ApiOperation({ summary: 'Update a session recording' })
  update(@Param('id') id: string, @Body() dto: UpdateCohortRecordingDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN', 'MENTOR')
  @ApiOperation({ summary: 'Delete a session recording' })
  async delete(@Param('id') id: string) {
    await this.service.delete(id);
    return { deleted: true };
  }
}
