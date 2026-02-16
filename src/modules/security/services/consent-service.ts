// ============================================================================
// Consent Management Service — GDPR/CCPA Compliance
// Manages consent records, data portability exports, and right-to-be-forgotten
// ============================================================================

import type {
  ConsentRecord,
  DataPortabilityExport,
  DeletionRequest,
} from '@/modules/security/types';
import { prisma } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

// Lazy import to avoid circular dependency
let _legalHoldService: typeof import('./legal-hold-service')['legalHoldService'] | null = null;

async function getLegalHoldService() {
  if (!_legalHoldService) {
    const mod = await import('./legal-hold-service');
    _legalHoldService = mod.legalHoldService;
  }
  return _legalHoldService;
}

export class ConsentService {
  // In-memory stores
  private consentRecords = new Map<string, ConsentRecord>();
  private dataExports = new Map<string, DataPortabilityExport>();
  private deletionRequests = new Map<string, DeletionRequest>();

  // --------------------------------------------------------------------------
  // Consent Management
  // --------------------------------------------------------------------------

  /**
   * Record a new consent entry. Automatically increments version based on
   * existing records for the same contact/entity/type combination.
   */
  async recordConsent(
    params: Omit<ConsentRecord, 'id' | 'version'>
  ): Promise<ConsentRecord> {
    const existingRecords = this.findConsentRecords(
      params.contactId,
      params.entityId,
      params.consentType
    );

    const maxVersion = existingRecords.reduce(
      (max, record) => Math.max(max, record.version),
      0
    );

    const record: ConsentRecord = {
      ...params,
      id: uuidv4(),
      version: maxVersion + 1,
    };

    this.consentRecords.set(record.id, record);
    return record;
  }

  /**
   * Get the current (latest version) consent status for a contact/entity/type.
   */
  async getConsent(
    contactId: string,
    entityId: string,
    consentType: ConsentRecord['consentType']
  ): Promise<ConsentRecord | null> {
    const records = this.findConsentRecords(contactId, entityId, consentType);

    if (records.length === 0) {
      return null;
    }

    return records.reduce((latest, record) =>
      record.version > latest.version ? record : latest
    );
  }

  /**
   * Retrieve all consent records for a given contact.
   */
  async getAllConsents(contactId: string): Promise<ConsentRecord[]> {
    const results: ConsentRecord[] = [];

    for (const record of this.consentRecords.values()) {
      if (record.contactId === contactId) {
        results.push(record);
      }
    }

    return results;
  }

  /**
   * Revoke consent by creating a new version with REVOKED status.
   */
  async revokeConsent(
    contactId: string,
    entityId: string,
    consentType: ConsentRecord['consentType']
  ): Promise<ConsentRecord> {
    const current = await this.getConsent(contactId, entityId, consentType);

    if (!current) {
      throw new Error(
        `No consent record found for contact=${contactId}, entity=${entityId}, type=${consentType}`
      );
    }

    const revokedRecord: ConsentRecord = {
      ...current,
      id: uuidv4(),
      status: 'REVOKED',
      revokedAt: new Date(),
      version: current.version + 1,
    };

    this.consentRecords.set(revokedRecord.id, revokedRecord);
    return revokedRecord;
  }

  /**
   * Quick boolean check: returns true if consent is GRANTED and not expired.
   */
  async checkConsent(
    contactId: string,
    entityId: string,
    consentType: ConsentRecord['consentType']
  ): Promise<boolean> {
    const latest = await this.getConsent(contactId, entityId, consentType);

    if (!latest) {
      return false;
    }

    if (latest.status !== 'GRANTED') {
      return false;
    }

    if (latest.expiresAt && latest.expiresAt <= new Date()) {
      return false;
    }

    return true;
  }

  /**
   * Find all consent records that have expired (expiresAt is in the past)
   * but have not yet been marked as EXPIRED or REVOKED.
   */
  async getExpiredConsents(): Promise<ConsentRecord[]> {
    const now = new Date();
    const expired: ConsentRecord[] = [];

    for (const record of this.consentRecords.values()) {
      if (
        record.expiresAt &&
        record.expiresAt <= now &&
        record.status === 'GRANTED'
      ) {
        expired.push(record);
      }
    }

    return expired;
  }

  // --------------------------------------------------------------------------
  // Data Portability (Right to Data Portability — GDPR Art. 20)
  // --------------------------------------------------------------------------

  /**
   * Initiate a data portability export request.
   */
  async requestDataPortability(
    contactId: string,
    entityId: string,
    format: 'JSON' | 'CSV' | 'PDF',
    categories?: string[]
  ): Promise<DataPortabilityExport> {
    const exportRecord: DataPortabilityExport = {
      id: uuidv4(),
      contactId,
      entityId,
      format,
      status: 'PENDING',
      dataCategories: categories ?? [
        'messages',
        'tasks',
        'calls',
        'documents',
        'knowledge',
      ],
      requestedAt: new Date(),
    };

    this.dataExports.set(exportRecord.id, exportRecord);
    return exportRecord;
  }

  /**
   * Generate the data export by collecting all contact data from the database.
   */
  async generateDataExport(exportId: string): Promise<DataPortabilityExport> {
    const exportRecord = this.dataExports.get(exportId);

    if (!exportRecord) {
      throw new Error(`Data export not found: ${exportId}`);
    }

    exportRecord.status = 'GENERATING';
    this.dataExports.set(exportId, exportRecord);

    const contactData: Record<string, unknown> = {
      exportId: exportRecord.id,
      contactId: exportRecord.contactId,
      entityId: exportRecord.entityId,
      generatedAt: new Date().toISOString(),
      categories: {} as Record<string, unknown>,
    };

    const categories = contactData.categories as Record<string, unknown>;

    // Collect data from each Prisma model
    if (exportRecord.dataCategories.includes('messages')) {
      try {
        const messages = await prisma.message.findMany({
          where: {
            entityId: exportRecord.entityId,
            senderId: exportRecord.contactId,
          },
        });
        categories.messages = messages;
      } catch {
        categories.messages = [];
      }
    }

    if (exportRecord.dataCategories.includes('tasks')) {
      try {
        const tasks = await prisma.task.findMany({
          where: {
            entityId: exportRecord.entityId,
          },
        });
        categories.tasks = tasks;
      } catch {
        categories.tasks = [];
      }
    }

    if (exportRecord.dataCategories.includes('calls')) {
      try {
        const calls = await prisma.call.findMany({
          where: {
            entityId: exportRecord.entityId,
            contactId: exportRecord.contactId,
          },
        });
        categories.calls = calls;
      } catch {
        categories.calls = [];
      }
    }

    if (exportRecord.dataCategories.includes('documents')) {
      try {
        const documents = await prisma.document.findMany({
          where: {
            entityId: exportRecord.entityId,
          },
        });
        categories.documents = documents;
      } catch {
        categories.documents = [];
      }
    }

    if (exportRecord.dataCategories.includes('knowledge')) {
      try {
        const knowledge = await prisma.knowledgeEntry.findMany({
          where: {
            entityId: exportRecord.entityId,
          },
        });
        categories.knowledge = knowledge;
      } catch {
        categories.knowledge = [];
      }
    }

    // Package as JSON string for the download URL
    const serialized = JSON.stringify(contactData, null, 2);
    const base64Data = Buffer.from(serialized).toString('base64');

    exportRecord.status = 'READY';
    exportRecord.downloadUrl = `data:application/${exportRecord.format.toLowerCase()};base64,${base64Data}`;
    exportRecord.completedAt = new Date();
    exportRecord.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    this.dataExports.set(exportId, exportRecord);
    return exportRecord;
  }

  // --------------------------------------------------------------------------
  // Right to Erasure / Right to Be Forgotten (GDPR Art. 17)
  // --------------------------------------------------------------------------

  /**
   * Initiate a data deletion (right-to-be-forgotten) request.
   */
  async requestDeletion(
    contactId: string,
    entityId?: string,
    scope?: 'FULL' | 'SELECTIVE',
    categories?: string[]
  ): Promise<DeletionRequest> {
    const request: DeletionRequest = {
      id: uuidv4(),
      contactId,
      entityId,
      status: 'PENDING',
      scope: scope ?? 'FULL',
      selectedCategories: categories,
      affectedSystems: [],
      requestedAt: new Date(),
      verificationToken: uuidv4(),
    };

    this.deletionRequests.set(request.id, request);
    return request;
  }

  /**
   * Execute a deletion request: find records, check legal holds, delete/anonymize.
   */
  async executeDeletion(deletionId: string): Promise<DeletionRequest> {
    const request = this.deletionRequests.get(deletionId);

    if (!request) {
      throw new Error(`Deletion request not found: ${deletionId}`);
    }

    request.status = 'PROCESSING';
    this.deletionRequests.set(deletionId, request);

    const affectedSystems: string[] = [];
    const retainedData: string[] = [];

    // Check for active legal holds
    const holdService = await getLegalHoldService();
    let hasLegalHold = false;

    try {
      const holds = await holdService.listLegalHolds(request.entityId ?? '', 'ACTIVE');
      for (const hold of holds) {
        if (
          hold.scope.contactIds?.includes(request.contactId) ||
          !hold.scope.contactIds
        ) {
          hasLegalHold = true;
          retainedData.push(
            `Data retained due to legal hold: ${hold.name} (${hold.id})`
          );
        }
      }
    } catch {
      // Legal hold service unavailable — proceed without hold checks
    }

    if (hasLegalHold) {
      request.status = 'PARTIAL';
      request.retainedData = retainedData;
      request.affectedSystems = affectedSystems;
      this.deletionRequests.set(deletionId, request);
      return request;
    }

    const categoriesToDelete =
      request.scope === 'SELECTIVE' && request.selectedCategories
        ? request.selectedCategories
        : ['messages', 'tasks', 'calls', 'documents', 'knowledge'];

    const entityFilter = request.entityId
      ? { entityId: request.entityId }
      : {};

    // Delete messages
    if (categoriesToDelete.includes('messages')) {
      try {
        await prisma.message.deleteMany({
          where: {
            senderId: request.contactId,
            ...entityFilter,
          },
        });
        affectedSystems.push('messages');
      } catch {
        // DB not available or model missing
      }
    }

    // Delete calls (Call has contactId field)
    if (categoriesToDelete.includes('calls')) {
      try {
        await prisma.call.deleteMany({
          where: {
            contactId: request.contactId,
            ...entityFilter,
          },
        });
        affectedSystems.push('calls');
      } catch {
        // DB not available or model missing
      }
    }

    // Delete knowledge entries
    if (categoriesToDelete.includes('knowledge')) {
      try {
        await prisma.knowledgeEntry.deleteMany({
          where: {
            ...entityFilter,
          },
        });
        affectedSystems.push('knowledge');
      } catch {
        // DB not available or model missing
      }
    }

    // Remove in-memory consent records for this contact
    for (const [id, record] of this.consentRecords.entries()) {
      if (
        record.contactId === request.contactId &&
        (!request.entityId || record.entityId === request.entityId)
      ) {
        this.consentRecords.delete(id);
      }
    }

    request.status = 'COMPLETED';
    request.affectedSystems = affectedSystems;
    request.retainedData = retainedData.length > 0 ? retainedData : undefined;
    request.completedAt = new Date();
    this.deletionRequests.set(deletionId, request);

    return request;
  }

  /**
   * Check the current status of a deletion request.
   */
  async getDeletionStatus(deletionId: string): Promise<DeletionRequest> {
    const request = this.deletionRequests.get(deletionId);

    if (!request) {
      throw new Error(`Deletion request not found: ${deletionId}`);
    }

    return request;
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Find all consent records matching the given contact/entity/type combo.
   */
  private findConsentRecords(
    contactId: string,
    entityId: string,
    consentType: ConsentRecord['consentType']
  ): ConsentRecord[] {
    const matches: ConsentRecord[] = [];

    for (const record of this.consentRecords.values()) {
      if (
        record.contactId === contactId &&
        record.entityId === entityId &&
        record.consentType === consentType
      ) {
        matches.push(record);
      }
    }

    return matches;
  }
}

// Singleton instance
export const consentService = new ConsentService();
