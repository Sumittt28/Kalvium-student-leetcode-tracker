# Onboarding a new campus to Coding Hours

The procedure used for Alliance, TAU and CKB (29 Oct 2026). Rosters are **not** committed to
this repo (they hold student emails); only the method and the reusable SQL are.

## Principles

- **Never delete data.** Students who are not on a roster are *archived* with a reason, which
  is reversible. Take a `pg_dump` before every production change.
- **Verify first, write second.** Check the roster and every LeetCode handle before touching
  the database. A wrong handle that gets written is a mess to unpick.
- **One batch per cohort.** Batches are `C1`, `C2`, `C3` (cohort 1/2/3). Audience resolution
  matches on campus + batch, so two cohorts in one batch would share one problem set.
  `cohortForBatchCode()` in `@dsa/shared` keeps an assignment's `cohort` in step with its batch.
- **Keep the campus disabled until its Day 1 is ready.** `codingHoursEnabled` puts a campus in
  every picker *and* in "All campuses" assignment targeting.

## Inputs you need

1. Roster: email, LeetCode handle (may be blank), group 1/2/3 (Belt 4 / Belt 5 / Belt 6+).
2. Mentor names, and the campus's session day / Day 1 date.

## Steps

1. **Reconcile the lists.** Rosters usually arrive as two sheets (handles, groups). Compare
   them: a student in one and not the other, or a near-identical email, must be resolved with
   the campus before anything is written.
2. **Check handles live.** Query LeetCode's GraphQL `matchedUser(username)` for each handle
   (retry on network errors). A handle that does not exist is still onboarded (email at least);
   it will show as *Insufficient Data* until fixed. Also confirm none of the emails or handles
   already exist in the tool.
3. **Back up.** `docker run --rm postgres:18-alpine pg_dump "$DATABASE_URL" > backup.sql`.
   PG 18 dumps end with `\unrestrict`, not "dump complete" - check the file size instead.
4. **If the campus already has students** (Alliance did), archive everyone not on the roster.
   Match on **email and handle**: some existing rows have no email, and archiving by email
   alone would remove people who *are* on the roster. Fill in missing emails from the roster.
5. **Run `apps/api/scripts/sql/onboard-campus.sql`** (dry-run first with `-v finish=ROLLBACK`).
   It creates the campus (disabled), `C1`/`C2`/`C3`, the students, and the campus + batch
   placement history, asserting every count. Pass `-v effective_day=` as the cohort's **real
   first day** (e.g. the session day), not today: enrolment and placement are dated from it,
   and the rollup skips any day before a student's enrolment. Getting this wrong makes Day 1
   silently unscored.
6. **Mentors.** Grant campus access in Admin -> Mentors (`PUT /admin/mentors/:id/campuses`).
7. **Day 1.** Create assignments per campus in the Assignments page - one per batch
   (`C1` -> Belt 5 sets, `C2` -> Belt 6 sets, `C3` -> the placement `G2-D*` sets). If the day
   has already passed, backfill it with `apps/api/scripts/sql/backfill-assignment-day.sql`: it
   creates the assignments, **upserts** `daily_statuses` (the sync cron has already written
   empty rows with a NULL assignment, so a plain INSERT collides on `(studentId, dayKey)`) and
   rebuilds `daily_problem_statuses` from same-day submissions. It refuses to run if any
   student was enrolled after the day, or the campus already has assignments that day.
8. **Enable** `codingHoursEnabled` only now (Admin, or
   `UPDATE campuses SET "codingHoursEnabled" = true WHERE code = '...'`). Campus lists are cached;
   they refresh within minutes or on the next sync.
9. **Verify.** Student counts per batch, other campuses unchanged, and the integrity checks:
   no daily row pointing at another cohort's assignment, `solvedCount` equal to the accepted
   rows, no same-day accepted submission left unmarked.

## Campuses on different weeks

Alliance, TAU and CKB run about a week behind the original campuses. "All campuses" targeting
includes **every enabled campus**, so using it would hand a behind-schedule campus the wrong
day's questions. Until campus clusters exist, assign campuses on a different week
**one campus at a time**.

## Record of operations (no personal data)

| Date | Operation |
|---|---|
| 29 Oct 2026 | Batches renamed to `C1`/`C2`/`C3` everywhere; `C2` created at KALVIUMDIRECT and VELS; 5 students moved; 185 historical student-days repointed to their own cohort's assignment |
| 29 Oct 2026 | Alliance: 40 non-roster students + 4 "not part" archived; 34 active across `C1`/`C2`/`C3`; Day 1 (28 Oct) backfilled |
| 29 Oct 2026 | TAU: 20 students (7 / 9 / 4 across C1/C2/C3); campus enabled |
| 29 Oct 2026 | CKB: 28 students (1 / 3 / 24 across C1/C2/C3); campus enabled |
| 29 Oct 2026 | TAU (Apollo University) and CKB (Chitkara Baddi): enrolment back-dated to 27 Oct; Day 1 (28 Oct) backfilled - 6 assignments, 48 students |
