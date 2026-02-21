// ============================================================================
// LegalHoldService — Unit Tests
// ============================================================================

import { LegalHoldService } from '@/modules/security/services/legal-hold-service';

// ---------------------------------------------------------------------------
// Mocks — compatible with both default and named imports of @/lib/db.
// The service has been migrated to Prisma so we mock prisma.legalHold.*
// alongside the data-model delegates used by fetchRecord/queryModelRecords.
// ---------------------------------------------------------------------------

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    legalHold: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    message: { findUnique: jest.fn(), findMany: jest.fn() },
    task: { findUnique: jest.fn(), findMany: jest.fn() },
    document: { findUnique: jest.fn(), findMany: jest.fn() },
    call: { findUnique: jest.fn(), findMany: jest.fn() },
    contact: { findUnique: jest.fn(), findMany: jest.fn() },
    actionLog: { findUnique: jest.fn(), findMany: jest.fn() },
    knowledgeEntry: { findUnique: jest.fn(), findMany: jest.fn() },
  },
  prisma: {
    legalHold: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    message: { findUnique: jest.fn(), findMany: jest.fn() },
    task: { findUnique: jest.fn(), findMany: jest.fn() },
    document: { findUnique: jest.fn(), findMany: jest.fn() },
    call: { findUnique: jest.fn(), findMany: jest.fn() },
    contact: { findUnique: jest.fn(), findMany: jest.fn() },
    actionLog: { findUnique: jest.fn(), findMany: jest.fn() },
    knowledgeEntry: { findUnique: jest.fn(), findMany: jest.fn() },
  },
}));

// ---------------------------------------------------------------------------
// Import mocked prisma after jest.mock
// ---------------------------------------------------------------------------

import { prisma } from '@/lib/db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a Prisma-shaped row that toHold() can consume. */
function buildPrismaHoldRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hold-1',
    entityId: 'entity-1',
    reason: 'Litigation hold for pending case',
    scope: { __name: 'Test Hold' },
    status: 'ACTIVE',
    createdBy: 'admin-1',
    releasedBy: null,
    createdAt: new Date('2025-01-01'),
    releasedAt: null,
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createLegalHold
// ---------------------------------------------------------------------------

describe('LegalHoldService — createLegalHold', () => {
  let service: LegalHoldService;

  beforeEach(() => {
    service = new LegalHoldService();
    jest.clearAllMocks();
  });

  it('creates a hold via Prisma and returns the mapped LegalHold', async () => {
    const row = buildPrismaHoldRow();
    (prisma.legalHold.create as jest.Mock).mockResolvedValue(row);

    const hold = await service.createLegalHold({
      name: 'Test Hold',
      entityId: 'entity-1',
      reason: 'Litigation hold for pending case',
      scope: {},
      status: 'ACTIVE',
      createdBy: 'admin-1',
    });

    expect(prisma.legalHold.create).toHaveBeenCalledTimes(1);
    expect(hold.id).toBe('hold-1');
    expect(hold.entityId).toBe('entity-1');
    expect(hold.status).toBe('ACTIVE');
    expect(hold.createdAt).toBeInstanceOf(Date);
    expect(hold.releasedAt).toBeUndefined();
  });

  it('stores the name inside the scope JSON payload', async () => {
    const row = buildPrismaHoldRow({ scope: { __name: 'Custom Hold', dataTypes: ['Message'] } });
    (prisma.legalHold.create as jest.Mock).mockResolvedValue(row);

    const hold = await service.createLegalHold({
      name: 'Custom Hold',
      entityId: 'entity-1',
      reason: 'Regulatory inquiry',
      scope: { dataTypes: ['Message'] },
      status: 'ACTIVE',
      createdBy: 'legal-team',
    });

    // The create call should embed __name in scope
    const createArg = (prisma.legalHold.create as jest.Mock).mock.calls[0][0];
    expect(createArg.data.scope.__name).toBe('Custom Hold');
    expect(hold.name).toBe('Custom Hold');
  });
});

// ---------------------------------------------------------------------------
// releaseLegalHold
// ---------------------------------------------------------------------------

describe('LegalHoldService — releaseLegalHold', () => {
  let service: LegalHoldService;

  beforeEach(() => {
    service = new LegalHoldService();
    jest.clearAllMocks();
  });

  it('sets status to RELEASED and records releasedAt', async () => {
    (prisma.legalHold.findUnique as jest.Mock).mockResolvedValue(
      buildPrismaHoldRow(),
    );

    const releasedRow = buildPrismaHoldRow({
      status: 'RELEASED',
      releasedAt: new Date('2025-06-01'),
    });
    (prisma.legalHold.update as jest.Mock).mockResolvedValue(releasedRow);

    const released = await service.releaseLegalHold('hold-1');

    expect(prisma.legalHold.update).toHaveBeenCalledWith({
      where: { id: 'hold-1' },
      data: expect.objectContaining({ status: 'RELEASED' }),
    });
    expect(released.status).toBe('RELEASED');
    expect(released.releasedAt).toBeInstanceOf(Date);
  });

  it('throws for a non-existent hold id', async () => {
    (prisma.legalHold.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.releaseLegalHold('non-existent')).rejects.toThrow(
      'Legal hold not found: non-existent',
    );
  });
});

// ---------------------------------------------------------------------------
// getLegalHold
// ---------------------------------------------------------------------------

describe('LegalHoldService — getLegalHold', () => {
  let service: LegalHoldService;

  beforeEach(() => {
    service = new LegalHoldService();
    jest.clearAllMocks();
  });

  it('returns the hold mapped from Prisma row', async () => {
    (prisma.legalHold.findUnique as jest.Mock).mockResolvedValue(
      buildPrismaHoldRow({ scope: { __name: 'Find Me' } }),
    );

    const found = await service.getLegalHold('hold-1');

    expect(found).not.toBeNull();
    expect(found!.id).toBe('hold-1');
    expect(found!.name).toBe('Find Me');
  });

  it('returns null for non-existent id', async () => {
    (prisma.legalHold.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await service.getLegalHold('does-not-exist');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listLegalHolds
// ---------------------------------------------------------------------------

describe('LegalHoldService — listLegalHolds', () => {
  let service: LegalHoldService;

  beforeEach(() => {
    service = new LegalHoldService();
    jest.clearAllMocks();
  });

  it('queries Prisma with entityId and optional status filter', async () => {
    (prisma.legalHold.findMany as jest.Mock).mockResolvedValue([
      buildPrismaHoldRow({ id: 'h-1', scope: { __name: 'Hold A' } }),
      buildPrismaHoldRow({ id: 'h-2', scope: { __name: 'Hold B' } }),
    ]);

    const results = await service.listLegalHolds('entity-1', 'ACTIVE');

    expect(prisma.legalHold.findMany).toHaveBeenCalledWith({
      where: { entityId: 'entity-1', status: 'ACTIVE' },
    });
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('Hold A');
  });

  it('omits status filter when not provided', async () => {
    (prisma.legalHold.findMany as jest.Mock).mockResolvedValue([]);

    await service.listLegalHolds('entity-1');

    expect(prisma.legalHold.findMany).toHaveBeenCalledWith({
      where: { entityId: 'entity-1' },
    });
  });

  it('returns empty array when no holds match', async () => {
    (prisma.legalHold.findMany as jest.Mock).mockResolvedValue([]);

    const results = await service.listLegalHolds('entity-999');
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// isRecordUnderHold — Prisma-dependent path
// ---------------------------------------------------------------------------

describe('LegalHoldService — isRecordUnderHold', () => {
  let service: LegalHoldService;

  beforeEach(() => {
    service = new LegalHoldService();
    jest.clearAllMocks();
  });

  it('returns false when the record does not exist', async () => {
    (prisma.message.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await service.isRecordUnderHold('Message', 'msg-nonexistent');

    expect(result).toBe(false);
  });

  it('returns false when the record has no entityId', async () => {
    (prisma.message.findUnique as jest.Mock).mockResolvedValue({
      id: 'msg-1',
      createdAt: new Date(),
      // no entityId
    });

    const result = await service.isRecordUnderHold('Message', 'msg-1');

    expect(result).toBe(false);
  });

  it('returns true when a blanket hold (empty scope) covers the entity', async () => {
    // fetchRecord returns a message with entityId
    (prisma.message.findUnique as jest.Mock).mockResolvedValue({
      id: 'msg-1',
      entityId: 'entity-1',
      createdAt: new Date(),
    });

    // listLegalHolds returns an active blanket hold
    (prisma.legalHold.findMany as jest.Mock).mockResolvedValue([
      buildPrismaHoldRow({ scope: {} }),
    ]);

    const result = await service.isRecordUnderHold('Message', 'msg-1');

    expect(result).toBe(true);
  });

  it('returns false when hold scope dataTypes do not include the model', async () => {
    (prisma.message.findUnique as jest.Mock).mockResolvedValue({
      id: 'msg-1',
      entityId: 'entity-1',
      createdAt: new Date(),
    });

    (prisma.legalHold.findMany as jest.Mock).mockResolvedValue([
      buildPrismaHoldRow({ scope: { dataTypes: ['Document'] } }),
    ]);

    const result = await service.isRecordUnderHold('Message', 'msg-1');

    expect(result).toBe(false);
  });

  it('returns true when scope keyword matches record content (case-insensitive)', async () => {
    (prisma.message.findUnique as jest.Mock).mockResolvedValue({
      id: 'msg-1',
      entityId: 'entity-1',
      createdAt: new Date(),
      body: 'This is a PRIVILEGED communication',
    });

    (prisma.legalHold.findMany as jest.Mock).mockResolvedValue([
      buildPrismaHoldRow({ scope: { keywords: ['privileged'] } }),
    ]);

    const result = await service.isRecordUnderHold('Message', 'msg-1');

    expect(result).toBe(true);
  });

  it('returns false when scope keyword does not match any content field', async () => {
    (prisma.message.findUnique as jest.Mock).mockResolvedValue({
      id: 'msg-1',
      entityId: 'entity-1',
      createdAt: new Date(),
      body: 'Nothing relevant here',
    });

    (prisma.legalHold.findMany as jest.Mock).mockResolvedValue([
      buildPrismaHoldRow({ scope: { keywords: ['classified'] } }),
    ]);

    const result = await service.isRecordUnderHold('Message', 'msg-1');

    expect(result).toBe(false);
  });

  it('returns false for unsupported model names (fetchRecord returns null)', async () => {
    const result = await service.isRecordUnderHold('UnknownModel', 'rec-1');

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// exportForDiscovery
// ---------------------------------------------------------------------------

describe('LegalHoldService — exportForDiscovery', () => {
  let service: LegalHoldService;

  beforeEach(() => {
    service = new LegalHoldService();
    jest.clearAllMocks();
    // Default: return empty arrays for all data-model findMany mocks
    for (const key of ['message', 'task', 'document', 'call', 'contact', 'actionLog', 'knowledgeEntry'] as const) {
      (prisma[key].findMany as jest.Mock).mockResolvedValue([]);
    }
  });

  it('exports in JSON format with correct record count', async () => {
    (prisma.legalHold.findUnique as jest.Mock).mockResolvedValue(
      buildPrismaHoldRow({ scope: { __name: 'Export Hold', dataTypes: ['Message'] } }),
    );

    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'msg-1',
        entityId: 'entity-1',
        createdAt: new Date(),
        body: 'Test message',
      },
    ]);

    const result = await service.exportForDiscovery('hold-1', 'JSON');

    expect(result.recordCount).toBe(1);
    const parsed = JSON.parse(result.data);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toHaveProperty('model', 'Message');
    expect(parsed[0]).toHaveProperty('recordId', 'msg-1');
  });

  it('exports in CSV format with header row', async () => {
    (prisma.legalHold.findUnique as jest.Mock).mockResolvedValue(
      buildPrismaHoldRow({ scope: { __name: 'CSV Hold', dataTypes: ['Message'] } }),
    );

    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'msg-1',
        entityId: 'entity-1',
        createdAt: new Date(),
        body: 'Hello world',
      },
    ]);

    const result = await service.exportForDiscovery('hold-1', 'CSV');

    expect(result.recordCount).toBe(1);
    const lines = result.data.split('\n');
    expect(lines[0]).toBe('model,recordId,reason');
    expect(lines.length).toBe(2); // header + 1 data row
    expect(lines[1]).toContain('Message');
    expect(lines[1]).toContain('msg-1');
  });

  it('throws for non-existent hold id', async () => {
    (prisma.legalHold.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      service.exportForDiscovery('non-existent', 'JSON'),
    ).rejects.toThrow('Legal hold not found: non-existent');
  });
});

// ---------------------------------------------------------------------------
// getHeldRecords — scope matching integration
// ---------------------------------------------------------------------------

describe('LegalHoldService — getHeldRecords', () => {
  let service: LegalHoldService;

  beforeEach(() => {
    service = new LegalHoldService();
    jest.clearAllMocks();
    // Default: return empty arrays for all data-model findMany mocks
    for (const key of ['message', 'task', 'document', 'call', 'contact', 'actionLog', 'knowledgeEntry'] as const) {
      (prisma[key].findMany as jest.Mock).mockResolvedValue([]);
    }
  });

  it('throws for non-existent hold', async () => {
    (prisma.legalHold.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.getHeldRecords('non-existent')).rejects.toThrow(
      'Legal hold not found: non-existent',
    );
  });

  it('returns matching records with keyword reasons for scoped holds', async () => {
    (prisma.legalHold.findUnique as jest.Mock).mockResolvedValue(
      buildPrismaHoldRow({
        scope: { __name: 'Scoped Hold', dataTypes: ['Message'], keywords: ['secret'] },
      }),
    );

    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'msg-match',
        entityId: 'entity-1',
        createdAt: new Date(),
        body: 'This is a secret document',
      },
      {
        id: 'msg-no-match',
        entityId: 'entity-1',
        createdAt: new Date(),
        body: 'Nothing interesting here',
      },
    ]);

    const results = await service.getHeldRecords('hold-1');

    // Only the record containing 'secret' should match
    expect(results).toHaveLength(1);
    expect(results[0].recordId).toBe('msg-match');
    expect(results[0].model).toBe('Message');
    expect(results[0].reason).toContain('Keyword match');
    expect(results[0].reason).toContain('secret');
  });

  it('returns all records for blanket holds (empty scope)', async () => {
    (prisma.legalHold.findUnique as jest.Mock).mockResolvedValue(
      buildPrismaHoldRow({ scope: { __name: 'Blanket Hold' } }),
    );

    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      { id: 'msg-1', entityId: 'entity-1', createdAt: new Date() },
      { id: 'msg-2', entityId: 'entity-1', createdAt: new Date() },
    ]);

    const results = await service.getHeldRecords('hold-1');

    // Blanket hold matches everything — at minimum the 2 messages
    const messageResults = results.filter((r) => r.model === 'Message');
    expect(messageResults).toHaveLength(2);
    expect(messageResults[0].reason).toContain('Blanket hold');
  });
});
