-- Add codingHoursEnabled flag to campuses
-- Only campuses with this flag = true will appear in assignment creation and filters

ALTER TABLE "campuses" ADD COLUMN "codingHoursEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Enable for the 4 campuses where Coding Hours 2.0 has started
UPDATE "campuses" SET "codingHoursEnabled" = true WHERE "code" IN ('VELS', 'JECRC', 'MITADT', 'KALVIUMDIRECT');
