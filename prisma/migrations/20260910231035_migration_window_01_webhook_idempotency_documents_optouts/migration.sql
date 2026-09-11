-- AlterTable
ALTER TABLE "DNDConfig" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "InboundWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredDocument" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mimeType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoredDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredDocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "changelog" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationOptOut" (
    "id" TEXT NOT NULL,
    "entityId" TEXT,
    "channel" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'all',
    "reason" TEXT,
    "source" TEXT NOT NULL,
    "optedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationOptOut_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboundWebhookEvent_type_idx" ON "InboundWebhookEvent"("type");

-- CreateIndex
CREATE INDEX "InboundWebhookEvent_status_idx" ON "InboundWebhookEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "InboundWebhookEvent_provider_eventId_key" ON "InboundWebhookEvent"("provider", "eventId");

-- CreateIndex
CREATE INDEX "StoredDocument_entityId_idx" ON "StoredDocument"("entityId");

-- CreateIndex
CREATE INDEX "StoredDocument_category_idx" ON "StoredDocument"("category");

-- CreateIndex
CREATE INDEX "StoredDocument_deletedAt_idx" ON "StoredDocument"("deletedAt");

-- CreateIndex
CREATE INDEX "StoredDocumentVersion_documentId_idx" ON "StoredDocumentVersion"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "StoredDocumentVersion_documentId_version_key" ON "StoredDocumentVersion"("documentId", "version");

-- CreateIndex
CREATE INDEX "CommunicationOptOut_channel_address_idx" ON "CommunicationOptOut"("channel", "address");

-- CreateIndex
CREATE INDEX "CommunicationOptOut_entityId_idx" ON "CommunicationOptOut"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationOptOut_channel_address_entityId_scope_key" ON "CommunicationOptOut"("channel", "address", "entityId", "scope");

-- AddForeignKey
ALTER TABLE "StoredDocument" ADD CONSTRAINT "StoredDocument_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredDocumentVersion" ADD CONSTRAINT "StoredDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StoredDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
