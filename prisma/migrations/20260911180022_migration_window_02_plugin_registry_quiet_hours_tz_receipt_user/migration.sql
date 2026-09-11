-- AlterTable
ALTER TABLE "ContactCallPreference" ADD COLUMN     "quietHoursTimezone" TEXT;

-- AlterTable
ALTER TABLE "PluginRecord" ADD COLUMN     "registryId" TEXT;

-- AlterTable
ALTER TABLE "ShadowConsentReceipt" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "PluginRecord_registryId_idx" ON "PluginRecord"("registryId");

-- CreateIndex
CREATE INDEX "ShadowConsentReceipt_userId_idx" ON "ShadowConsentReceipt"("userId");
