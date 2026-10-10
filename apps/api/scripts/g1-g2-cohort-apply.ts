/**
 * G1 / G2 cohort re-placement — apply (and undo) a reviewed student plan.
 *
 * What it does, from a plan file produced and reviewed offline:
 *   1. Creates the new batches (G1, G2 at VELS and ALU; one "SPE 2024-28" batch at SRM).
 *   2. Retires — never deletes — the old "Foundation Level" / "Intermediate Level" batches
 *      at those campuses (status ARCHIVED, isActive false). Their assignments, history and
 *      every already-scored day are untouched.
 *   3. Per student: sets cohort, moves batch, reactivates archived students, and records an
 *      institutional email where the plan supplies one.
 *
 * Batch moves are written exactly the way `BatchesService.moveStudent` writes them — the
 * `Student.batchId` update plus one `StudentBatchHistory` row — with an explicit effective
 * day (default: the Monday the plan starts). Placement for any earlier day still resolves
 * from the earlier rows, so nothing already scored is rewritten.
 *
 * The plan file holds names and emails, so it lives outside the repository.
 *
 *   DATABASE_URL=... npx tsx apps/api/scripts/g1-g2-cohort-apply.ts --plan plan.json             # dry run
 *   DATABASE_URL=... npx tsx apps/api/scripts/g1-g2-cohort-apply.ts --plan plan.json --apply     # write
 *   DATABASE_URL=... npx tsx apps/api/scripts/g1-g2-cohort-apply.ts --undo applied-<stamp>.json  # revert
 *
 * `--apply` first writes `snapshot-before-<stamp>.json` and, once committed,
 * `applied-<stamp>.json`; `--undo` needs the latter. Take a pg_dump first as well.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};
const APPLY = process.argv.includes('--apply');
const EFFECTIVE = arg('--effective') ?? '2026-10-12';
const MARKER = 'G1/G2 cohort re-placement';

interface PlanItem {
  studentId: string;
  campus: string; // tool campus code
  action: 'PLACE' | 'UNBATCH' | 'NONE';
  targetBatch: 'G1' | 'G2' | 'SPE' | null;
  cohort: number | null;
  setEmail: string | null;
  reactivate: boolean;
}

const NEW_BATCHES: Record<string, { code: string; name: string; description: string; sortOrder: number }[]> = {
  VELS: [
    { code: 'G1', name: 'G1', description: 'Group 1 — students preparing for belts 5 and 6 (cohorts 1 and 2).', sortOrder: 1 },
    { code: 'G2', name: 'G2', description: 'Group 2 — placement readiness (cohort 3).', sortOrder: 2 },
  ],
  ALLIANCE: [
    { code: 'G1', name: 'G1', description: 'Group 1 — students preparing for belts 5 and 6 (cohorts 1 and 2).', sortOrder: 1 },
    { code: 'G2', name: 'G2', description: 'Group 2 — placement readiness (cohort 3).', sortOrder: 2 },
  ],
  SRM: [{ code: 'SPE', name: 'SPE 2024-28', description: 'All SRM students — a single batch, no belt split.', sortOrder: 1 }],
};
const RETIRE_NAMES = ['Foundation Level', 'Intermediate Level'];

async function undo(appliedPath: string): Promise<void> {
  const applied = JSON.parse(readFileSync(appliedPath, 'utf8'));
  const before = JSON.parse(readFileSync(applied.snapshotPath, 'utf8'));
  console.log(`=== UNDO (${appliedPath}) ===`);
  await prisma.$transaction(
    async (tx) => {
      await tx.studentBatchHistory.deleteMany({ where: { id: { in: applied.createdHistoryIds } } });
      for (const s of before.students) {
        await tx.student.update({
          where: { id: s.id },
          data: {
            batchId: s.batchId,
            cohort: s.cohort,
            status: s.status,
            archivedAt: s.archivedAt ? new Date(s.archivedAt) : null,
            archivedReason: s.archivedReason,
            email: s.email,
          },
        });
      }
      for (const b of before.batches) {
        await tx.batch.update({ where: { id: b.id }, data: { status: b.status, isActive: b.isActive } });
      }
      await tx.batch.deleteMany({ where: { id: { in: applied.createdBatchIds } } });
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
  console.log(
    `Restored ${before.students.length} students, ${before.batches.length} batches; removed ` +
      `${applied.createdHistoryIds.length} history rows and ${applied.createdBatchIds.length} new batches.`,
  );
}

async function main(): Promise<void> {
  const undoPath = arg('--undo');
  if (undoPath) return undo(undoPath);

  const planPath = arg('--plan');
  if (!planPath) throw new Error('Pass --plan <plan.json> (or --undo <applied.json>).');
  const plan: PlanItem[] = JSON.parse(readFileSync(planPath, 'utf8'));
  console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN (pass --apply to write) ===');
  console.log(`plan: ${plan.length} students · effective ${EFFECTIVE}\n`);

  // ---- integrity before anything is touched ---------------------------------
  if (new Set(plan.map((p) => p.studentId)).size !== plan.length) throw new Error('Duplicate student in plan.');
  const students = await prisma.student.findMany({
    where: { id: { in: plan.map((p) => p.studentId) } },
    select: {
      id: true, campusId: true, batchId: true, cohort: true, status: true,
      archivedAt: true, archivedReason: true, email: true, campus: { select: { code: true } },
    },
  });
  if (students.length !== plan.length) throw new Error(`Plan names ${plan.length} students, database has ${students.length}.`);
  const byId = new Map(students.map((s) => [s.id, s]));
  for (const p of plan) {
    if (byId.get(p.studentId)!.campus?.code !== p.campus) throw new Error(`Campus mismatch for ${p.studentId}.`);
  }

  const campuses = await prisma.campus.findMany({ where: { code: { in: Object.keys(NEW_BATCHES) } } });
  const existingBatches = await prisma.batch.findMany({ where: { campusId: { in: campuses.map((c) => c.id) } } });

  const retire = existingBatches.filter((b) => RETIRE_NAMES.includes(b.name) && b.status === 'ACTIVE');
  const batchKey = (campusId: string, code: string) =>
    existingBatches.find((b) => b.campusId === campusId && b.code === code);
  const toCreate = campuses.flatMap((c) =>
    NEW_BATCHES[c.code]!.filter((nb) => !batchKey(c.id, nb.code)).map((nb) => ({ campus: c, ...nb })),
  );

  console.log(`Batches to create: ${toCreate.map((b) => `${b.campus.code}/${b.code}`).join(', ') || 'none'}`);
  console.log(
    `Batches to retire: ${retire.map((b) => `${campuses.find((c) => c.id === b.campusId)!.code}/${b.name}`).join(', ') || 'none'}`,
  );

  // ---- what each student will get -------------------------------------------
  const newBatchIds = new Map<string, string>(); // `${campusCode}/${code}` -> id (existing or to be created)
  for (const c of campuses) {
    for (const nb of NEW_BATCHES[c.code]!) {
      newBatchIds.set(`${c.code}/${nb.code}`, batchKey(c.id, nb.code)?.id ?? randomUUID());
    }
  }
  let moves = 0, redundant = 0, reactivations = 0, cohortChanges = 0, emails = 0;
  const historyRows: { id: string; studentId: string; fromBatchId: string | null; toBatchId: string | null }[] = [];
  const groups = new Map<string, { ids: string[]; data: Record<string, unknown> }>();
  for (const p of plan) {
    const s = byId.get(p.studentId)!;
    const target =
      p.action === 'PLACE' ? newBatchIds.get(`${p.campus}/${p.targetBatch}`)! : p.action === 'UNBATCH' ? null : s.batchId;
    if (p.action !== 'NONE' && s.batchId !== target) {
      moves += 1;
      historyRows.push({ id: randomUUID(), studentId: s.id, fromBatchId: s.batchId, toBatchId: target });
    } else if (p.action !== 'NONE') redundant += 1;
    if (p.reactivate) reactivations += 1;
    if (p.cohort !== s.cohort && p.action !== 'NONE') cohortChanges += 1;
    if (p.setEmail) emails += 1;
    if (p.action === 'NONE') continue; // archived, belt<=3: leave exactly as it is
    const data: Record<string, unknown> = { batchId: target, cohort: p.cohort };
    if (p.reactivate) Object.assign(data, { status: 'ACTIVE', archivedAt: null, archivedReason: null });
    const key = JSON.stringify(data);
    const g = groups.get(key) ?? { ids: [], data };
    g.ids.push(s.id);
    groups.set(key, g);
  }
  console.log(`\nStudents in plan: ${plan.length}`);
  console.log(`  batch moves: ${moves} (already in place: ${redundant})`);
  console.log(`  reactivated: ${reactivations} · cohort changes: ${cohortChanges} · emails recorded: ${emails}`);
  console.log(`  left untouched (archived, belt<=3): ${plan.filter((p) => p.action === 'NONE').length}`);

  if (!APPLY) {
    console.log('\nDry run only. Nothing was written.');
    return;
  }

  // ---- snapshot, then one transaction ---------------------------------------
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const dir = dirname(planPath);
  const snapshotPath = join(dir, `snapshot-before-${stamp}.json`);
  writeFileSync(
    snapshotPath,
    JSON.stringify(
      {
        takenAt: new Date().toISOString(),
        students: students.map((s) => ({ ...s, campus: undefined })),
        batches: existingBatches.map((b) => ({ id: b.id, status: b.status, isActive: b.isActive })),
      },
      null,
      1,
    ),
  );
  console.log(`\nSnapshot written: ${snapshotPath}`);

  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });
  const createdBatchIds: string[] = [];

  await prisma.$transaction(
    async (tx) => {
      for (const b of toCreate) {
        const id = newBatchIds.get(`${b.campus.code}/${b.code}`)!;
        await tx.batch.create({
          data: {
            id, campusId: b.campus.id, name: b.name, code: b.code, description: b.description,
            status: 'ACTIVE', isActive: true, sortOrder: b.sortOrder,
          },
        });
        createdBatchIds.push(id);
      }
      for (const b of retire) {
        await tx.batch.update({ where: { id: b.id }, data: { status: 'ARCHIVED', isActive: false } });
      }
      for (const g of groups.values()) {
        await tx.student.updateMany({ where: { id: { in: g.ids } }, data: g.data as never });
      }
      for (const p of plan) {
        if (p.setEmail) await tx.student.update({ where: { id: p.studentId }, data: { email: p.setEmail } });
      }
      await tx.studentBatchHistory.createMany({
        data: historyRows.map((h) => ({
          ...h,
          effectiveFromDayKey: EFFECTIVE,
          reason: MARKER,
          source: 'MIGRATION' as const,
          changedById: admin?.id ?? null,
          changedByName: admin?.name ?? MARKER,
        })),
      });
      await tx.auditLog.create({
        data: {
          actorId: admin?.id ?? null,
          actorName: admin?.name ?? MARKER,
          action: 'BATCH_COHORT_REPLACEMENT',
          entityType: 'Batch',
          summary: `${MARKER}: ${plan.length} students, ${moves} batch moves, ${reactivations} reactivated; Foundation/Intermediate retired`,
          metadata: { effective: EFFECTIVE, snapshot: snapshotPath },
        },
      });
    },
    { timeout: 120_000, maxWait: 30_000 },
  );

  const appliedPath = join(dir, `applied-${stamp}.json`);
  writeFileSync(
    appliedPath,
    JSON.stringify({ snapshotPath, createdBatchIds, createdHistoryIds: historyRows.map((h) => h.id), effective: EFFECTIVE }, null, 1),
  );
  console.log(`Committed. Undo file: ${appliedPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
