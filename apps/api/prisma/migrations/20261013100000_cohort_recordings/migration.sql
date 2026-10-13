-- Session recording links per cohort within a campus
CREATE TABLE "cohort_recordings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campusId" UUID NOT NULL,
    "cohort" INTEGER NOT NULL,
    "recordingUrl" TEXT,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cohort_recordings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cohort_recordings_campusId_cohort_key" ON "cohort_recordings"("campusId", "cohort");

ALTER TABLE "cohort_recordings" ADD CONSTRAINT "cohort_recordings_campusId_fkey" 
    FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
