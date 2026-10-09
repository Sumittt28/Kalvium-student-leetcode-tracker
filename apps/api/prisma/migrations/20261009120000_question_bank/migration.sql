-- CreateEnum
CREATE TYPE "QuestionBankGroup" AS ENUM ('GROUP_1', 'GROUP_2');

-- CreateTable
CREATE TABLE "question_bank_entries" (
    "id" UUID NOT NULL,
    "group" "QuestionBankGroup" NOT NULL,
    "setKey" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "belt" INTEGER,
    "week" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "weekday" TEXT,
    "problemId" UUID NOT NULL,
    "leetcodeNumber" INTEGER NOT NULL,
    "sourceTitle" TEXT NOT NULL,
    "sourceDifficulty" "Difficulty" NOT NULL,
    "topic" TEXT,
    "pattern" TEXT,
    "dayFocus" TEXT,
    "dailyTheme" TEXT,
    "role" TEXT,
    "usage" TEXT,
    "sourceRow" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_bank_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_bank_entries_group_belt_week_day_idx" ON "question_bank_entries"("group", "belt", "week", "day");

-- CreateIndex
CREATE INDEX "question_bank_entries_problemId_idx" ON "question_bank_entries"("problemId");

-- CreateIndex
CREATE UNIQUE INDEX "question_bank_entries_setKey_position_key" ON "question_bank_entries"("setKey", "position");

-- AddForeignKey
ALTER TABLE "question_bank_entries" ADD CONSTRAINT "question_bank_entries_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

