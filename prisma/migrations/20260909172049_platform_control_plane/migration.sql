-- CreateTable
CREATE TABLE "AuditLogEntry" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestMethod" TEXT NOT NULL,
    "requestPath" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "sensitivityLevel" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "hash" TEXT,
    "previousHash" TEXT,

    CONSTRAINT "AuditLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionGateRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expression" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "entityId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionGateRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueuedAction" (
    "id" TEXT NOT NULL,
    "actionLogId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "actorId" TEXT,
    "actionType" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "rollbackPlan" TEXT NOT NULL,
    "blastRadius" TEXT NOT NULL,
    "reversible" BOOLEAN NOT NULL DEFAULT false,
    "estimatedCost" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "scheduledFor" TIMESTAMP(3),
    "entityId" TEXT NOT NULL,
    "projectId" TEXT,
    "workflowExecutionId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueuedAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RollbackPlan" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "estimatedDuration" INTEGER NOT NULL DEFAULT 0,
    "canAutoRollback" BOOLEAN NOT NULL DEFAULT false,
    "requiresManualSteps" BOOLEAN NOT NULL DEFAULT false,
    "manualInstructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RollbackPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowApproval" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "workflowName" TEXT NOT NULL,
    "stepLabel" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "stepData" JSONB NOT NULL DEFAULT '{}',
    "responses" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadManSwitch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "checkInIntervalHours" INTEGER NOT NULL DEFAULT 24,
    "lastCheckIn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "missedCheckIns" INTEGER NOT NULL DEFAULT 0,
    "triggerAfterMisses" INTEGER NOT NULL DEFAULT 3,
    "protocols" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeadManSwitch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "entityScope" JSONB NOT NULL DEFAULT '[]',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedBy" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowSmsCode" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShadowSmsCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ESignRequest" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "signers" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ESignRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowExecutionRecord" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "triggeredBy" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "currentNodeId" TEXT,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "stepResults" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,

    CONSTRAINT "WorkflowExecutionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunbookExecution" (
    "id" TEXT NOT NULL,
    "runbookId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "stepResults" JSONB NOT NULL DEFAULT '[]',
    "triggeredBy" TEXT NOT NULL,

    CONSTRAINT "RunbookExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowCallAttempt" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShadowCallAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLogEntry_entityId_idx" ON "AuditLogEntry"("entityId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_timestamp_idx" ON "AuditLogEntry"("timestamp");

-- CreateIndex
CREATE INDEX "AuditLogEntry_actorId_idx" ON "AuditLogEntry"("actorId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_resource_resourceId_idx" ON "AuditLogEntry"("resource", "resourceId");

-- CreateIndex
CREATE INDEX "ExecutionGateRule_entityId_idx" ON "ExecutionGateRule"("entityId");

-- CreateIndex
CREATE INDEX "ExecutionGateRule_isActive_idx" ON "ExecutionGateRule"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "QueuedAction_idempotencyKey_key" ON "QueuedAction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "QueuedAction_entityId_idx" ON "QueuedAction"("entityId");

-- CreateIndex
CREATE INDEX "QueuedAction_status_idx" ON "QueuedAction"("status");

-- CreateIndex
CREATE INDEX "QueuedAction_scheduledFor_idx" ON "QueuedAction"("scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "RollbackPlan_actionId_key" ON "RollbackPlan"("actionId");

-- CreateIndex
CREATE INDEX "WorkflowApproval_executionId_idx" ON "WorkflowApproval"("executionId");

-- CreateIndex
CREATE INDEX "WorkflowApproval_status_idx" ON "WorkflowApproval"("status");

-- CreateIndex
CREATE INDEX "WorkflowApproval_expiresAt_idx" ON "WorkflowApproval"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeadManSwitch_userId_key" ON "DeadManSwitch"("userId");

-- CreateIndex
CREATE INDEX "DeadManSwitch_isEnabled_idx" ON "DeadManSwitch"("isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "Role_roleName_key" ON "Role"("roleName");

-- CreateIndex
CREATE INDEX "UserRoleAssignment_userId_idx" ON "UserRoleAssignment"("userId");

-- CreateIndex
CREATE INDEX "UserRoleAssignment_roleId_idx" ON "UserRoleAssignment"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRoleAssignment_userId_roleId_key" ON "UserRoleAssignment"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "ShadowSmsCode_cacheKey_key" ON "ShadowSmsCode"("cacheKey");

-- CreateIndex
CREATE INDEX "ShadowSmsCode_expiresAt_idx" ON "ShadowSmsCode"("expiresAt");

-- CreateIndex
CREATE INDEX "ESignRequest_documentId_idx" ON "ESignRequest"("documentId");

-- CreateIndex
CREATE INDEX "ESignRequest_status_idx" ON "ESignRequest"("status");

-- CreateIndex
CREATE INDEX "WorkflowExecutionRecord_workflowId_idx" ON "WorkflowExecutionRecord"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowExecutionRecord_status_idx" ON "WorkflowExecutionRecord"("status");

-- CreateIndex
CREATE INDEX "RunbookExecution_runbookId_idx" ON "RunbookExecution"("runbookId");

-- CreateIndex
CREATE INDEX "RunbookExecution_status_idx" ON "RunbookExecution"("status");

-- CreateIndex
CREATE INDEX "ShadowCallAttempt_contactId_attemptedAt_idx" ON "ShadowCallAttempt"("contactId", "attemptedAt");

-- CreateIndex
CREATE INDEX "ShadowCallAttempt_attemptedAt_idx" ON "ShadowCallAttempt"("attemptedAt");
