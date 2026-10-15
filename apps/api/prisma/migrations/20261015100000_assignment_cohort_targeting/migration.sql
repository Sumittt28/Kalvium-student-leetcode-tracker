-- Add cohort targeting to assignments
-- NULL means "all cohorts in the batch", a number targets a specific cohort

ALTER TABLE "assignments" ADD COLUMN "cohort" INTEGER;

-- Add comment for clarity
COMMENT ON COLUMN "assignments"."cohort" IS 'Target cohort within the batch. NULL = all cohorts, 1 = Cohort 1 (Belt 4→5), 2 = Cohort 2 (Belt 5→6), 3 = Cohort 3 (Belt 6+)';
