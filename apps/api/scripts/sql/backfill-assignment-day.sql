-- Create one day's assignments (one per cohort per campus) from Question Bank sets, plus the
-- daily rows, for campuses that are already onboarded. Use it to backfill a day that has
-- passed (e.g. a new wave's Day 1); for a current or future day the Assignments page does this
-- itself and the next sync derives the daily rows.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v campus_codes=TAU,CKB -v day_key=2026-10-28 \
--     -v set_c1=G1-B5-W1-D1 -v topic_c1='Group 1 · Belt 5 · Week 1 · Day 1' \
--     -v set_c2=G1-B6-W1-D1 -v topic_c2='Group 2 · Belt 6 · Week 1 · Day 1' \
--     -v set_c3=G2-D1       -v topic_c3='Group 3 · G2 · Week 1 · Day 1' \
--     [-v finish=ROLLBACK] -f apps/api/scripts/sql/backfill-assignment-day.sql
--
-- Same-day solves are credited (the submission window is the assignment's calendar day, IST).
-- Take a backup first. Dry-run with -v finish=ROLLBACK.

\set ON_ERROR_STOP on
\if :{?finish}
\else
  \set finish COMMIT
\endif

BEGIN;
SELECT set_config('app.campuses', :'campus_codes', true), set_config('app.day', :'day_key', true);

CREATE TEMP TABLE sets (cohort int, set_key text, topic text);
INSERT INTO sets VALUES (1, :'set_c1', :'topic_c1'), (2, :'set_c2', :'topic_c2'), (3, :'set_c3', :'topic_c3');

DO $$
DECLARE missing text; late int;
BEGIN
  SELECT string_agg(set_key, ', ') INTO missing FROM sets
    WHERE NOT EXISTS (SELECT 1 FROM question_bank_entries q WHERE q."setKey" = sets.set_key);
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Question Bank set(s) not found: %', missing; END IF;

  IF EXISTS (SELECT 1 FROM assignments a JOIN campuses c ON c.id = a."campusId"
             WHERE c.code = ANY (string_to_array(current_setting('app.campuses'), ','))
               AND a."dayKey" = current_setting('app.day')) THEN
    RAISE EXCEPTION 'these campuses already have assignments on %', current_setting('app.day');
  END IF;

  -- The rollup skips any day before a student's enrolment. Catch it here instead of silently
  -- producing a day nobody is scored on.
  SELECT count(*) INTO late FROM students s JOIN campuses c ON c.id = s."campusId"
    WHERE c.code = ANY (string_to_array(current_setting('app.campuses'), ',')) AND s.status = 'ACTIVE'
      AND to_char(s."createdAt" + interval '5 hours 30 minutes', 'YYYY-MM-DD') > current_setting('app.day');
  IF late > 0 THEN
    RAISE EXCEPTION '% active students were enrolled after % - back-date their enrolment and placement history first', late, current_setting('app.day');
  END IF;
END $$;

INSERT INTO assignments (id, "dayKey", title, topic, "isPublished", "campusId", "originalCampusId", "batchId", "originalBatchId", cohort, "updatedAt")
SELECT gen_random_uuid(), :'day_key', NULL, v.topic, true, c.id, c.id, b.id, b.id, v.cohort, now()
FROM campuses c CROSS JOIN sets v
JOIN batches b ON b."campusId" = c.id AND b.code = 'C' || v.cohort AND b.status = 'ACTIVE'
WHERE c.code = ANY (string_to_array(:'campus_codes', ','));

INSERT INTO assignment_problems (id, "assignmentId", "problemId", position)
SELECT gen_random_uuid(), a.id, q."problemId", q.position
FROM assignments a JOIN campuses c ON c.id = a."campusId"
JOIN sets v ON v.cohort = a.cohort
JOIN question_bank_entries q ON q."setKey" = v.set_key
WHERE c.code = ANY (string_to_array(:'campus_codes', ',')) AND a."dayKey" = :'day_key';

-- Upsert: the sync cron may already have written empty rows with a NULL assignment.
INSERT INTO daily_statuses (id, "studentId", "dayKey", "assignmentId", "campusId", "batchId", "assignedCount", "updatedAt")
SELECT gen_random_uuid(), s.id, :'day_key', a.id, s."campusId", s."batchId",
       (SELECT count(*) FROM assignment_problems ap WHERE ap."assignmentId" = a.id), now()
FROM students s JOIN campuses c ON c.id = s."campusId"
JOIN assignments a ON a."campusId" = s."campusId" AND a."batchId" = s."batchId" AND a.cohort = s.cohort AND a."dayKey" = :'day_key'
WHERE c.code = ANY (string_to_array(:'campus_codes', ',')) AND s.status = 'ACTIVE'
ON CONFLICT ("studentId", "dayKey") DO UPDATE SET
  "assignmentId" = EXCLUDED."assignmentId", "campusId" = EXCLUDED."campusId", "batchId" = EXCLUDED."batchId",
  "assignedCount" = EXCLUDED."assignedCount", "updatedAt" = now();

DELETE FROM daily_problem_statuses dps USING daily_statuses ds, students s, campuses c
WHERE dps."dailyStatusId" = ds.id AND ds."studentId" = s.id AND s."campusId" = c.id
  AND c.code = ANY (string_to_array(:'campus_codes', ',')) AND ds."dayKey" = :'day_key';

INSERT INTO daily_problem_statuses (id, "dailyStatusId", "problemId", position, status, "inWindowStatus", "solvedAt", "solvedInWindowAt", attempts, "attemptsInWindow")
SELECT gen_random_uuid(), ds.id, ap."problemId", ap.position,
  (CASE WHEN agg.has_acc THEN 'ACCEPTED' WHEN agg.has_any THEN 'ATTEMPTED_NOT_ACCEPTED' ELSE 'NOT_ATTEMPTED' END)::"ProblemStatus",
  (CASE WHEN agg.has_acc THEN 'ACCEPTED' WHEN agg.has_any THEN 'ATTEMPTED_NOT_ACCEPTED' ELSE 'NOT_ATTEMPTED' END)::"ProblemStatus",
  agg.acc_at, agg.acc_at, coalesce(agg.cnt, 0), coalesce(agg.cnt, 0)
FROM daily_statuses ds JOIN students s ON s.id = ds."studentId" JOIN campuses c ON c.id = s."campusId"
JOIN assignment_problems ap ON ap."assignmentId" = ds."assignmentId"
JOIN problems p ON p.id = ap."problemId"
LEFT JOIN LATERAL (
  SELECT bool_or(sub.status = 'ACCEPTED') AS has_acc, bool_or(true) AS has_any,
         MIN(sub."submittedAt") FILTER (WHERE sub.status = 'ACCEPTED') AS acc_at, count(*)::int AS cnt
  FROM submissions sub
  WHERE sub."studentId" = ds."studentId" AND lower(sub."titleSlug") = lower(p."titleSlug") AND sub."dayKey" = ds."dayKey"
) agg ON true
WHERE c.code = ANY (string_to_array(:'campus_codes', ',')) AND ds."dayKey" = :'day_key' AND ds."assignmentId" IS NOT NULL;

UPDATE daily_statuses ds SET "solvedCount" = x.n, "inWindowSolvedCount" = LEAST(x.n, ds."assignedCount"), "updatedAt" = now()
FROM (SELECT d2.id, count(*) FILTER (WHERE dps.status = 'ACCEPTED') AS n
      FROM daily_statuses d2 JOIN daily_problem_statuses dps ON dps."dailyStatusId" = d2.id
      JOIN students s ON s.id = d2."studentId" JOIN campuses c ON c.id = s."campusId"
      WHERE c.code = ANY (string_to_array(:'campus_codes', ',')) AND d2."dayKey" = :'day_key' GROUP BY d2.id) x
WHERE ds.id = x.id;

DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM daily_statuses ds JOIN students s ON s.id = ds."studentId" JOIN campuses c ON c.id = s."campusId"
    JOIN assignments a ON a.id = ds."assignmentId"
    WHERE c.code = ANY (string_to_array(current_setting('app.campuses'), ',')) AND ds."dayKey" = current_setting('app.day')
      AND a.cohort <> s.cohort;
  IF bad > 0 THEN RAISE EXCEPTION '% daily rows point at another cohort''s assignment', bad; END IF;
END $$;

\echo === per campus and cohort ===
SELECT c.code AS campus, a.cohort, count(DISTINCT a.id) AS assignments, count(ds.id) AS students, coalesce(sum(ds."solvedCount"), 0) AS already_solved
FROM assignments a JOIN campuses c ON c.id = a."campusId" LEFT JOIN daily_statuses ds ON ds."assignmentId" = a.id
WHERE c.code = ANY (string_to_array(:'campus_codes', ',')) AND a."dayKey" = :'day_key'
GROUP BY c.code, a.cohort ORDER BY c.code, a.cohort;

:finish;
