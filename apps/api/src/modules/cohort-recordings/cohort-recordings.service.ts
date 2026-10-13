import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../infra/prisma/prisma.service';

export interface CohortRecordingDto {
  id: string;
  campusId: string;
  campusCode: string;
  campusName: string;
  cohort: number;
  sessionDate: string;
  recordingUrl: string;
  topic: string | null;
}

@Injectable()
export class CohortRecordingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Get all cohort recordings, optionally filtered by campus and/or cohort. */
  async findAll(campusCode?: string, cohort?: number): Promise<CohortRecordingDto[]> {
    const where: { campusId?: string; cohort?: number } = {};
    
    if (campusCode) {
      const campus = await this.prisma.campus.findUnique({ where: { code: campusCode } });
      if (!campus) return [];
      where.campusId = campus.id;
    }
    
    if (cohort !== undefined) {
      where.cohort = cohort;
    }

    const recordings = await this.prisma.cohortRecording.findMany({
      where,
      include: { campus: { select: { id: true, code: true, name: true } } },
      orderBy: [{ campus: { sortOrder: 'asc' } }, { cohort: 'asc' }, { sessionDate: 'desc' }],
    });

    return recordings.map((r) => ({
      id: r.id,
      campusId: r.campusId,
      campusCode: r.campus.code,
      campusName: r.campus.name,
      cohort: r.cohort,
      sessionDate: r.sessionDate,
      recordingUrl: r.recordingUrl,
      topic: r.topic,
    }));
  }

  /** Create a new session recording. */
  async create(data: {
    campusCode: string;
    cohort: number;
    sessionDate: string;
    recordingUrl: string;
    topic?: string;
  }): Promise<CohortRecordingDto> {
    const campus = await this.prisma.campus.findUnique({ where: { code: data.campusCode } });
    if (!campus) throw new NotFoundException(`Campus ${data.campusCode} not found`);

    const recording = await this.prisma.cohortRecording.create({
      data: {
        campusId: campus.id,
        cohort: data.cohort,
        sessionDate: data.sessionDate,
        recordingUrl: data.recordingUrl,
        topic: data.topic ?? null,
      },
      include: { campus: { select: { id: true, code: true, name: true } } },
    });

    return {
      id: recording.id,
      campusId: recording.campusId,
      campusCode: recording.campus.code,
      campusName: recording.campus.name,
      cohort: recording.cohort,
      sessionDate: recording.sessionDate,
      recordingUrl: recording.recordingUrl,
      topic: recording.topic,
    };
  }

  /** Update an existing recording. */
  async update(
    id: string,
    data: { recordingUrl?: string; topic?: string; sessionDate?: string },
  ): Promise<CohortRecordingDto> {
    const recording = await this.prisma.cohortRecording.update({
      where: { id },
      data: {
        ...(data.recordingUrl !== undefined ? { recordingUrl: data.recordingUrl } : {}),
        ...(data.topic !== undefined ? { topic: data.topic } : {}),
        ...(data.sessionDate !== undefined ? { sessionDate: data.sessionDate } : {}),
      },
      include: { campus: { select: { id: true, code: true, name: true } } },
    });

    return {
      id: recording.id,
      campusId: recording.campusId,
      campusCode: recording.campus.code,
      campusName: recording.campus.name,
      cohort: recording.cohort,
      sessionDate: recording.sessionDate,
      recordingUrl: recording.recordingUrl,
      topic: recording.topic,
    };
  }

  /** Delete a cohort recording. */
  async delete(id: string): Promise<void> {
    await this.prisma.cohortRecording.delete({ where: { id } });
  }
}
