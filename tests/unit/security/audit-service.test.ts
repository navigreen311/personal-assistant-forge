// ============================================================================
// AuditService — Unit Tests
// ============================================================================

import { AuditService } from '@/modules/security/services/audit-service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shared base params for creating audit entries. */
function baseEntryParams(overrides: Record<string, unknown> = {}) {
  return {
    actor: 'user-1',
    actorId: 'user-1',
    action: 'READ',
    resource: '/api/contacts',
    resourceId: 'contact-1',
    entityId: 'entity-1',
    requestMethod: 'GET',
    requestPath: '/api/contacts',
    statusCode: 200,
    sensitivityLevel: 'INTERNAL' as const,
    details: { info: 'test' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuditService', () => {
  // -----------------------------------------------------------------------
  // logAuditEntry
  // -----------------------------------------------------------------------
  describe('logAuditEntry', () => {
    let service: AuditService;

    beforeEach(() => {
      service = new AuditService();
    });

    it('should create an entry with a SHA-256 hash (64-char hex string)', async () => {
      const entry = await service.logAuditEntry(baseEntryParams());

      expect(entry.hash).toBeDefined();
      expect(typeof entry.hash).toBe('string');
      expect(entry.hash).toHaveLength(64);
      expect(entry.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should chain to the previous entry hash', async () => {
      const first = await service.logAuditEntry(baseEntryParams({ action: 'CREATE' }));
      const second = await service.logAuditEntry(baseEntryParams({ action: 'UPDATE' }));

      expect(second.previousHash).toBe(first.hash);
    });

    it('should set a timestamp that is a Date instance', async () => {
      const entry = await service.logAuditEntry(baseEntryParams());

      expect(entry.timestamp).toBeInstanceOf(Date);
    });
  });

  // -----------------------------------------------------------------------
  // verifyAuditChain
  // -----------------------------------------------------------------------
  describe('verifyAuditChain', () => {
    let service: AuditService;

    beforeEach(() => {
      service = new AuditService();
    });

    it('should return valid for an untampered chain', async () => {
      const from = new Date(Date.now() - 60_000);

      await service.logAuditEntry(baseEntryParams({ action: 'CREATE' }));
      await service.logAuditEntry(baseEntryParams({ action: 'READ' }));
      await service.logAuditEntry(baseEntryParams({ action: 'UPDATE' }));

      const to = new Date(Date.now() + 60_000);

      const result = await service.verifyAuditChain('entity-1', { from, to });

      expect(result.valid).toBe(true);
      expect(result.checkedEntries).toBe(3);
      expect(result.brokenAt).toBeUndefined();
    });

    it('should detect tampering when an entry details field is modified', async () => {
      const from = new Date(Date.now() - 60_000);

      const first = await service.logAuditEntry(baseEntryParams({ action: 'CREATE' }));
      const second = await service.logAuditEntry(baseEntryParams({ action: 'READ' }));
      await service.logAuditEntry(baseEntryParams({ action: 'UPDATE' }));

      // Tamper with the second entry's details
      (second.details as Record<string, unknown>).info = 'tampered';

      const to = new Date(Date.now() + 60_000);
      const result = await service.verifyAuditChain('entity-1', { from, to });

      expect(result.valid).toBe(false);
    });

    it('should report the entry where the chain breaks', async () => {
      const from = new Date(Date.now() - 60_000);

      await service.logAuditEntry(baseEntryParams({ action: 'CREATE' }));
      const second = await service.logAuditEntry(baseEntryParams({ action: 'READ' }));
      await service.logAuditEntry(baseEntryParams({ action: 'UPDATE' }));

      // Tamper with the second entry
      (second.details as Record<string, unknown>).info = 'tampered';

      const to = new Date(Date.now() + 60_000);
      const result = await service.verifyAuditChain('entity-1', { from, to });

      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(second.id);
    });
  });

  // -----------------------------------------------------------------------
  // getAuditLog
  // -----------------------------------------------------------------------
  describe('getAuditLog', () => {
    let service: AuditService;

    beforeEach(() => {
      service = new AuditService();
    });

    it('should filter by entity', async () => {
      await service.logAuditEntry(baseEntryParams({ entityId: 'entity-A' }));
      await service.logAuditEntry(baseEntryParams({ entityId: 'entity-B' }));
      await service.logAuditEntry(baseEntryParams({ entityId: 'entity-A' }));

      const result = await service.getAuditLog({ entityId: 'entity-A' });

      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
      result.data.forEach((entry) => {
        expect(entry.entityId).toBe('entity-A');
      });
    });

    it('should filter by date range', async () => {
      // Create entries with deterministic timing
      const now = Date.now();

      // Log entries — they get "now" timestamps internally
      await service.logAuditEntry(baseEntryParams({ action: 'early' }));

      // Access the internal entries to set custom timestamps for testing
      const log1 = await service.getAuditLog({});
      // All entries have recent timestamps — use a range that captures them
      const from = new Date(now - 60_000);
      const to = new Date(now + 60_000);

      const result = await service.getAuditLog({ dateRange: { from, to } });
      expect(result.total).toBeGreaterThan(0);

      // Use a range that excludes all entries
      const farPast = new Date('2000-01-01');
      const farPastEnd = new Date('2000-01-02');
      const emptyResult = await service.getAuditLog({
        dateRange: { from: farPast, to: farPastEnd },
      });
      expect(emptyResult.total).toBe(0);
    });

    it('should filter by sensitivity level', async () => {
      await service.logAuditEntry(
        baseEntryParams({ sensitivityLevel: 'INTERNAL' }),
      );
      await service.logAuditEntry(
        baseEntryParams({ sensitivityLevel: 'RESTRICTED' }),
      );
      await service.logAuditEntry(
        baseEntryParams({ sensitivityLevel: 'INTERNAL' }),
      );

      const result = await service.getAuditLog({
        sensitivityLevel: 'RESTRICTED',
      });

      expect(result.total).toBe(1);
      expect(result.data[0].sensitivityLevel).toBe('RESTRICTED');
    });

    it('should paginate results correctly', async () => {
      // Log 10 entries
      for (let i = 0; i < 10; i++) {
        await service.logAuditEntry(
          baseEntryParams({ action: `action-${i}` }),
        );
      }

      const page1 = await service.getAuditLog({}, 1, 3);
      expect(page1.data).toHaveLength(3);
      expect(page1.total).toBe(10);

      const page2 = await service.getAuditLog({}, 2, 3);
      expect(page2.data).toHaveLength(3);
      expect(page2.total).toBe(10);

      // Last page should have 1 entry (10 - 3*3 = 1)
      const page4 = await service.getAuditLog({}, 4, 3);
      expect(page4.data).toHaveLength(1);
      expect(page4.total).toBe(10);
    });
  });
});
