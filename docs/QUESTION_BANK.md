# Coding Hours Question Bank

The curated Group 1 and Group 2 curricula as browsable reference data, with a hand-off into
the existing Assignments form. **It reads nothing about students and creates nothing by
itself.** Progress is still measured only by `Assignment` + the submission mirror.

| | Group 1 — Dojo / Belt Progression | Group 2 — Placement Readiness |
|---|---|---|
| Source rows / four-question days | 960 / 240 | 320 / 80 |
| Identified by | Belt + Week + Day (day 1–6) | Running Day # (1–80) |
| Belts / weeks | Belts 1–10, each its own length | 16 weeks × 5 days |
| Extra metadata kept | Topic, Pattern, Day Focus, Usage | Weekday, Daily theme, Role (Warm-up/Core/Stretch) |

261 problems appear in both groups. Each occurrence is its own `QuestionBankEntry`; they share
one `Problem` row (1,019 distinct problems in total).

## Where things live

| What | Where |
|---|---|
| Source data (version-controlled) | `apps/api/prisma/question-bank/group1.json`, `group2.json` |
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
  database that has none of the 1,019). Assigning a day later does no LeetCode lookups.
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

## Not built yet — needs a decision

**Group-aware assignment creation.** Today a student's assignment is chosen only by
(campus, batch), and the database allows one assignment per (day, campus, batch). Nothing
models "Group 1" or "Group 2" on a student, so a group label on an assignment would be
cosmetic and two groups in one campus/batch would collide. The hand-off therefore only
pre-fills the existing form; the mentor still picks the campus and batch explicitly.

**Group 1: six curriculum days per week vs five practice days.** All six are kept and shown;
no day is skipped, merged or scheduled. Which five map to the operating week is undecided.
