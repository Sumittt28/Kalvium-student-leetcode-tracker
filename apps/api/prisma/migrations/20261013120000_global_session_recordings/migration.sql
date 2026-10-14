-- Rename and simplify cohort_recordings to session_recordings (global, not per-campus)
-- Sessions are based on belt level, so all students in a cohort watch the same recordings

-- Drop old table
DROP TABLE IF EXISTS "cohort_recordings";

-- Create new global session_recordings table
CREATE TABLE "session_recordings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cohort" INTEGER NOT NULL,
    "sessionDate" TEXT NOT NULL,
    "recordingUrl" TEXT NOT NULL,
    "topic" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_recordings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "session_recordings_cohort_sessionDate_key" ON "session_recordings"("cohort", "sessionDate");
CREATE INDEX "session_recordings_cohort_idx" ON "session_recordings"("cohort");
