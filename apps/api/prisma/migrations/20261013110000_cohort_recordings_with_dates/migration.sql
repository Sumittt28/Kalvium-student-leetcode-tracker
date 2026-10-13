-- Alter cohort_recordings to support multiple recordings per cohort with dates

-- Drop the old unique constraint
DROP INDEX IF EXISTS "cohort_recordings_campusId_cohort_key";

-- Add sessionDate column (required)
ALTER TABLE "cohort_recordings" ADD COLUMN "sessionDate" TEXT;

-- Rename label to topic for clarity
ALTER TABLE "cohort_recordings" RENAME COLUMN "label" TO "topic";

-- Make recordingUrl required (was optional before)
-- First update any NULL values
UPDATE "cohort_recordings" SET "recordingUrl" = '' WHERE "recordingUrl" IS NULL;
UPDATE "cohort_recordings" SET "sessionDate" = '2026-10-12' WHERE "sessionDate" IS NULL;

ALTER TABLE "cohort_recordings" ALTER COLUMN "recordingUrl" SET NOT NULL;
ALTER TABLE "cohort_recordings" ALTER COLUMN "sessionDate" SET NOT NULL;

-- Create new unique constraint on (campusId, cohort, sessionDate)
CREATE UNIQUE INDEX "cohort_recordings_campusId_cohort_sessionDate_key" ON "cohort_recordings"("campusId", "cohort", "sessionDate");

-- Add index for faster lookups
CREATE INDEX "cohort_recordings_campusId_cohort_idx" ON "cohort_recordings"("campusId", "cohort");
