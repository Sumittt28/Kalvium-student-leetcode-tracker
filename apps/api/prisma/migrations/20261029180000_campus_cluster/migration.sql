-- Campus clusters: campuses that run on the same schedule.
ALTER TABLE "campuses" ADD COLUMN "cluster" INTEGER;
UPDATE "campuses" SET "cluster" = 1 WHERE "code" IN ('VELS', 'JECRC', 'MITADT', 'KALVIUMDIRECT');
UPDATE "campuses" SET "cluster" = 2 WHERE "code" IN ('ALLIANCE', 'TAU', 'CKB');
