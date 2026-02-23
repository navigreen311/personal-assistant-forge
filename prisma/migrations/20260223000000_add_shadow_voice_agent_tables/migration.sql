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
CREATE UNIQUE INDEX "ShadowChannelEffectiveness_userId_channel_triggerType_key" ON "ShadowChannelEffectiveness"("userId", "channel", "triggerType");

-- CreateIndex
CREATE INDEX "ShadowChannelEffectiveness_userId_idx" ON "ShadowChannelEffectiveness"("userId");

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
