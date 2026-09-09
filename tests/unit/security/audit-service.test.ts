// ============================================================================
// AuditService — Unit Tests
//
// P-10/T-002. The service now writes to `AuditLogEntry` in Postgres instead of a
// process array, so this file stands a small in-memory fake behind exactly the
// Prisma delegates it uses. Nothing else about the assertions moved, except the
// two tampering tests -- see the note on them, which is the interesting part.
// ============================================================================

interface FakeAuditRow {
  id: string;
  timestamp: Date;
  actor: string;
  actorId: string | null;
  action: string;
  resource: string;
  resourceId: string;
  entityId: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestMethod: string;
  requestPath: string;
  statusCode: number;
  sensitivityLevel: string;
  details: Record<string, unknown>;
  hash: string | null;
  previousHash: string | null;
}

const auditRows: FakeAuditRow[] = [];
let auditSeq = 0;

interface FakeWhere {
  entityId?: string;
  actor?: string;
  resource?: string;
  sensitivityLevel?: string;
  timestamp?: { gte?: Date; lte?: Date };
}

function matches(row: FakeAuditRow, where: FakeWhere = {}): boolean {
  if (where.entityId !== undefined && row.entityId !== where.entityId) return false;
  if (where.actor !== undefined && row.actor !== where.actor) return false;
  if (where.resource !== undefined && row.resource !== where.resource) return false;
  if (where.sensitivityLevel !== undefined && row.sensitivityLevel !== where.sensitivityLevel) return false;
  if (where.timestamp?.gte && row.timestamp < where.timestamp.gte) return false;
  if (where.timestamp?.lte && row.timestamp > where.timestamp.lte) return false;
  return true;
}

/** Insertion order is chronological here; ids break ties the same way. */
function ordered(rows: FakeAuditRow[], desc: boolean): FakeAuditRow[] {
  const sorted = [...rows].sort((a, b) => {
    const t = a.timestamp.getTime() - b.timestamp.getTime();
    return t !== 0 ? t : a.id.localeCompare(b.id);
  });
  return desc ? sorted.reverse() : sorted;
}

function isDescending(orderBy: unknown): boolean {
  const first = Array.isArray(orderBy) ? orderBy[0] : orderBy;
  return (first as { timestamp?: string } | undefined)?.timestamp === 'desc';
}

const auditLogEntryDelegate = {
  create: jest.fn(async ({ data }: { data: Omit<FakeAuditRow, 'id'> }) => {
    auditSeq += 1;
    const row: FakeAuditRow = { ...data, id: `audit-${String(auditSeq).padStart(4, '0')}` };
    auditRows.push(row);
    return row;
  }),
  findFirst: jest.fn(async ({ where, orderBy }: { where?: FakeWhere; orderBy?: unknown } = {}) => {
    const hits = ordered(auditRows.filter((r) => matches(r, where)), isDescending(orderBy));
    return hits[0] ?? null;
  }),
  findMany: jest.fn(async ({
    where,
    orderBy,
    skip = 0,
    take,
  }: { where?: FakeWhere; orderBy?: unknown; skip?: number; take?: number } = {}) => {
    const hits = ordered(auditRows.filter((r) => matches(r, where)), isDescending(orderBy));
    return take === undefined ? hits.slice(skip) : hits.slice(skip, skip + take);
  }),
  count: jest.fn(async ({ where }: { where?: FakeWhere } = {}) =>
    auditRows.filter((r) => matches(r, where)).length),
};

jest.mock('@/lib/db', () => ({
  prisma: {
    auditLogEntry: auditLogEntryDelegate,
    // logAuditEntry serialises the tail read and the insert inside one
    // transaction holding an advisory lock. The fake is single-threaded, so it
    // just runs the callback against the same delegates.
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ auditLogEntry: auditLogEntryDelegate, $executeRaw: jest.fn(async () => 1) })),
  },
}));

/**
 * Edit a STORED row, the way an attacker with database access would.
 *
 * The old tests "tampered" by mutating the object the service had handed back
 * (`second.details.info = 'tampered'`), which only did anything because it was
 * the same array element the service still held. Against a real table that
 * mutation is a no-op on a detached copy and the chain verifies as valid --
 * so the tampering tests would have passed for the wrong reason, reporting a
 * tamper-evident log that had not been asked to detect any tampering.
 */
function tamperStoredRow(id: string, patch: Partial<FakeAuditRow>): void {
  const row = auditRows.find((r) => r.id === id);
  if (!row) throw new Error(`no stored audit row ${id}`);
  Object.assign(row, patch);
}

beforeEach(() => {
  auditRows.length = 0;
  auditSeq = 0;
});

import { AuditService } from '@/modules/security/services/audit-service';

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockRejectedValue(new Error('AI unavailable in test')),
}));

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

      // Tamper with the STORED second entry. See tamperStoredRow above.
      tamperStoredRow(second.id, { details: { info: 'tampered' } });

      const to = new Date(Date.now() + 60_000);
      const result = await service.verifyAuditChain('entity-1', { from, to });

      expect(result.valid).toBe(false);
    });

    it('should report the entry where the chain breaks', async () => {
      const from = new Date(Date.now() - 60_000);

      await service.logAuditEntry(baseEntryParams({ action: 'CREATE' }));
      const second = await service.logAuditEntry(baseEntryParams({ action: 'READ' }));
      await service.logAuditEntry(baseEntryParams({ action: 'UPDATE' }));

      // Tamper with the STORED second entry.
      tamperStoredRow(second.id, { details: { info: 'tampered' } });

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

  // -----------------------------------------------------------------------
  // analyzeAuditTrail — AI-powered anomaly detection
  // -----------------------------------------------------------------------
  describe('analyzeAuditTrail', () => {
    const { generateJSON } = jest.requireMock('@/lib/ai') as { generateJSON: jest.Mock };

    let service: AuditService;

    beforeEach(() => {
      service = new AuditService();
      generateJSON.mockReset();
      generateJSON.mockRejectedValue(new Error('AI unavailable in test'));
    });

    it('should analyze audit trail for anomalies', async () => {
      const from = new Date(Date.now() - 60_000);

      await service.logAuditEntry(baseEntryParams({ action: 'CREATE' }));
      await service.logAuditEntry(baseEntryParams({ action: 'DELETE' }));
      await service.logAuditEntry(baseEntryParams({ action: 'BULK_DELETE' }));

      const to = new Date(Date.now() + 60_000);

      generateJSON.mockResolvedValueOnce({
        anomalies: [{ description: 'Bulk delete detected', severity: 'HIGH', eventIndices: [2] }],
        summary: 'Suspicious bulk operation detected',
        riskScore: 75,
      });

      const result = await service.analyzeAuditTrail('entity-1', { from, to });

      expect(generateJSON).toHaveBeenCalled();
      expect(result.anomalies.length).toBe(1);
      expect(result.anomalies[0].severity).toBe('HIGH');
      expect(result.riskScore).toBe(75);
    });

    it('should return structured anomaly alerts', async () => {
      const from = new Date(Date.now() - 60_000);
      await service.logAuditEntry(baseEntryParams());
      const to = new Date(Date.now() + 60_000);

      generateJSON.mockResolvedValueOnce({
        anomalies: [
          { description: 'Off-hours access', severity: 'MEDIUM', eventIndices: [0] },
        ],
        summary: 'Minor anomaly detected',
        riskScore: 30,
      });

      const result = await service.analyzeAuditTrail('entity-1', { from, to });

      expect(result.anomalies[0].description).toBe('Off-hours access');
      expect(result.summary).toBe('Minor anomaly detected');
      expect(result.riskScore).toBe(30);
    });

    it('should handle AI failure with empty result', async () => {
      const from = new Date(Date.now() - 60_000);
      await service.logAuditEntry(baseEntryParams());
      const to = new Date(Date.now() + 60_000);

      generateJSON.mockRejectedValueOnce(new Error('AI error'));

      const result = await service.analyzeAuditTrail('entity-1', { from, to });

      expect(result.anomalies).toEqual([]);
      expect(result.riskScore).toBe(0);
    });

    it('should return empty result for empty time window', async () => {
      const from = new Date('2000-01-01');
      const to = new Date('2000-01-02');

      const result = await service.analyzeAuditTrail('entity-1', { from, to });

      expect(result.anomalies).toEqual([]);
      expect(result.riskScore).toBe(0);
      expect(generateJSON).not.toHaveBeenCalled();
    });
  });
});
