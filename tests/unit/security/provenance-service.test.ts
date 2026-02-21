// ============================================================================
// ProvenanceService — Unit Tests (Prisma-backed)
// ============================================================================

import crypto from 'node:crypto';

// Mock prisma — use the path alias that the module actually imports
jest.mock('@/lib/db', () => ({
  prisma: {
    provenanceRecord: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

// Mock uuid for deterministic IDs in tests
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1'),
}));

import { prisma } from '@/lib/db';
import {
  ProvenanceService,
  type DataProvenanceEntry,
} from '@/modules/security/services/provenance-service';
import type { ProvenanceRecord } from '@/modules/security/types';
import { v4 as uuidv4 } from 'uuid';

const mockPrisma = prisma.provenanceRecord as unknown as {
  create: jest.Mock;
  findUnique: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  delete: jest.Mock;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GENESIS_HASH = '0';

function calculateExpectedHash(payload: {
  id: string;
  entityId: string;
  action: string;
  actor?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata: Record<string, unknown>;
  timestamp: Date;
  previousHash: string;
}): string {
  const canonical = JSON.stringify({
    id: payload.id,
    entityId: payload.entityId,
    action: payload.action,
    actor: payload.actor ?? null,
    targetType: payload.targetType ?? null,
    targetId: payload.targetId ?? null,
    metadata: payload.metadata,
    timestamp: payload.timestamp.toISOString(),
    previousHash: payload.previousHash,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/** Build a fake Prisma row for an AI-output provenance record */
function makeAiRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'rec-1',
    userId: null,
    entityId: null,
    targetType: null,
    targetId: null,
    inputHash: '',
    outputHash: 'output-1',
    modelId: 'gpt-4',
    promptTemplate: 'Summarize this',
    metadata: {
      recordType: 'AI_OUTPUT',
      outputType: 'SUMMARY',
      sourceDocuments: [
        {
          sourceType: 'DOCUMENT',
          sourceId: 'doc-1',
          relevanceScore: 0.9,
          excerpt: 'Some text',
        },
      ],
      confidence: 0.85,
    },
    timestamp: new Date('2026-02-15T10:00:00Z'),
    ...overrides,
  };
}

/** Build a fake Prisma row for a data-provenance entry */
function makeDataRow(overrides: Partial<Record<string, unknown>> = {}) {
  const ts = (overrides.timestamp as Date) ?? new Date('2026-02-15T12:00:00Z');
  const entityId = (overrides.entityId as string) ?? 'entity-1';
  const action = 'CREATE';
  const actor = 'user-1';
  const targetType = (overrides.targetType as string) ?? 'DOCUMENT';
  const targetId = (overrides.targetId as string) ?? 'doc-1';
  const userMetadata = { actor, targetType, targetId };
  const previousHash = (overrides.inputHash as string) ?? GENESIS_HASH;
  const id = (overrides.id as string) ?? 'entry-1';

  const hash = calculateExpectedHash({
    id,
    entityId,
    action,
    actor,
    targetType,
    targetId,
    metadata: userMetadata,
    timestamp: ts,
    previousHash,
  });

  return {
    id,
    userId: null,
    entityId,
    targetType,
    targetId,
    inputHash: previousHash,
    outputHash: hash,
    modelId: '',
    promptTemplate: null,
    metadata: {
      recordType: 'DATA_PROVENANCE',
      action,
      actor,
      userMetadata,
    },
    timestamp: ts,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProvenanceService', () => {
  let service: ProvenanceService;

  beforeEach(() => {
    service = new ProvenanceService();
    jest.clearAllMocks();
  });

  // =========================================================================
  // AI Output Provenance
  // =========================================================================

  describe('recordProvenance', () => {
    it('should create a provenance record via Prisma and return it', async () => {
      const params = {
        outputId: 'output-1',
        outputType: 'SUMMARY',
        sourceDocuments: [
          {
            sourceType: 'DOCUMENT' as const,
            sourceId: 'doc-1',
            relevanceScore: 0.9,
            excerpt: 'Some text',
          },
        ],
        modelUsed: 'gpt-4',
        prompt: 'Summarize this',
        confidence: 0.85,
      };

      const fakeRow = makeAiRow({ id: 'test-uuid-1' });
      mockPrisma.create.mockResolvedValue(fakeRow);

      const result = await service.recordProvenance(params);

      expect(mockPrisma.create).toHaveBeenCalledTimes(1);
      const callData = mockPrisma.create.mock.calls[0][0].data;
      expect(callData.id).toBe('test-uuid-1');
      expect(callData.outputHash).toBe('output-1');
      expect(callData.modelId).toBe('gpt-4');
      expect(callData.promptTemplate).toBe('Summarize this');
      expect(callData.metadata.recordType).toBe('AI_OUTPUT');
      expect(callData.metadata.sourceDocuments).toEqual(params.sourceDocuments);

      expect(result.id).toBe('test-uuid-1');
      expect(result.outputId).toBe('output-1');
      expect(result.outputType).toBe('SUMMARY');
      expect(result.sourceDocuments).toEqual(params.sourceDocuments);
      expect(result.modelUsed).toBe('gpt-4');
      expect(result.confidence).toBe(0.85);
    });
  });

  describe('getProvenance', () => {
    it('should return a record when found by outputId', async () => {
      const fakeRow = makeAiRow();
      mockPrisma.findFirst.mockResolvedValue(fakeRow);

      const result = await service.getProvenance('output-1');

      expect(mockPrisma.findFirst).toHaveBeenCalledWith({
        where: { outputHash: 'output-1' },
      });
      expect(result).not.toBeNull();
      expect(result!.outputId).toBe('output-1');
      expect(result!.outputType).toBe('SUMMARY');
    });

    it('should return null when no record is found', async () => {
      mockPrisma.findFirst.mockResolvedValue(null);

      const result = await service.getProvenance('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getSourceUsage', () => {
    it('should return records that reference a given source', async () => {
      const row1 = makeAiRow({ id: 'rec-1' });
      const row2 = makeAiRow({
        id: 'rec-2',
        metadata: {
          recordType: 'AI_OUTPUT',
          outputType: 'SUMMARY',
          sourceDocuments: [
            { sourceType: 'DOCUMENT', sourceId: 'doc-other', relevanceScore: 0.5 },
          ],
          confidence: 0.7,
        },
      });
      mockPrisma.findMany.mockResolvedValue([row1, row2]);

      const results = await service.getSourceUsage('doc-1');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('rec-1');
    });

    it('should return empty array when no records match', async () => {
      mockPrisma.findMany.mockResolvedValue([]);

      const results = await service.getSourceUsage('doc-nonexistent');

      expect(results).toHaveLength(0);
    });
  });

  describe('validateProvenance', () => {
    it('should return valid=true when all sources have non-empty sourceId', async () => {
      const fakeRow = makeAiRow();
      mockPrisma.findFirst.mockResolvedValue(fakeRow);

      const result = await service.validateProvenance('output-1');

      expect(result.valid).toBe(true);
      expect(result.missingSource).toBe(false);
      expect(result.sourceAvailable).toEqual([true]);
    });

    it('should return valid=false and missingSource=true when record not found', async () => {
      mockPrisma.findFirst.mockResolvedValue(null);

      const result = await service.validateProvenance('nonexistent');

      expect(result.valid).toBe(false);
      expect(result.missingSource).toBe(true);
      expect(result.sourceAvailable).toEqual([]);
    });

    it('should return valid=false when a source has empty sourceId', async () => {
      const row = makeAiRow({
        metadata: {
          recordType: 'AI_OUTPUT',
          outputType: 'SUMMARY',
          sourceDocuments: [
            { sourceType: 'DOCUMENT', sourceId: '', relevanceScore: 0.9 },
          ],
          confidence: 0.85,
        },
      });
      mockPrisma.findFirst.mockResolvedValue(row);

      const result = await service.validateProvenance('output-1');

      expect(result.valid).toBe(false);
      expect(result.missingSource).toBe(true);
      expect(result.sourceAvailable).toEqual([false]);
    });
  });

  // =========================================================================
  // Data Provenance (audit trail)
  // =========================================================================

  describe('recordDataProvenance', () => {
    it('should create a data provenance entry with genesis hash when no prior entries', async () => {
      mockPrisma.findFirst.mockResolvedValue(null); // no previous entry
      mockPrisma.create.mockResolvedValue({});

      const result = await service.recordDataProvenance('entity-1', 'CREATE', {
        actor: 'user-1',
        targetType: 'DOCUMENT',
        targetId: 'doc-1',
      });

      expect(mockPrisma.findFirst).toHaveBeenCalled();
      expect(mockPrisma.create).toHaveBeenCalledTimes(1);

      expect(result.entityId).toBe('entity-1');
      expect(result.action).toBe('CREATE');
      expect(result.actor).toBe('user-1');
      expect(result.previousHash).toBe(GENESIS_HASH);
      expect(result.hash).toBeTruthy();
      expect(result.id).toBe('test-uuid-1');
    });

    it('should chain to previous entry hash when prior entries exist', async () => {
      const previousRow = {
        outputHash: 'previous-hash-abc',
      };
      mockPrisma.findFirst.mockResolvedValue(previousRow);
      mockPrisma.create.mockResolvedValue({});

      const result = await service.recordDataProvenance('entity-1', 'UPDATE', {
        actor: 'user-2',
      });

      expect(result.previousHash).toBe('previous-hash-abc');
    });

    it('should store targetType and targetId from metadata', async () => {
      mockPrisma.findFirst.mockResolvedValue(null);
      mockPrisma.create.mockResolvedValue({});

      const result = await service.recordDataProvenance('entity-1', 'CREATE', {
        actor: 'user-1',
        targetType: 'DOCUMENT',
        targetId: 'doc-42',
      });

      const callData = mockPrisma.create.mock.calls[0][0].data;
      expect(callData.entityId).toBe('entity-1');
      expect(callData.targetType).toBe('DOCUMENT');
      expect(callData.targetId).toBe('doc-42');
      expect(result.targetType).toBe('DOCUMENT');
      expect(result.targetId).toBe('doc-42');
    });
  });

  describe('getProvenanceChain', () => {
    it('should return entries for a target in chronological order', async () => {
      const row1 = makeDataRow({
        id: 'e-1',
        timestamp: new Date('2026-02-15T10:00:00Z'),
      });
      const row2 = makeDataRow({
        id: 'e-2',
        timestamp: new Date('2026-02-15T11:00:00Z'),
      });
      mockPrisma.findMany.mockResolvedValue([row1, row2]);

      const chain = await service.getProvenanceChain('doc-1', 'DOCUMENT');

      expect(mockPrisma.findMany).toHaveBeenCalledWith({
        where: { targetType: 'DOCUMENT', targetId: 'doc-1' },
        orderBy: { timestamp: 'asc' },
      });
      expect(chain).toHaveLength(2);
      expect(chain[0].id).toBe('e-1');
      expect(chain[1].id).toBe('e-2');
    });

    it('should default targetType to DOCUMENT', async () => {
      mockPrisma.findMany.mockResolvedValue([]);

      await service.getProvenanceChain('doc-1');

      expect(mockPrisma.findMany).toHaveBeenCalledWith({
        where: { targetType: 'DOCUMENT', targetId: 'doc-1' },
        orderBy: { timestamp: 'asc' },
      });
    });

    it('should return empty array when no entries found', async () => {
      mockPrisma.findMany.mockResolvedValue([]);

      const chain = await service.getProvenanceChain('nonexistent');

      expect(chain).toHaveLength(0);
    });
  });

  describe('verifyIntegrity', () => {
    it('should return valid=false when record not found', async () => {
      mockPrisma.findUnique.mockResolvedValue(null);

      const result = await service.verifyIntegrity('nonexistent');

      expect(result.valid).toBe(false);
      expect(result.chainIntact).toBe(false);
      expect(result.details).toContain('not found');
      expect(result.computedHash).toBe('');
      expect(result.storedHash).toBe('');
    });

    it('should return valid=true for a valid genesis entry', async () => {
      const ts = new Date('2026-02-15T12:00:00Z');
      const metadata = { actor: 'user-1', targetType: 'DOCUMENT', targetId: 'doc-1' };
      const hash = calculateExpectedHash({
        id: 'entry-1',
        entityId: 'entity-1',
        action: 'CREATE',
        actor: 'user-1',
        targetType: 'DOCUMENT',
        targetId: 'doc-1',
        metadata,
        timestamp: ts,
        previousHash: GENESIS_HASH,
      });

      const row = {
        id: 'entry-1',
        userId: null,
        entityId: 'entity-1',
        targetType: 'DOCUMENT',
        targetId: 'doc-1',
        inputHash: GENESIS_HASH,
        outputHash: hash,
        modelId: '',
        promptTemplate: null,
        metadata: {
          recordType: 'DATA_PROVENANCE',
          action: 'CREATE',
          actor: 'user-1',
          userMetadata: metadata,
        },
        timestamp: ts,
      };

      mockPrisma.findUnique.mockResolvedValue(row);

      const result = await service.verifyIntegrity('entry-1');

      expect(result.valid).toBe(true);
      expect(result.chainIntact).toBe(true);
      expect(result.details).toContain('Hash verified');
      expect(result.details).toContain('genesis');
      expect(result.storedHash).toBe(hash);
      expect(result.computedHash).toBe(hash);
    });

    it('should return valid=false when hash has been tampered with', async () => {
      const ts = new Date('2026-02-15T12:00:00Z');
      const row = {
        id: 'entry-1',
        userId: null,
        entityId: 'entity-1',
        targetType: 'DOCUMENT',
        targetId: 'doc-1',
        inputHash: GENESIS_HASH,
        outputHash: 'tampered-hash',
        modelId: '',
        promptTemplate: null,
        metadata: {
          recordType: 'DATA_PROVENANCE',
          action: 'CREATE',
          actor: 'user-1',
          userMetadata: { actor: 'user-1', targetType: 'DOCUMENT', targetId: 'doc-1' },
        },
        timestamp: ts,
      };

      mockPrisma.findUnique.mockResolvedValue(row);

      const result = await service.verifyIntegrity('entry-1');

      expect(result.valid).toBe(false);
      expect(result.details).toContain('Hash mismatch');
      expect(result.storedHash).toBe('tampered-hash');
    });

    it('should verify chain link to predecessor when previousHash is not genesis', async () => {
      const ts1 = new Date('2026-02-15T12:00:00Z');
      const ts2 = new Date('2026-02-15T13:00:00Z');
      const metadata1 = { actor: 'user-1' };
      const metadata2 = { actor: 'user-2' };

      const hash1 = calculateExpectedHash({
        id: 'e-1',
        entityId: 'entity-1',
        action: 'CREATE',
        actor: 'user-1',
        metadata: metadata1,
        timestamp: ts1,
        previousHash: GENESIS_HASH,
      });

      const hash2 = calculateExpectedHash({
        id: 'e-2',
        entityId: 'entity-1',
        action: 'UPDATE',
        actor: 'user-2',
        metadata: metadata2,
        timestamp: ts2,
        previousHash: hash1,
      });

      const row2 = {
        id: 'e-2',
        userId: null,
        entityId: 'entity-1',
        targetType: null,
        targetId: null,
        inputHash: hash1,
        outputHash: hash2,
        modelId: '',
        promptTemplate: null,
        metadata: {
          recordType: 'DATA_PROVENANCE',
          action: 'UPDATE',
          actor: 'user-2',
          userMetadata: metadata2,
        },
        timestamp: ts2,
      };

      const chainRow1 = {
        id: 'e-1',
        userId: null,
        entityId: 'entity-1',
        targetType: null,
        targetId: null,
        inputHash: GENESIS_HASH,
        outputHash: hash1,
        modelId: '',
        promptTemplate: null,
        metadata: {
          recordType: 'DATA_PROVENANCE',
          action: 'CREATE',
          actor: 'user-1',
          userMetadata: metadata1,
        },
        timestamp: ts1,
      };

      mockPrisma.findUnique.mockResolvedValue(row2);
      mockPrisma.findMany.mockResolvedValue([chainRow1, row2]);

      const result = await service.verifyIntegrity('e-2');

      expect(result.valid).toBe(true);
      expect(result.chainIntact).toBe(true);
      expect(result.details).toContain('predecessor verified');
    });
  });

  describe('verifyChainIntegrity', () => {
    it('should return valid=true with 0 checked entries when no entries found', async () => {
      mockPrisma.findMany.mockResolvedValue([]);

      const result = await service.verifyChainIntegrity('entity-1');

      expect(result.valid).toBe(true);
      expect(result.checkedEntries).toBe(0);
      expect(result.details).toContain('No entries found');
    });

    it('should return valid=true for a consistent chain', async () => {
      const ts1 = new Date('2026-02-15T10:00:00Z');
      const ts2 = new Date('2026-02-15T11:00:00Z');
      const meta1 = { actor: 'user-1' };
      const meta2 = { actor: 'user-1' };

      const hash1 = calculateExpectedHash({
        id: 'e-1',
        entityId: 'entity-1',
        action: 'CREATE',
        actor: 'user-1',
        metadata: meta1,
        timestamp: ts1,
        previousHash: GENESIS_HASH,
      });

      const hash2 = calculateExpectedHash({
        id: 'e-2',
        entityId: 'entity-1',
        action: 'UPDATE',
        actor: 'user-1',
        metadata: meta2,
        timestamp: ts2,
        previousHash: hash1,
      });

      const rows = [
        {
          id: 'e-1',
          userId: null,
          entityId: 'entity-1',
          targetType: null,
          targetId: null,
          inputHash: GENESIS_HASH,
          outputHash: hash1,
          modelId: '',
          promptTemplate: null,
          metadata: {
            recordType: 'DATA_PROVENANCE',
            action: 'CREATE',
            actor: 'user-1',
            userMetadata: meta1,
          },
          timestamp: ts1,
        },
        {
          id: 'e-2',
          userId: null,
          entityId: 'entity-1',
          targetType: null,
          targetId: null,
          inputHash: hash1,
          outputHash: hash2,
          modelId: '',
          promptTemplate: null,
          metadata: {
            recordType: 'DATA_PROVENANCE',
            action: 'UPDATE',
            actor: 'user-1',
            userMetadata: meta2,
          },
          timestamp: ts2,
        },
      ];

      mockPrisma.findMany.mockResolvedValue(rows);

      const result = await service.verifyChainIntegrity('entity-1');

      expect(result.valid).toBe(true);
      expect(result.checkedEntries).toBe(2);
      expect(result.details).toContain('2 entries verified successfully');
    });

    it('should detect hash mismatch in the chain', async () => {
      const ts = new Date('2026-02-15T10:00:00Z');
      const rows = [
        {
          id: 'e-1',
          userId: null,
          entityId: 'entity-1',
          targetType: null,
          targetId: null,
          inputHash: GENESIS_HASH,
          outputHash: 'tampered-hash',
          modelId: '',
          promptTemplate: null,
          metadata: {
            recordType: 'DATA_PROVENANCE',
            action: 'CREATE',
            actor: 'user-1',
            userMetadata: { actor: 'user-1' },
          },
          timestamp: ts,
        },
      ];

      mockPrisma.findMany.mockResolvedValue(rows);

      const result = await service.verifyChainIntegrity('entity-1');

      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe('e-1');
      expect(result.details).toContain('Hash mismatch');
    });

    it('should detect chain link breakage between entries', async () => {
      const ts1 = new Date('2026-02-15T10:00:00Z');
      const ts2 = new Date('2026-02-15T11:00:00Z');
      const meta1 = { actor: 'user-1' };
      const meta2 = { actor: 'user-1' };

      const hash1 = calculateExpectedHash({
        id: 'e-1',
        entityId: 'entity-1',
        action: 'CREATE',
        actor: 'user-1',
        metadata: meta1,
        timestamp: ts1,
        previousHash: GENESIS_HASH,
      });

      // Entry 2 has wrong previousHash (not linked to entry 1)
      const wrongPrevHash = 'wrong-previous-hash';
      const hash2 = calculateExpectedHash({
        id: 'e-2',
        entityId: 'entity-1',
        action: 'UPDATE',
        actor: 'user-1',
        metadata: meta2,
        timestamp: ts2,
        previousHash: wrongPrevHash,
      });

      const rows = [
        {
          id: 'e-1',
          userId: null,
          entityId: 'entity-1',
          targetType: null,
          targetId: null,
          inputHash: GENESIS_HASH,
          outputHash: hash1,
          modelId: '',
          promptTemplate: null,
          metadata: {
            recordType: 'DATA_PROVENANCE',
            action: 'CREATE',
            actor: 'user-1',
            userMetadata: meta1,
          },
          timestamp: ts1,
        },
        {
          id: 'e-2',
          userId: null,
          entityId: 'entity-1',
          targetType: null,
          targetId: null,
          inputHash: wrongPrevHash,
          outputHash: hash2,
          modelId: '',
          promptTemplate: null,
          metadata: {
            recordType: 'DATA_PROVENANCE',
            action: 'UPDATE',
            actor: 'user-1',
            userMetadata: meta2,
          },
          timestamp: ts2,
        },
      ];

      mockPrisma.findMany.mockResolvedValue(rows);

      const result = await service.verifyChainIntegrity('entity-1');

      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe('e-2');
      expect(result.details).toContain('Chain link broken');
    });

    it('should filter by date range when provided', async () => {
      mockPrisma.findMany.mockResolvedValue([]);
      const from = new Date('2026-02-01');
      const to = new Date('2026-02-28');

      await service.verifyChainIntegrity('entity-1', { from, to });

      expect(mockPrisma.findMany).toHaveBeenCalledWith({
        where: {
          entityId: 'entity-1',
          timestamp: { gte: from, lte: to },
        },
        orderBy: { timestamp: 'asc' },
      });
    });
  });

  describe('getProvenanceReport', () => {
    it('should generate a report with entries, summary, and integrity check', async () => {
      const ts1 = new Date('2026-02-15T10:00:00Z');
      const ts2 = new Date('2026-02-15T11:00:00Z');
      const ts3 = new Date('2026-02-15T12:00:00Z');
      const meta1 = { actor: 'user-1' };
      const meta2 = { actor: 'user-1' };
      const meta3 = { actor: 'user-2' };

      const hash1 = calculateExpectedHash({
        id: 'e-1',
        entityId: 'entity-1',
        action: 'CREATE',
        actor: 'user-1',
        metadata: meta1,
        timestamp: ts1,
        previousHash: GENESIS_HASH,
      });
      const hash2 = calculateExpectedHash({
        id: 'e-2',
        entityId: 'entity-1',
        action: 'CREATE',
        actor: 'user-1',
        metadata: meta2,
        timestamp: ts2,
        previousHash: hash1,
      });
      const hash3 = calculateExpectedHash({
        id: 'e-3',
        entityId: 'entity-1',
        action: 'UPDATE',
        actor: 'user-2',
        metadata: meta3,
        timestamp: ts3,
        previousHash: hash2,
      });

      const rows = [
        {
          id: 'e-1', userId: null, entityId: 'entity-1',
          targetType: null, targetId: null, inputHash: GENESIS_HASH,
          outputHash: hash1, modelId: '', promptTemplate: null,
          metadata: { recordType: 'DATA_PROVENANCE', action: 'CREATE', actor: 'user-1', userMetadata: meta1 },
          timestamp: ts1,
        },
        {
          id: 'e-2', userId: null, entityId: 'entity-1',
          targetType: null, targetId: null, inputHash: hash1,
          outputHash: hash2, modelId: '', promptTemplate: null,
          metadata: { recordType: 'DATA_PROVENANCE', action: 'CREATE', actor: 'user-1', userMetadata: meta2 },
          timestamp: ts2,
        },
        {
          id: 'e-3', userId: null, entityId: 'entity-1',
          targetType: null, targetId: null, inputHash: hash2,
          outputHash: hash3, modelId: '', promptTemplate: null,
          metadata: { recordType: 'DATA_PROVENANCE', action: 'UPDATE', actor: 'user-2', userMetadata: meta3 },
          timestamp: ts3,
        },
      ];

      // getProvenanceReport calls findMany once for report, then
      // verifyChainIntegrity calls findMany again for integrity check
      mockPrisma.findMany.mockResolvedValue(rows);

      const dateRange = {
        from: new Date('2026-02-15T00:00:00Z'),
        to: new Date('2026-02-15T23:59:59Z'),
      };
      const report = await service.getProvenanceReport('entity-1', dateRange);

      expect(report.entityId).toBe('entity-1');
      expect(report.totalEvents).toBe(3);
      expect(report.entries).toHaveLength(3);
      expect(report.integrityVerified).toBe(true);
      expect(report.generatedAt).toBeInstanceOf(Date);

      // Summary: CREATE (2), UPDATE (1) — sorted by count desc
      expect(report.summary).toHaveLength(2);
      expect(report.summary[0].action).toBe('CREATE');
      expect(report.summary[0].count).toBe(2);
      expect(report.summary[0].actors).toEqual(['user-1']);
      expect(report.summary[1].action).toBe('UPDATE');
      expect(report.summary[1].count).toBe(1);
      expect(report.summary[1].actors).toEqual(['user-2']);
    });

    it('should return empty report when no entries exist for the date range', async () => {
      mockPrisma.findMany.mockResolvedValue([]);

      const dateRange = {
        from: new Date('2026-01-01'),
        to: new Date('2026-01-31'),
      };
      const report = await service.getProvenanceReport('entity-1', dateRange);

      expect(report.totalEvents).toBe(0);
      expect(report.entries).toHaveLength(0);
      expect(report.summary).toHaveLength(0);
      expect(report.integrityVerified).toBe(true);
    });
  });
});
