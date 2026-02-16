-- Phase 3: Add persistence models for cost engine, payments, analytics, and health

-- Subscription model (replaces in-memory payment subscription store)
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- UsageRecord model (replaces in-memory cost engine usage metering)
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "module" TEXT NOT NULL,
    "userId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- HabitEntry model (replaces in-memory analytics habit store)
CREATE TABLE "HabitEntry" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "frequency" TEXT NOT NULL,
    "targetPerPeriod" INTEGER NOT NULL DEFAULT 1,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "completedDates" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HabitEntry_pkey" PRIMARY KEY ("id")
);

-- HealthMetric model (replaces simulated wearable data)
CREATE TABLE "HealthMetric" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "metadata" JSONB,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HealthMetric_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HabitEntry" ADD CONSTRAINT "HabitEntry_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthMetric" ADD CONSTRAINT "HealthMetric_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "Subscription_entityId_idx" ON "Subscription"("entityId");
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");
CREATE INDEX "Subscription_stripeCustomerId_idx" ON "Subscription"("stripeCustomerId");
CREATE INDEX "UsageRecord_entityId_idx" ON "UsageRecord"("entityId");
CREATE INDEX "UsageRecord_module_idx" ON "UsageRecord"("module");
CREATE INDEX "UsageRecord_createdAt_idx" ON "UsageRecord"("createdAt");
CREATE INDEX "HabitEntry_entityId_idx" ON "HabitEntry"("entityId");
CREATE INDEX "HabitEntry_isActive_idx" ON "HabitEntry"("isActive");
CREATE INDEX "HealthMetric_entityId_idx" ON "HealthMetric"("entityId");
CREATE INDEX "HealthMetric_type_idx" ON "HealthMetric"("type");
CREATE INDEX "HealthMetric_recordedAt_idx" ON "HealthMetric"("recordedAt");
