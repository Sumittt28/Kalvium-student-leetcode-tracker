import { Module } from '@nestjs/common';

import { CohortRecordingsController } from './cohort-recordings.controller';
import { CohortRecordingsService } from './cohort-recordings.service';

@Module({
  controllers: [CohortRecordingsController],
  providers: [CohortRecordingsService],
  exports: [CohortRecordingsService],
})
export class CohortRecordingsModule {}
