-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hashedPassword" TEXT,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "chronotype" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Personal',
    "complianceProfile" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "brandKit" JSONB,
    "voicePersonaId" TEXT,
    "phoneNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "channels" JSONB NOT NULL DEFAULT '[]',
    "relationshipScore" INTEGER NOT NULL DEFAULT 50,
    "lastTouch" TIMESTAMP(3),
    "commitments" JSONB NOT NULL DEFAULT '[]',
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "entityId" TEXT NOT NULL,
    "projectId" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'P1',
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "dueDate" TIMESTAMP(3),
    "dependencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assigneeId" TEXT,
    "createdFrom" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "description" TEXT,
    "milestones" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "health" TEXT NOT NULL DEFAULT 'GREEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "participantIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "bufferBefore" INTEGER,
    "bufferAfter" INTEGER,
    "prepPacket" JSONB,
    "meetingNotes" TEXT,
    "recurrence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "threadId" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "triageScore" INTEGER NOT NULL DEFAULT 5,
    "intent" TEXT,
    "sensitivity" TEXT NOT NULL DEFAULT 'INTERNAL',
    "draftStatus" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "templateId" TEXT,
    "citations" JSONB NOT NULL DEFAULT '[]',
    "content" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeEntry" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "entityId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "linkedEntities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "triggers" JSONB NOT NULL DEFAULT '[]',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "lastRun" TIMESTAMP(3),
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "contactId" TEXT,
    "direction" TEXT NOT NULL,
    "personaId" TEXT,
    "scriptId" TEXT,
    "outcome" TEXT,
    "transcript" TEXT,
    "recordingUrl" TEXT,
    "sentiment" DOUBLE PRECISION,
    "duration" INTEGER,
    "actionItems" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "entityId" TEXT,
    "condition" JSONB NOT NULL,
    "action" JSONB NOT NULL,
    "precedence" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL DEFAULT 'HUMAN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "actorId" TEXT,
    "actionType" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "blastRadius" TEXT NOT NULL DEFAULT 'LOW',
    "reversible" BOOLEAN NOT NULL DEFAULT true,
    "rollbackPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "cost" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialRecord" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "category" TEXT NOT NULL,
    "vendor" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentReceipt" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "impacted" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reversible" BOOLEAN NOT NULL DEFAULT true,
    "rollbackLink" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "lastAccessed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "options" JSONB NOT NULL,
    "matrix" JSONB,
    "outcome" TEXT,
    "rationale" TEXT,
    "deadline" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "stakeholders" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "spent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "alerts" JSONB,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "actionUrl" TEXT,
    "metadata" JSONB,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoicePersona" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "voiceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'elevenlabs',
    "settings" JSONB NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sampleUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoicePersona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Runbook" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "steps" JSONB NOT NULL,
    "variables" JSONB,
    "category" TEXT NOT NULL,
    "trigger" TEXT,
    "schedule" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Runbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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
    "data" JSONB NOT NULL DEFAULT '{}',
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

-- CreateTable
CREATE TABLE "VaultEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "encryptedData" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'aes-256-gcm',
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultSecret" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultSecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "encryptedKeyMaterial" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),

    CONSTRAINT "VaultKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvenanceRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "inputHash" TEXT NOT NULL,
    "outputHash" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "promptTemplate" TEXT,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProvenanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "secret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "webhookConfigId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "response" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "author" TEXT,
    "description" TEXT,
    "permissions" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluginRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginReview" (
    "id" TEXT NOT NULL,
    "pluginRecordId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "findings" JSONB NOT NULL,
    "riskScore" DOUBLE PRECISION,
    "reviewedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "affectedUsers" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PluginReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DNDConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "mode" TEXT NOT NULL DEFAULT 'MANUAL',
    "startTime" TEXT,
    "endTime" TEXT,
    "vipBreakthroughEnabled" BOOLEAN NOT NULL DEFAULT false,
    "vipContactIds" JSONB NOT NULL DEFAULT '[]',
    "calendarIntegration" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DNDConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "actions" JSONB NOT NULL,
    "grantedBy" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PermissionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "voiceCloneId" TEXT NOT NULL,
    "consentGiven" BOOLEAN NOT NULL DEFAULT true,
    "consentTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "VoiceConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT,
    "description" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUpReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CannedResponse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "shortcut" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CannedResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalHold" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "releasedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'ARCHIVE',
    "retentionDays" INTEGER NOT NULL,
    "schedule" TEXT NOT NULL DEFAULT 'DAILY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastExecutedAt" TIMESTAMP(3),
    "executionHistory" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowVoiceSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentChannel" TEXT NOT NULL,
    "channelHistory" JSONB NOT NULL DEFAULT '[]',
    "activeEntityId" TEXT,
    "currentPage" TEXT,
    "currentWorkflowId" TEXT,
    "currentWorkflowStep" INTEGER,
    "recordingUrls" JSONB NOT NULL DEFAULT '[]',
    "fullTranscript" TEXT,
    "aiSummary" TEXT,
    "approvals" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "totalDurationSeconds" INTEGER NOT NULL DEFAULT 0,
    "messageCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ShadowVoiceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'TEXT',
    "intent" TEXT,
    "toolsUsed" JSONB NOT NULL DEFAULT '[]',
    "actionsTaken" JSONB NOT NULL DEFAULT '[]',
    "audioUrl" TEXT,
    "channel" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "latencyMs" INTEGER,
    "telemetry" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShadowMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowConsentReceipt" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "messageId" TEXT,
    "actionType" TEXT NOT NULL,
    "actionDescription" TEXT NOT NULL,
    "triggerSource" TEXT NOT NULL,
    "triggerReferenceType" TEXT,
    "triggerReferenceId" TEXT,
    "reasoning" TEXT,
    "sourcesCited" JSONB NOT NULL DEFAULT '[]',
    "confirmationLevel" TEXT NOT NULL,
    "confirmationMethod" TEXT,
    "blastRadius" TEXT NOT NULL,
    "affectedCount" INTEGER NOT NULL DEFAULT 0,
    "financialImpact" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reversible" BOOLEAN NOT NULL DEFAULT false,
    "rollbackPath" TEXT,
    "aiCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "telephonyCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "entityId" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rolledBackAt" TIMESTAMP(3),
    "rolledBackBy" TEXT,

    CONSTRAINT "ShadowConsentReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowSessionOutcome" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "decisionsMade" JSONB NOT NULL DEFAULT '[]',
    "commitments" JSONB NOT NULL DEFAULT '[]',
    "deadlinesSet" JSONB NOT NULL DEFAULT '[]',
    "followUps" JSONB NOT NULL DEFAULT '[]',
    "recordsCreated" JSONB NOT NULL DEFAULT '[]',
    "recordsUpdated" JSONB NOT NULL DEFAULT '[]',
    "recordsLinked" JSONB NOT NULL DEFAULT '[]',
    "extractionConfidence" DOUBLE PRECISION,
    "userVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShadowSessionOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowTrustedDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "deviceFingerprint" TEXT,
    "phoneNumber" TEXT,
    "name" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ShadowTrustedDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowAuthEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "method" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "riskLevel" TEXT,
    "actionAttempted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShadowAuthEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowSafetyConfig" (
    "userId" TEXT NOT NULL,
    "voicePin" TEXT,
    "requirePinForFinancial" BOOLEAN NOT NULL DEFAULT true,
    "requirePinForExternal" BOOLEAN NOT NULL DEFAULT false,
    "requirePinForCrisis" BOOLEAN NOT NULL DEFAULT true,
    "maxBlastRadiusWithoutPin" TEXT NOT NULL DEFAULT 'entity',
    "phoneConfirmationMode" TEXT NOT NULL DEFAULT 'voice_pin',
    "alwaysAnnounceBlastRadius" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ShadowSafetyConfig_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ShadowEntityProfile" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "voicePersona" TEXT NOT NULL DEFAULT 'default',
    "tone" TEXT NOT NULL DEFAULT 'professional-friendly',
    "signature" TEXT,
    "greeting" TEXT,
    "disclaimers" JSONB NOT NULL DEFAULT '[]',
    "allowedDisclosures" JSONB NOT NULL DEFAULT '[]',
    "neverDisclose" JSONB NOT NULL DEFAULT '[]',
    "complianceProfiles" JSONB NOT NULL DEFAULT '[]',
    "vipContacts" JSONB NOT NULL DEFAULT '[]',
    "proactiveEnabled" BOOLEAN NOT NULL DEFAULT true,
    "financialPinThreshold" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "blastRadiusPinThreshold" TEXT NOT NULL DEFAULT 'external',

    CONSTRAINT "ShadowEntityProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowProactiveConfig" (
    "userId" TEXT NOT NULL,
    "briefingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "briefingTime" TEXT NOT NULL DEFAULT '08:00',
    "briefingChannel" TEXT NOT NULL DEFAULT 'in_app',
    "briefingContent" JSONB NOT NULL DEFAULT '[]',
    "callTriggers" JSONB,
    "vipBreakoutContacts" JSONB NOT NULL DEFAULT '[]',
    "callWindowStart" TEXT NOT NULL DEFAULT '09:00',
    "callWindowEnd" TEXT NOT NULL DEFAULT '18:00',
    "quietHoursStart" TEXT NOT NULL DEFAULT '22:00',
    "quietHoursEnd" TEXT NOT NULL DEFAULT '07:00',
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 60,
    "maxCallsPerDay" INTEGER NOT NULL DEFAULT 5,
    "maxCallsPerHour" INTEGER NOT NULL DEFAULT 2,
    "digestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "digestTime" TEXT,
    "escalationConfig" JSONB,

    CONSTRAINT "ShadowProactiveConfig_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ShadowChannelEffectiveness" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "responses" INTEGER NOT NULL DEFAULT 0,
    "avgResponseTime" DOUBLE PRECISION,
    "responseRate" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ShadowChannelEffectiveness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowTrigger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "triggerName" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "action" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 60,
    "lastTriggered" TIMESTAMP(3),

    CONSTRAINT "ShadowTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferenceKey" TEXT NOT NULL,
    "preferenceValue" TEXT NOT NULL,
    "learnedFrom" TEXT NOT NULL DEFAULT 'explicit',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShadowPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowOverrideLog" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "messageId" TEXT,
    "suggestionType" TEXT NOT NULL,
    "suggestionContent" TEXT,
    "overrideReason" TEXT,
    "overrideDetail" TEXT,
    "alternativeAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShadowOverrideLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowRetentionConfig" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "channel" TEXT,
    "storeRecordings" BOOLEAN NOT NULL DEFAULT true,
    "storeTranscripts" BOOLEAN NOT NULL DEFAULT true,
    "storeMessages" BOOLEAN NOT NULL DEFAULT true,
    "recordingRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "transcriptRetentionDays" INTEGER NOT NULL DEFAULT 365,
    "messageRetentionDays" INTEGER NOT NULL DEFAULT 365,
    "consentRetentionDays" INTEGER NOT NULL DEFAULT 2555,
    "noRecordingMode" BOOLEAN NOT NULL DEFAULT false,
    "ephemeralMode" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ShadowRetentionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowOutreach" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "triggerEvent" TEXT,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "content" TEXT,
    "userResponse" TEXT,
    "actionsTaken" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShadowOutreach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceforgeCallPlaybook" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "openingScript" TEXT,
    "dataAllowed" JSONB NOT NULL DEFAULT '[]',
    "neverDisclose" JSONB NOT NULL DEFAULT '[]',
    "escalationTriggers" JSONB NOT NULL DEFAULT '[]',
    "escalationAction" TEXT,
    "maxDuration" INTEGER NOT NULL DEFAULT 300,
    "outcomeFields" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "VoiceforgeCallPlaybook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceforgeConsentConfig" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "consentType" TEXT NOT NULL DEFAULT 'two_party',
    "consentScript" TEXT,
    "perContactTypeToggles" JSONB NOT NULL DEFAULT '{}',
    "storageToggles" JSONB NOT NULL DEFAULT '{}',
    "autoDeleteAfterDays" INTEGER,
    "redactionToggles" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "VoiceforgeConsentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactCallPreference" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "doNotCall" BOOLEAN NOT NULL DEFAULT false,
    "preferredChannel" TEXT NOT NULL DEFAULT 'phone',
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "maxCallsPerWeek" INTEGER NOT NULL DEFAULT 3,
    "callsThisWeek" INTEGER NOT NULL DEFAULT 0,
    "lastCalledAt" TIMESTAMP(3),

    CONSTRAINT "ContactCallPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Entity_userId_idx" ON "Entity"("userId");

-- CreateIndex
CREATE INDEX "Contact_entityId_idx" ON "Contact"("entityId");

-- CreateIndex
CREATE INDEX "Contact_email_idx" ON "Contact"("email");

-- CreateIndex
CREATE INDEX "Contact_deletedAt_idx" ON "Contact"("deletedAt");

-- CreateIndex
CREATE INDEX "Task_entityId_idx" ON "Task"("entityId");

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_priority_idx" ON "Task"("priority");

-- CreateIndex
CREATE INDEX "Task_title_idx" ON "Task"("title");

-- CreateIndex
CREATE INDEX "Task_deletedAt_idx" ON "Task"("deletedAt");

-- CreateIndex
CREATE INDEX "Project_entityId_idx" ON "Project"("entityId");

-- CreateIndex
CREATE INDEX "CalendarEvent_entityId_idx" ON "CalendarEvent"("entityId");

-- CreateIndex
CREATE INDEX "CalendarEvent_startTime_idx" ON "CalendarEvent"("startTime");

-- CreateIndex
CREATE INDEX "Message_entityId_idx" ON "Message"("entityId");

-- CreateIndex
CREATE INDEX "Message_threadId_idx" ON "Message"("threadId");

-- CreateIndex
CREATE INDEX "Message_triageScore_idx" ON "Message"("triageScore");

-- CreateIndex
CREATE INDEX "Message_subject_idx" ON "Message"("subject");

-- CreateIndex
CREATE INDEX "Message_body_idx" ON "Message"("body");

-- CreateIndex
CREATE INDEX "Message_deletedAt_idx" ON "Message"("deletedAt");

-- CreateIndex
CREATE INDEX "Document_entityId_idx" ON "Document"("entityId");

-- CreateIndex
CREATE INDEX "Document_type_idx" ON "Document"("type");

-- CreateIndex
CREATE INDEX "Document_title_idx" ON "Document"("title");

-- CreateIndex
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");

-- CreateIndex
CREATE INDEX "KnowledgeEntry_entityId_idx" ON "KnowledgeEntry"("entityId");

-- CreateIndex
CREATE INDEX "KnowledgeEntry_content_idx" ON "KnowledgeEntry"("content");

-- CreateIndex
CREATE INDEX "Workflow_entityId_idx" ON "Workflow"("entityId");

-- CreateIndex
CREATE INDEX "Workflow_status_idx" ON "Workflow"("status");

-- CreateIndex
CREATE INDEX "Call_entityId_idx" ON "Call"("entityId");

-- CreateIndex
CREATE INDEX "Call_contactId_idx" ON "Call"("contactId");

-- CreateIndex
CREATE INDEX "Rule_scope_idx" ON "Rule"("scope");

-- CreateIndex
CREATE INDEX "Rule_isActive_idx" ON "Rule"("isActive");

-- CreateIndex
CREATE INDEX "ActionLog_actor_idx" ON "ActionLog"("actor");

-- CreateIndex
CREATE INDEX "ActionLog_actionType_idx" ON "ActionLog"("actionType");

-- CreateIndex
CREATE INDEX "ActionLog_timestamp_idx" ON "ActionLog"("timestamp");

-- CreateIndex
CREATE INDEX "FinancialRecord_entityId_idx" ON "FinancialRecord"("entityId");

-- CreateIndex
CREATE INDEX "FinancialRecord_type_idx" ON "FinancialRecord"("type");

-- CreateIndex
CREATE INDEX "FinancialRecord_status_idx" ON "FinancialRecord"("status");

-- CreateIndex
CREATE INDEX "ConsentReceipt_actionId_idx" ON "ConsentReceipt"("actionId");

-- CreateIndex
CREATE INDEX "MemoryEntry_userId_idx" ON "MemoryEntry"("userId");

-- CreateIndex
CREATE INDEX "MemoryEntry_type_idx" ON "MemoryEntry"("type");

-- CreateIndex
CREATE INDEX "Decision_entityId_idx" ON "Decision"("entityId");

-- CreateIndex
CREATE INDEX "Decision_status_idx" ON "Decision"("status");

-- CreateIndex
CREATE INDEX "Decision_deadline_idx" ON "Decision"("deadline");

-- CreateIndex
CREATE INDEX "Budget_entityId_idx" ON "Budget"("entityId");

-- CreateIndex
CREATE INDEX "Budget_category_idx" ON "Budget"("category");

-- CreateIndex
CREATE INDEX "Budget_status_idx" ON "Budget"("status");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_entityId_idx" ON "Notification"("entityId");

-- CreateIndex
CREATE INDEX "Notification_read_idx" ON "Notification"("read");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "VoicePersona_entityId_idx" ON "VoicePersona"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "VoicePersona_entityId_name_key" ON "VoicePersona"("entityId", "name");

-- CreateIndex
CREATE INDEX "Runbook_entityId_idx" ON "Runbook"("entityId");

-- CreateIndex
CREATE INDEX "Runbook_category_idx" ON "Runbook"("category");

-- CreateIndex
CREATE INDEX "Runbook_isActive_idx" ON "Runbook"("isActive");

-- CreateIndex
CREATE INDEX "Subscription_entityId_idx" ON "Subscription"("entityId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_stripeCustomerId_idx" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "UsageRecord_entityId_idx" ON "UsageRecord"("entityId");

-- CreateIndex
CREATE INDEX "UsageRecord_module_idx" ON "UsageRecord"("module");

-- CreateIndex
CREATE INDEX "UsageRecord_createdAt_idx" ON "UsageRecord"("createdAt");

-- CreateIndex
CREATE INDEX "HabitEntry_entityId_idx" ON "HabitEntry"("entityId");

-- CreateIndex
CREATE INDEX "HabitEntry_isActive_idx" ON "HabitEntry"("isActive");

-- CreateIndex
CREATE INDEX "HealthMetric_entityId_idx" ON "HealthMetric"("entityId");

-- CreateIndex
CREATE INDEX "HealthMetric_type_idx" ON "HealthMetric"("type");

-- CreateIndex
CREATE INDEX "HealthMetric_recordedAt_idx" ON "HealthMetric"("recordedAt");

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

-- CreateIndex
CREATE INDEX "VaultEntry_userId_idx" ON "VaultEntry"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VaultEntry_userId_label_key" ON "VaultEntry"("userId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "VaultSecret_userId_name_key" ON "VaultSecret"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "VaultKey_keyId_key" ON "VaultKey"("keyId");

-- CreateIndex
CREATE INDEX "VaultKey_userId_idx" ON "VaultKey"("userId");

-- CreateIndex
CREATE INDEX "ProvenanceRecord_userId_idx" ON "ProvenanceRecord"("userId");

-- CreateIndex
CREATE INDEX "ProvenanceRecord_outputHash_idx" ON "ProvenanceRecord"("outputHash");

-- CreateIndex
CREATE INDEX "ProvenanceRecord_entityId_idx" ON "ProvenanceRecord"("entityId");

-- CreateIndex
CREATE INDEX "ProvenanceRecord_targetType_targetId_idx" ON "ProvenanceRecord"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "WebhookConfig_userId_idx" ON "WebhookConfig"("userId");

-- CreateIndex
CREATE INDEX "WebhookEvent_webhookConfigId_idx" ON "WebhookEvent"("webhookConfigId");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_idx" ON "WebhookEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PluginRecord_userId_name_key" ON "PluginRecord"("userId", "name");

-- CreateIndex
CREATE INDEX "PluginReview_pluginRecordId_idx" ON "PluginReview"("pluginRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "DNDConfig_userId_key" ON "DNDConfig"("userId");

-- CreateIndex
CREATE INDEX "PermissionGrant_userId_idx" ON "PermissionGrant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionGrant_userId_resource_key" ON "PermissionGrant"("userId", "resource");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceConsent_userId_voiceCloneId_key" ON "VoiceConsent"("userId", "voiceCloneId");

-- CreateIndex
CREATE INDEX "FollowUpReminder_userId_idx" ON "FollowUpReminder"("userId");

-- CreateIndex
CREATE INDEX "FollowUpReminder_dueDate_idx" ON "FollowUpReminder"("dueDate");

-- CreateIndex
CREATE INDEX "CannedResponse_userId_idx" ON "CannedResponse"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CannedResponse_userId_title_key" ON "CannedResponse"("userId", "title");

-- CreateIndex
CREATE INDEX "LegalHold_entityId_idx" ON "LegalHold"("entityId");

-- CreateIndex
CREATE INDEX "LegalHold_status_idx" ON "LegalHold"("status");

-- CreateIndex
CREATE INDEX "RetentionPolicy_entityId_idx" ON "RetentionPolicy"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPolicy_entityId_dataType_key" ON "RetentionPolicy"("entityId", "dataType");

-- CreateIndex
CREATE INDEX "ShadowVoiceSession_userId_idx" ON "ShadowVoiceSession"("userId");

-- CreateIndex
CREATE INDEX "ShadowVoiceSession_status_idx" ON "ShadowVoiceSession"("status");

-- CreateIndex
CREATE INDEX "ShadowVoiceSession_activeEntityId_idx" ON "ShadowVoiceSession"("activeEntityId");

-- CreateIndex
CREATE INDEX "ShadowMessage_sessionId_idx" ON "ShadowMessage"("sessionId");

-- CreateIndex
CREATE INDEX "ShadowMessage_createdAt_idx" ON "ShadowMessage"("createdAt");

-- CreateIndex
CREATE INDEX "ShadowConsentReceipt_sessionId_idx" ON "ShadowConsentReceipt"("sessionId");

-- CreateIndex
CREATE INDEX "ShadowConsentReceipt_actionType_idx" ON "ShadowConsentReceipt"("actionType");

-- CreateIndex
CREATE INDEX "ShadowConsentReceipt_entityId_idx" ON "ShadowConsentReceipt"("entityId");

-- CreateIndex
CREATE INDEX "ShadowConsentReceipt_executedAt_idx" ON "ShadowConsentReceipt"("executedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShadowSessionOutcome_sessionId_key" ON "ShadowSessionOutcome"("sessionId");

-- CreateIndex
CREATE INDEX "ShadowTrustedDevice_userId_idx" ON "ShadowTrustedDevice"("userId");

-- CreateIndex
CREATE INDEX "ShadowTrustedDevice_phoneNumber_idx" ON "ShadowTrustedDevice"("phoneNumber");

-- CreateIndex
CREATE INDEX "ShadowAuthEvent_sessionId_idx" ON "ShadowAuthEvent"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ShadowEntityProfile_entityId_key" ON "ShadowEntityProfile"("entityId");

-- CreateIndex
CREATE INDEX "ShadowChannelEffectiveness_userId_idx" ON "ShadowChannelEffectiveness"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ShadowChannelEffectiveness_userId_channel_triggerType_key" ON "ShadowChannelEffectiveness"("userId", "channel", "triggerType");

-- CreateIndex
CREATE INDEX "ShadowTrigger_userId_idx" ON "ShadowTrigger"("userId");

-- CreateIndex
CREATE INDEX "ShadowTrigger_enabled_idx" ON "ShadowTrigger"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "ShadowPreference_userId_preferenceKey_key" ON "ShadowPreference"("userId", "preferenceKey");

-- CreateIndex
CREATE INDEX "ShadowOverrideLog_sessionId_idx" ON "ShadowOverrideLog"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ShadowRetentionConfig_entityId_key" ON "ShadowRetentionConfig"("entityId");

-- CreateIndex
CREATE INDEX "ShadowOutreach_userId_idx" ON "ShadowOutreach"("userId");

-- CreateIndex
CREATE INDEX "ShadowOutreach_status_idx" ON "ShadowOutreach"("status");

-- CreateIndex
CREATE INDEX "ShadowOutreach_createdAt_idx" ON "ShadowOutreach"("createdAt");

-- CreateIndex
CREATE INDEX "VoiceforgeCallPlaybook_entityId_idx" ON "VoiceforgeCallPlaybook"("entityId");

-- CreateIndex
CREATE INDEX "VoiceforgeConsentConfig_entityId_idx" ON "VoiceforgeConsentConfig"("entityId");

-- CreateIndex
CREATE INDEX "VoiceforgeConsentConfig_jurisdiction_idx" ON "VoiceforgeConsentConfig"("jurisdiction");

-- CreateIndex
CREATE UNIQUE INDEX "ContactCallPreference_contactId_key" ON "ContactCallPreference"("contactId");

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT "KnowledgeEntry_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRecord" ADD CONSTRAINT "FinancialRecord_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryEntry" ADD CONSTRAINT "MemoryEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoicePersona" ADD CONSTRAINT "VoicePersona_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Runbook" ADD CONSTRAINT "Runbook_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitEntry" ADD CONSTRAINT "HabitEntry_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthMetric" ADD CONSTRAINT "HealthMetric_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttentionBudget" ADD CONSTRAINT "AttentionBudget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdoptionProgress" ADD CONSTRAINT "AdoptionProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalEntry" ADD CONSTRAINT "GoalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultEntry" ADD CONSTRAINT "VaultEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultSecret" ADD CONSTRAINT "VaultSecret_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultKey" ADD CONSTRAINT "VaultKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvenanceRecord" ADD CONSTRAINT "ProvenanceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookConfig" ADD CONSTRAINT "WebhookConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_webhookConfigId_fkey" FOREIGN KEY ("webhookConfigId") REFERENCES "WebhookConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginRecord" ADD CONSTRAINT "PluginRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginReview" ADD CONSTRAINT "PluginReview_pluginRecordId_fkey" FOREIGN KEY ("pluginRecordId") REFERENCES "PluginRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DNDConfig" ADD CONSTRAINT "DNDConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionGrant" ADD CONSTRAINT "PermissionGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceConsent" ADD CONSTRAINT "VoiceConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpReminder" ADD CONSTRAINT "FollowUpReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CannedResponse" ADD CONSTRAINT "CannedResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowVoiceSession" ADD CONSTRAINT "ShadowVoiceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowVoiceSession" ADD CONSTRAINT "ShadowVoiceSession_activeEntityId_fkey" FOREIGN KEY ("activeEntityId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowMessage" ADD CONSTRAINT "ShadowMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ShadowVoiceSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowConsentReceipt" ADD CONSTRAINT "ShadowConsentReceipt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ShadowVoiceSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowSessionOutcome" ADD CONSTRAINT "ShadowSessionOutcome_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ShadowVoiceSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowTrustedDevice" ADD CONSTRAINT "ShadowTrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowAuthEvent" ADD CONSTRAINT "ShadowAuthEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ShadowVoiceSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowSafetyConfig" ADD CONSTRAINT "ShadowSafetyConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowEntityProfile" ADD CONSTRAINT "ShadowEntityProfile_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowProactiveConfig" ADD CONSTRAINT "ShadowProactiveConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowChannelEffectiveness" ADD CONSTRAINT "ShadowChannelEffectiveness_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowTrigger" ADD CONSTRAINT "ShadowTrigger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowPreference" ADD CONSTRAINT "ShadowPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowRetentionConfig" ADD CONSTRAINT "ShadowRetentionConfig_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowOutreach" ADD CONSTRAINT "ShadowOutreach_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceforgeCallPlaybook" ADD CONSTRAINT "VoiceforgeCallPlaybook_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceforgeConsentConfig" ADD CONSTRAINT "VoiceforgeConsentConfig_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactCallPreference" ADD CONSTRAINT "ContactCallPreference_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

