/**
 * Not-WI roster rollout — the two steps the roster importer cannot do.
 *
 *   batches : create the G1 and G2 batches at a campus that has none yet.
 *   cohorts : set each listed student's `cohort` (1 = belt 4, 2 = belt 5, 3 = belt 6+).
 *
 * Students themselves are created (and reconciled) by the app's own roster importer
 * (`POST /internal/import-roster`), because it writes the campus/batch placement history the
 * reports read. This script covers only what that endpoint has no field for. Idempotent and
 * dry-run by default; the plan file holds emails, so it lives outside the repository.
 *
 *   DATABASE_URL=... npx tsx apps/api/scripts/not-wi-setup.ts --plan plan.json --phase batches
 *   DATABASE_URL=... npx tsx apps/api/scripts/not-wi-setup.ts --plan plan.json --phase cohorts --apply
 *
 * plan.json: { "campuses": ["MITADT", ...], "cohorts": { "<email>": 1|2|3 | null } }
 */

import { readFileSync } from 'node:fs';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};
const APPLY = process.argv.includes('--apply');
const BATCHES = [
  { code: 'G1', name: 'G1', description: 'Group 1 — students preparing for belts 5 and 6 (cohorts 1 and 2).', sortOrder: 1 },
  { code: 'G2', name: 'G2', description: 'Group 2 — placement readiness (cohort 3).', sortOrder: 2 },
];

async function main(): Promise<void> {
  const planPath = arg('--plan');
  const phase = arg('--phase');
  if (!planPath || (phase !== 'batches' && phase !== 'cohorts')) {
    throw new Error('Usage: --plan <plan.json> --phase batches|cohorts [--apply]');
  }
  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as {
    campuses: string[];
    cohorts: Record<string, number | null>;
  };
  console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN (pass --apply to write) ===', `phase: ${phase}\n`);

  if (phase === 'batches') {
    const campuses = await prisma.campus.findMany({ where: { code: { in: plan.campuses } } });
    if (campuses.length !== plan.campuses.length) throw new Error('A campus in the plan does not exist.');
    for (const campus of campuses) {
      const existing = await prisma.batch.findMany({ where: { campusId: campus.id } });
      for (const b of BATCHES) {
        if (existing.some((e) => e.code === b.code)) {
          console.log(`  ${campus.code}/${b.code}: already exists`);
          continue;
        }
        console.log(`  ${campus.code}/${b.code}: ${APPLY ? 'creating' : 'would create'}`);
        if (APPLY) {
          await prisma.batch.create({
            data: { campusId: campus.id, name: b.name, code: b.code, description: b.description, status: 'ACTIVE', isActive: true, sortOrder: b.sortOrder },
          });
        }
      }
    }
    return;
  }

  const emails = Object.keys(plan.cohorts);
  const students = await prisma.student.findMany({
    where: { email: { in: emails, mode: 'insensitive' } },
    select: { id: true, email: true, cohort: true, status: true },
  });
  const byEmail = new Map(students.map((s) => [s.email!.toLowerCase(), s]));
  const missing = emails.filter((e) => !byEmail.has(e.toLowerCase()));
  if (missing.length > 0) throw new Error(`${missing.length} planned student(s) are not in the tracker yet — import them first.`);
  let changes = 0;
  for (const email of emails) {
    const s = byEmail.get(email.toLowerCase())!;
    const target = plan.cohorts[email] ?? null;
    if (s.cohort === target) continue;
    changes += 1;
    if (APPLY) await prisma.student.update({ where: { id: s.id }, data: { cohort: target } });
  }
  console.log(`  ${emails.length} students in plan, ${changes} cohort change(s) ${APPLY ? 'applied' : 'would be applied'}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
