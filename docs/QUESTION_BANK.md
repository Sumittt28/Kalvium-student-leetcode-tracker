# Coding Hours Question Bank

The curated Group 1 and Group 2 curricula as browsable reference data, with a hand-off into
the existing Assignments form. **It reads nothing about students and creates nothing by
itself.** Progress is still measured only by `Assignment` + the submission mirror.

| | Group 1 — Dojo / Belt Progression | Group 2 — Placement Readiness |
|---|---|---|
| Source rows / four-question days | 800 / 200 (5 days x 40 weeks) | 320 / 80 |
| Identified by | Belt + Week + Day (day 1–6) | Running Day # (1–80) |
| Belts / weeks | Belts 1–10, each its own length | 16 weeks × 5 days |
| Extra metadata kept | Topic, Pattern, Day Focus, Usage | Weekday, Daily theme, Role (Warm-up/Core/Stretch) |

226 problems appear in both groups. Each occurrence is its own `QuestionBankEntry`; they share
one `Problem` row (894 distinct problems in total).

## Where things live

| What | Where |
|---|---|
| Source data (version-controlled) | `apps/api/prisma/question-bank/group1.json` (five-day plan), `group2.json`; the original six-day data is kept as `group1.six-day.json` |
| Regenerate the JSON from the workbooks | `apps/api/prisma/question-bank/xlsx_to_json.py` |
| Explicit, evidenced slug fixes | `apps/api/prisma/question-bank/slug-corrections.json` |
| Validation + planning (pure) | `packages/shared/src/domain/question-bank.ts`, `apps/api/src/modules/question-bank/question-bank-source.ts` |
| Table | `question_bank_entries` (migration `20261009120000_question_bank`, additive only) |
| Import | `apps/api/scripts/question-bank-import.ts` |
| API | `GET /question-bank/filters`, `/sets`, `/sets/:setKey` — ADMIN / MENTOR / VIEWER only |
| UI | `/question-bank`; hand-off is `/assignments?fromBank=<setKey>` |

## Loading it into an environment (once, repeatable)

The migration runs automatically on deploy (`prisma migrate deploy`). The data is loaded by hand:

```bash
# 1. Back up first (production)
pg_dump -Fc "$DATABASE_URL" > tmp/backups/pre-question-bank-import-$(date +%Y%m%d-%H%M).dump

# 2. Dry run — validates, writes nothing, reports exactly what would change
DATABASE_URL=... npx tsx apps/api/scripts/question-bank-import.ts

# 3. Apply
DATABASE_URL=... npx tsx apps/api/scripts/question-bank-import.ts --apply
```

- Safe to re-run: existing `Problem` rows are never modified or re-fetched; entries are keyed on
  `(setKey, position)`; nothing is deleted; any validation issue aborts before the first write.
- The apply step looks up LeetCode metadata **once** for problems the database lacks (~8 min for a
  database that has none of the 894). Assigning a day later does no LeetCode lookups.
- It needs `LEETCODE_*`/`PROVIDER_*` defaults only; no credentials.

## Two source errors found and handled visibly

Validation found two shared LeetCode numbers whose Group 2 link pointed at a non-existent
problem (confirmed against LeetCode's own API). A Group 2 assignment built from either would
never match a student's submissions. They are recorded, with evidence, in `slug-corrections.json`
and printed on every import; the source rows themselves are left as supplied.

| LC # | Group 2 supplied | Used |
|---|---|---|
| 540 | `dsingle-element-in-a-sorted-array` (row 79) | `single-element-in-a-sorted-array` |
| 518 | `coin-change-2` (row 291) | `coin-change-ii` |

## Groups are batches

Group 1 and Group 2 are real batches at VELS and ALU — **G1** (cohorts 1 and 2: highest belt 4 and 5)
and **G2** (cohort 3: highest belt 6+) — and SRM is one batch, **SPE 2024-28**. The old
"Foundation Level" / "Intermediate Level" batches are archived, not deleted. So a Group 1 day goes
to the campus's G1 batch and a Group 2 day to G2, through the unchanged one-assignment-per-day,
campus and batch rule; no scoring or resolver change was needed.

`/assignments?fromBank=` still pre-fills only the links and topic. The audience stays an explicit
choice, but picking "All batches" or the wrong group's batch on a G1/G2 campus now shows a warning.

### Re-placing students (`scripts/g1-g2-cohort-apply.ts`)

Applies a reviewed plan file (names/emails — kept outside the repo): creates the batches, retires the
old ones, sets cohorts, moves students and reactivates archived ones. Moves are written exactly as
`BatchesService.moveStudent` writes them, with an explicit effective day (`--effective`, default the
Monday the plan starts), so no already-scored day is rewritten. Dry run by default; `--apply` saves a
before-snapshot first; `--undo applied-<stamp>.json` restores every student and batch from it.
Rehearsed on a restore of the production backup: apply -> verify -> undo gave 0 mismatches.

Belt -> cohort: highest belt 4 -> cohort 1, 5 -> cohort 2, 6+ -> cohort 3. Belts 1-3 are handled by
the campus team: not placed in G1/G2, and left as they are if archived.

## Group 1 is five practice days a week

No questions are shared on the weekly concept-session day, so each belt-week has **5 days x 4 questions
= 20**, not the 6 x 4 = 24 of the original sheet. The five were chosen against the *Belt Concept
Mapping* table and the weekly session roadmap — nothing was added from outside the sheet:

- Exactly **one day is dropped per week** and the other five are untouched (same four questions, same
  Easy -> Hard order). A day outside the belt's listed topics goes first, then days the roadmap marks as
  self-practice, then the most redundant one; the challenge day is kept whenever it is in scope.
- Two weeks (Belt 4 Week 1, Belt 6 Week 1) had two off-concept days, so both were removed and one clean
  day was composed from their in-scope questions. Three single-question swaps replace a clear
  off-concept question. Every decision and its reason is in `group1.selection.json`.
- Belts 1-3 stay free of Hard problems, no problem repeats, each day is Easy -> Medium -> Hard.
- 160 questions were removed (Easy/Medium/Hard 280/546/134 -> 251/454/95; Hard 14% -> 12%).

To regenerate or revise: edit the decisions in `build_five_day.py`, run it (add
`--xlsx <file> --master <master sheet>` for the review workbook), then load with
`question-bank-import.ts --apply --prune` — `--prune` deletes only question-bank entries the source no
longer contains (never a Problem, never an assignment). The original six-day data is
`group1.six-day.json`.

### Borderline questions and thin topics

Seven days carry a question that is only borderline for its belt, and six table topics have no (or
thin) coverage in the sheet (for example basic string compression, #443, and Quick Sort partitioning
itself). They are listed, not hidden, in the workbook's *Flags & Gaps* sheet and in
`group1.selection.json`; nothing was invented to fill them.
