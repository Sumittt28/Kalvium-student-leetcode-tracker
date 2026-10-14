import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../infra/prisma/prisma.service';

export interface SessionRecordingDto {
  id: string;
  cohort: number;
  sessionDate: string;
  recordingUrl: string;
  topic: string | null;
}

@Injectable()
export class CohortRecordingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Get all session recordings, optionally filtered by cohort. */
  async findAll(cohort?: number): Promise<SessionRecordingDto[]> {
    const recordings = await this.prisma.sessionRecording.findMany({
      where: cohort !== undefined ? { cohort } : undefined,
      orderBy: [{ cohort: 'asc' }, { sessionDate: 'desc' }],
    });

    return recordings.map((r) => ({
      id: r.id,
      cohort: r.cohort,
      sessionDate: r.sessionDate,
      recordingUrl: r.recordingUrl,
      topic: r.topic,
    }));
  }

  /** Create a new session recording. */
  async create(data: {
    cohort: number;
    sessionDate: string;
    recordingUrl: string;
    topic?: string;
  }): Promise<SessionRecordingDto> {
    const recording = await this.prisma.sessionRecording.create({
      data: {
        cohort: data.cohort,
        sessionDate: data.sessionDate,
        recordingUrl: data.recordingUrl,
        topic: data.topic ?? null,
      },
    });

    return {
      id: recording.id,
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
  ): Promise<SessionRecordingDto> {
    const recording = await this.prisma.sessionRecording.update({
      where: { id },
      data: {
        ...(data.recordingUrl !== undefined ? { recordingUrl: data.recordingUrl } : {}),
        ...(data.topic !== undefined ? { topic: data.topic } : {}),
        ...(data.sessionDate !== undefined ? { sessionDate: data.sessionDate } : {}),
      },
    });

    return {
      id: recording.id,
      cohort: recording.cohort,
      sessionDate: recording.sessionDate,
      recordingUrl: recording.recordingUrl,
      topic: recording.topic,
    };
  }

  /** Delete a session recording. */
  async delete(id: string): Promise<void> {
    await this.prisma.sessionRecording.delete({ where: { id } });
  }
}
