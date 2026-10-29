-- Onboard a new Coding Hours campus: campus + one batch per cohort + students + placement history.
--
-- See docs/ONBOARDING_NEW_CAMPUS.md for the whole procedure (handle checks, backup, mentors,
-- Day 1). This file is the transactional part, and it is deliberately defensive: every
-- assumption is asserted, and any surprise rolls the whole thing back.
--
-- Usage (roster file is NOT committed - it holds student emails):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v campus_code=TAU -v campus_name='TAU University' -v expected_count=20 \
--     -v roster_file=/path/to/tau_roster.sql \
--     [-v effective_day=2026-10-29] [-v finish=ROLLBACK] \
--     -f apps/api/scripts/sql/onboard-campus.sql
--
-- roster_file contains one statement:
--   INSERT INTO roster VALUES ('a.b.s86@kalvium.community','LeetCodeHandleOrNULL',3), ...;
-- where the last value is the group/cohort: 1 -> C1, 2 -> C2, 3 -> C3.
--
-- `finish` defaults to COMMIT. Pass -v finish=ROLLBACK for a dry run that changes nothing.
-- The campus is created with codingHoursEnabled = false on purpose: enabling it puts it in
-- every picker AND in "All campuses" targeting, so do that only once its Day 1 is ready.

\set ON_ERROR_STOP on
\if :{?finish}
\else
  \set finish COMMIT
\endif
\if :{?effective_day}
\else
  SELECT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS effective_day \gset
\endif

BEGIN;

SELECT set_config('app.campus_code', :'campus_code', true),
       set_config('app.expected', :'expected_count', true);

CREATE TEMP TABLE roster (email text, handle text, grp int);
\i :roster_file

DO $$
DECLARE n int; clash int;
BEGIN
  SELECT count(*) INTO n FROM roster;
  IF n <> current_setting('app.expected')::int THEN
    RAISE EXCEPTION 'roster has % rows, expected %', n, current_setting('app.expected');
  END IF;
  IF EXISTS (SELECT 1 FROM roster WHERE grp NOT IN (1, 2, 3)) THEN
    RAISE EXCEPTION 'every roster row needs a group of 1, 2 or 3';
  END IF;
  IF (SELECT count(DISTINCT lower(email)) FROM roster) <> n THEN
    RAISE EXCEPTION 'duplicate emails inside the roster';
  END IF;
  SELECT count(*) INTO clash FROM roster t JOIN students s
    ON lower(s.email) = lower(t.email)
    OR (t.handle IS NOT NULL AND lower(s."leetcodeUsername") = lower(t.handle));
  IF clash <> 0 THEN
    RAISE EXCEPTION '% roster rows already exist in the tool (by email or handle)', clash;
  END IF;
  IF EXISTS (SELECT 1 FROM campuses WHERE code = current_setting('app.campus_code')) THEN
    RAISE EXCEPTION 'campus % already exists', current_setting('app.campus_code');
  END IF;
END $$;

INSERT INTO campuses (id, name, code, status, "sortOrder", "updatedAt", "codingHoursEnabled")
VALUES (gen_random_uuid(), :'campus_name', :'campus_code', 'ACTIVE', 0, now(), false);

-- One batch per cohort. Audience resolution matches on campus + batch, so two cohorts in one
-- batch would share a problem set. C1/C2/C3 hold cohort 1/2/3 (see cohortForBatchCode).
INSERT INTO batches (id, "campusId", name, code, status, "isActive", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), c.id, v.code, v.code, 'ACTIVE', true, v.so, now()
FROM campuses c, (VALUES ('C1', 1), ('C2', 2), ('C3', 3)) AS v(code, so)
WHERE c.code = :'campus_code';

-- name = email is the existing convention when a roster carries no names.
INSERT INTO students (id, name, email, "leetcodeUsername", "campusId", "batchId", cohort, status, "updatedAt")
SELECT gen_random_uuid(), t.email, t.email, t.handle, c.id, b.id, t.grp, 'ACTIVE', now()
FROM roster t
JOIN campuses c ON c.code = :'campus_code'
JOIN batches b ON b."campusId" = c.id AND b.code = 'C' || t.grp;

-- Placement history, dated on the enrolment day: every historical query reads these tables,
-- never Student.campusId / batchId, so a student without them resolves to "no campus".
INSERT INTO student_campus_history (id, "studentId", "fromCampusId", "toCampusId", "effectiveFromDayKey", reason, source, "changedAt")
SELECT gen_random_uuid(), s.id, NULL, s."campusId", :'effective_day', :'campus_code' || ' Coding Hours onboarding', 'IMPORT', now()
FROM students s JOIN campuses c ON c.id = s."campusId" WHERE c.code = :'campus_code';

INSERT INTO student_batch_history (id, "studentId", "fromBatchId", "toBatchId", "effectiveFromDayKey", reason, source, "changedAt")
SELECT gen_random_uuid(), s.id, NULL, s."batchId", :'effective_day', :'campus_code' || ' Coding Hours onboarding', 'IMPORT', now()
FROM students s JOIN campuses c ON c.id = s."campusId" WHERE c.code = :'campus_code';

DO $$
DECLARE n int; hc int; hb int;
BEGIN
  SELECT count(*) INTO n FROM students s JOIN campuses c ON c.id = s."campusId"
    WHERE c.code = current_setting('app.campus_code');
  SELECT count(*) INTO hc FROM student_campus_history h JOIN students s ON s.id = h."studentId"
    JOIN campuses c ON c.id = s."campusId" WHERE c.code = current_setting('app.campus_code');
  SELECT count(*) INTO hb FROM student_batch_history h JOIN students s ON s.id = h."studentId"
    JOIN campuses c ON c.id = s."campusId" WHERE c.code = current_setting('app.campus_code');
  IF n <> current_setting('app.expected')::int OR hc <> n OR hb <> n THEN
    RAISE EXCEPTION 'post-insert counts disagree: students %, campus history %, batch history %', n, hc, hb;
  END IF;
END $$;

\echo === batches x cohorts ===
SELECT b.code AS batch, s.cohort, count(*) AS students, count(*) FILTER (WHERE s."leetcodeUsername" IS NULL) AS without_handle
FROM students s JOIN campuses c ON c.id = s."campusId" JOIN batches b ON b.id = s."batchId"
WHERE c.code = :'campus_code' GROUP BY 1, 2 ORDER BY 1;

:finish;
