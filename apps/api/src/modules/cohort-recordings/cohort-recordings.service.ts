import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infra/prisma/prisma.service';

export interface CohortRecordingDto {
  id: string;
  campusId: string;
  campusCode: string;
  campusName: string;
  cohort: number;
  recordingUrl: string | null;
  label: string | null;
}

@Injectable()
export class CohortRecordingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Get all cohort recordings, optionally filtered by campus. */
  async findAll(campusId?: string): Promise<CohortRecordingDto[]> {
    const recordings = await this.prisma.cohortRecording.findMany({
      where: campusId ? { campusId } : undefined,
      include: { campus: { select: { id: true, code: true, name: true } } },
      orderBy: [{ campus: { sortOrder: 'asc' } }, { cohort: 'asc' }],
    });

    return recordings.map((r) => ({
      id: r.id,
      campusId: r.campusId,
      campusCode: r.campus.code,
      campusName: r.campus.name,
      cohort: r.cohort,
      recordingUrl: r.recordingUrl,
      label: r.label,
    }));
  }

  /** Get recordings for a specific campus. */
  async findByCampus(campusCode: string): Promise<CohortRecordingDto[]> {
    const campus = await this.prisma.campus.findUnique({ where: { code: campusCode } });
    if (!campus) return [];
    return this.findAll(campus.id);
  }

  /** Upsert a cohort recording (create or update). */
  async upsert(
    campusCode: string,
    cohort: number,
    data: { recordingUrl?: string; label?: string },
  ): Promise<CohortRecordingDto> {
    const campus = await this.prisma.campus.findUnique({ where: { code: campusCode } });
    if (!campus) throw new Error(`Campus ${campusCode} not found`);

    const recording = await this.prisma.cohortRecording.upsert({
      where: { campusId_cohort: { campusId: campus.id, cohort } },
      create: {
        campusId: campus.id,
        cohort,
        recordingUrl: data.recordingUrl ?? null,
        label: data.label ?? null,
      },
      update: {
        recordingUrl: data.recordingUrl ?? null,
        label: data.label ?? null,
      },
      include: { campus: { select: { id: true, code: true, name: true } } },
    });

    return {
      id: recording.id,
      campusId: recording.campusId,
      campusCode: recording.campus.code,
      campusName: recording.campus.name,
      cohort: recording.cohort,
      recordingUrl: recording.recordingUrl,
      label: recording.label,
    };
  }

  /** Delete a cohort recording. */
  async delete(id: string): Promise<void> {
    await this.prisma.cohortRecording.delete({ where: { id } });
  }
}
