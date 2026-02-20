-- CreateTable
CREATE TABLE "AttentionBudget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalMinutes" INTEGER NOT NULL DEFAULT 10,
    "consumedMinutes" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttentionBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdoptionProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'Inbox Mastery',
    "completedSteps" JSONB NOT NULL DEFAULT '[]',
    "ahaMoments" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdoptionProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "framework" TEXT NOT NULL DEFAULT 'CUSTOM',
    "targetValue" DOUBLE PRECISION NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "milestones" JSONB NOT NULL DEFAULT '[]',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ON_TRACK',
    "autoProgress" BOOLEAN NOT NULL DEFAULT false,
    "linkedTaskIds" JSONB NOT NULL DEFAULT '[]',
    "linkedWorkflowIds" JSONB NOT NULL DEFAULT '[]',
    "deadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttentionBudget_userId_idx" ON "AttentionBudget"("userId");

-- CreateIndex
CREATE INDEX "AttentionBudget_date_idx" ON "AttentionBudget"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AttentionBudget_userId_date_key" ON "AttentionBudget"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AdoptionProgress_userId_key" ON "AdoptionProgress"("userId");

-- CreateIndex
CREATE INDEX "AdoptionProgress_userId_idx" ON "AdoptionProgress"("userId");

-- CreateIndex
CREATE INDEX "AdoptionProgress_phase_idx" ON "AdoptionProgress"("phase");

-- CreateIndex
CREATE INDEX "GoalEntry_userId_idx" ON "GoalEntry"("userId");

-- CreateIndex
CREATE INDEX "GoalEntry_entityId_idx" ON "GoalEntry"("entityId");

-- CreateIndex
CREATE INDEX "GoalEntry_status_idx" ON "GoalEntry"("status");

-- AddForeignKey
ALTER TABLE "AttentionBudget" ADD CONSTRAINT "AttentionBudget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdoptionProgress" ADD CONSTRAINT "AdoptionProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalEntry" ADD CONSTRAINT "GoalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
