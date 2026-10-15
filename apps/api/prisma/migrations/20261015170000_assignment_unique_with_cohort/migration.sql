-- Update unique constraint to include cohort
-- This allows different cohorts to have separate assignments on the same day/campus/batch

-- Drop old unique constraint
DROP INDEX IF EXISTS "assignments_dayKey_campusId_batchId_key";

-- Create new unique constraint that includes cohort
CREATE UNIQUE INDEX "assignments_dayKey_campusId_batchId_cohort_key" 
ON "assignments" ("dayKey", "campusId", "batchId", "cohort");
