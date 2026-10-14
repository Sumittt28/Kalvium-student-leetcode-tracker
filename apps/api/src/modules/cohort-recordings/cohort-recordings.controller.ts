import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUrl, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

import { Roles } from '../../common/decorators';
import { CohortRecordingsService } from './cohort-recordings.service';

class CreateSessionRecordingDto {
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

class UpdateSessionRecordingDto {
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

@ApiTags('Session Recordings')
@ApiBearerAuth()
@Controller('session-recordings')
export class CohortRecordingsController {
  constructor(private readonly service: CohortRecordingsService) {}

  @Get()
  @Roles('ADMIN', 'MENTOR', 'VIEWER')
  @ApiOperation({ summary: 'List all session recordings, optionally filtered by cohort' })
  findAll(
    @Query('cohort') cohortStr?: string,
  ) {
    const cohort = cohortStr ? parseInt(cohortStr, 10) : undefined;
    return this.service.findAll(cohort);
  }

  @Post()
  @Roles('ADMIN', 'MENTOR')
  @ApiOperation({ summary: 'Add a new session recording' })
  create(@Body() dto: CreateSessionRecordingDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MENTOR')
  @ApiOperation({ summary: 'Update a session recording' })
  update(@Param('id') id: string, @Body() dto: UpdateSessionRecordingDto) {
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
