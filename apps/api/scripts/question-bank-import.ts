/**
 * Coding Hours Question Bank — one-time, repeatable import.
 *
 * Reads the committed source (`prisma/question-bank/*.json`), validates it, and writes the
 * `Problem` rows and `QuestionBankEntry` curriculum occurrences it describes.
 *
 * Why this is a script and not a request: assigning a day from the bank must never wait on
 * LeetCode. So the lookups happen here, once, for the problems the database does not
 * already hold — and the metadata stored is the same set the normal assignment path stores
 * (`fetchProblemMetadata`), so a bank-created `Problem` is indistinguishable from one a
 * mentor's pasted link would have created.
 *
 * Safe to re-run:
 *   - Existing `Problem` rows are never modified (their metadata, and any history hanging
 *     off them, is left alone) and are not re-fetched.
 *   - Entries are keyed on (setKey, position); a re-run updates in place and never
 *     duplicates. Nothing is ever deleted.
 *   - Any validation issue aborts before a single write.
 *
 * Run with:
 *   DATABASE_URL=... npx tsx apps/api/scripts/question-bank-import.ts            # dry run
 *   DATABASE_URL=... npx tsx apps/api/scripts/question-bank-import.ts --apply     # write
 *
 * Take a backup first against production:
 *   pg_dump -Fc "$DATABASE_URL" > tmp/backups/pre-question-bank-import-<stamp>.dump
 */

import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';

import { loadConfiguration } from '../src/config/configuration';
import { isProviderError, ProviderProblemNotFoundError } from '../src/modules/providers/provider.errors';
import { LeetCodeProvider } from '../src/modules/providers/leetcode/leetcode.provider';
import {
  loadQuestionBankSource,
  prepareQuestionBank,
  type EntrySeed,
} from '../src/modules/question-bank/question-bank-source';

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

function sameEntry(
  existing: Record<string, unknown>,
  seed: EntrySeed,
  problemId: string,
): boolean {
  return (
    existing.problemId === problemId &&
    existing.group === seed.group &&
    existing.belt === seed.belt &&
    existing.week === seed.week &&
    existing.day === seed.day &&
    existing.weekday === seed.weekday &&
    existing.leetcodeNumber === seed.leetcodeNumber &&
    existing.sourceTitle === seed.sourceTitle &&
    existing.sourceDifficulty === seed.sourceDifficulty &&
    existing.topic === seed.topic &&
    existing.pattern === seed.pattern &&
    existing.dayFocus === seed.dayFocus &&
    existing.dailyTheme === seed.dailyTheme &&
    existing.role === seed.role &&
    existing.usage === seed.usage &&
    existing.sourceRow === seed.sourceRow
  );
}

async function main(): Promise<void> {
  console.log(APPLY ? '=== APPLYING ===\n' : '=== DRY RUN (pass --apply to write) ===\n');

  const plan = prepareQuestionBank(loadQuestionBankSource());

  console.log('Source validation');
  console.log(`  Group 1: ${plan.counts.group1Rows} rows in ${plan.counts.group1Sets} four-question days`);
  console.log(`  Group 2: ${plan.counts.group2Rows} rows in ${plan.counts.group2Sets} four-question days`);
  console.log(`  Distinct LeetCode problems: ${plan.problems.length}`);
  for (const note of plan.notes) console.log(`  note: ${note}`);
  for (const fix of plan.appliedCorrections) {
    console.log(`  CORRECTION applied: #${fix.leetcodeNumber} (${fix.group}) ${fix.from} -> ${fix.to}`);
  }
  if (plan.issues.length > 0) {
    console.log(`\n${plan.issues.length} validation issue(s) — nothing will be written:`);
    for (const issue of plan.issues) {
      console.log(`  [${issue.group}${issue.sourceRow ? ` row ${issue.sourceRow}` : ''}] ${issue.code}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  // --- What the database already holds -----------------------------------------
  const slugs = plan.problems.map((p) => p.titleSlug);
  const existingProblems = await prisma.problem.findMany({
    where: { titleSlug: { in: slugs } },
    select: { id: true, titleSlug: true, questionFrontendId: true },
  });
  const problemIdBySlug = new Map(existingProblems.map((p) => [p.titleSlug, p.id]));
  const toCreate = plan.problems.filter((p) => !problemIdBySlug.has(p.titleSlug));

  // A pre-existing row under the same slug but another LeetCode number is a data problem
  // worth seeing; it is reported, never overwritten.
  for (const p of plan.problems) {
    const row = existingProblems.find((e) => e.titleSlug === p.titleSlug);
    if (row?.questionFrontendId && row.questionFrontendId !== String(p.leetcodeNumber)) {
      console.log(`  WARNING: ${p.titleSlug} exists as #${row.questionFrontendId}, source says #${p.leetcodeNumber}`);
    }
  }

  const existingEntries = await prisma.questionBankEntry.findMany();
  const entryByKey = new Map(existingEntries.map((e) => [`${e.setKey}#${e.position}`, e]));

  console.log('\nDatabase');
  console.log(`  Problems already present (reused, untouched): ${plan.problems.length - toCreate.length}`);
  console.log(`  Problems to create (metadata fetched once):   ${toCreate.length}`);
  console.log(`  Question-bank entries already present:        ${existingEntries.length}`);

  if (!APPLY) {
    let wouldCreate = 0;
    let wouldUpdate = 0;
    let unchanged = 0;
    for (const seed of plan.entries) {
      const hit = entryByKey.get(`${seed.setKey}#${seed.position}`);
      const pid = problemIdBySlug.get(seed.titleSlug) ?? 'NEW';
      if (!hit) wouldCreate += 1;
      else if (sameEntry(hit as unknown as Record<string, unknown>, seed, pid)) unchanged += 1;
      else wouldUpdate += 1;
    }
    console.log(`  Entries: ${wouldCreate} would be created, ${wouldUpdate} updated, ${unchanged} unchanged`);
    console.log('\nDry run only. Nothing was written.');
    return;
  }

  // --- 1. Problems the database does not hold yet -------------------------------
  const config = loadConfiguration();
  const provider = new LeetCodeProvider(config);
  const failures: string[] = [];
  let created = 0;

  for (const seed of toCreate) {
    try {
      const meta = await provider.fetchProblemMetadata(seed.titleSlug);
      const row = await prisma.problem.upsert({
        where: { titleSlug: seed.titleSlug },
        create: {
          titleSlug: meta.titleSlug,
          title: meta.title,
          questionId: meta.questionId,
          questionFrontendId: meta.questionFrontendId,
          difficulty: meta.difficulty,
          acceptanceRate: meta.acceptanceRate,
          isPaidOnly: meta.isPaidOnly,
          topicTags: meta.topicTags,
          companyTags: meta.companyTags,
          url: meta.url,
          metadataFetchedAt: new Date(),
        },
        update: {},
      });
      problemIdBySlug.set(seed.titleSlug, row.id);
      created += 1;
      if (created % 50 === 0) console.log(`  ... ${created}/${toCreate.length} problems created`);
    } catch (error) {
      const why =
        error instanceof ProviderProblemNotFoundError
          ? 'no such problem on LeetCode'
          : isProviderError(error)
            ? error.message
            : String(error);
      failures.push(`${seed.titleSlug}: ${why}`);
    }
  }
  console.log(`  Problems created: ${created}`);

  if (failures.length > 0) {
    // Entries need every problem; writing a partial bank would hand out days with holes.
    console.log(`\n${failures.length} problem(s) could not be resolved — entries NOT written:`);
    failures.forEach((f) => console.log(`  ${f}`));
    console.log('Re-run to retry; problems already created are reused.');
    process.exitCode = 1;
    return;
  }

  // --- 2. Entries, atomically ---------------------------------------------------
  let createdEntries = 0;
  let updatedEntries = 0;
  let unchangedEntries = 0;
  await prisma.$transaction(
    async (tx) => {
      for (const seed of plan.entries) {
        const problemId = problemIdBySlug.get(seed.titleSlug);
        if (!problemId) throw new Error(`No problem id for ${seed.titleSlug}`);
        const { titleSlug: _slug, ...fields } = seed;
        const hit = entryByKey.get(`${seed.setKey}#${seed.position}`);
        if (!hit) {
          await tx.questionBankEntry.create({ data: { ...fields, problemId } });
          createdEntries += 1;
        } else if (sameEntry(hit as unknown as Record<string, unknown>, seed, problemId)) {
          unchangedEntries += 1;
        } else {
          await tx.questionBankEntry.update({ where: { id: hit.id }, data: { ...fields, problemId } });
          updatedEntries += 1;
        }
      }
    },
    { timeout: 120_000, maxWait: 30_000 },
  );

  const total = await prisma.questionBankEntry.count();
  console.log(`\n  Entries: ${createdEntries} created, ${updatedEntries} updated, ${unchangedEntries} unchanged`);
  console.log(`  question_bank_entries now holds ${total} rows (expected ${plan.entries.length}).`);
  if (total !== plan.entries.length) {
    console.log('  WARNING: row count differs from the source — investigate before relying on the bank.');
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
