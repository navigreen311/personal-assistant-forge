// ============================================================================
// RetentionService — Unit Tests
// ============================================================================

import { RetentionService } from '@/modules/security/services/retention-service';

// ---------------------------------------------------------------------------
// Mocks — compatible with both default and named imports of @/lib/db.
// The service has been migrated to Prisma so we mock prisma.retentionPolicy.*
// alongside the data-model delegates used by executePolicy/previewPolicyExecution.
// ---------------------------------------------------------------------------

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    retentionPolicy: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    message: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
    actionLog: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
    document: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
    task: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
    contact: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
    call: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
    knowledgeEntry: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
  },
  prisma: {
    retentionPolicy: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    message: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
    actionLog: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
    document: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
    task: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
    contact: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
    call: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
    knowledgeEntry: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
  },
}));

jest.mock('@/modules/security/services/legal-hold-service', () => ({
  legalHoldService: {
    isRecordUnderHold: jest.fn().mockResolvedValue(false),
  },
}));

// ---------------------------------------------------------------------------
// Import mocked modules after jest.mock calls
// ---------------------------------------------------------------------------

import { prisma } from '@/lib/db';
import { legalHoldService } from '@/modules/security/services/legal-hold-service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a Prisma-shaped row that toPolicy() can consume. */
function buildPrismaPolicyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'policy-1',
    entityId: 'entity-1',
    dataType: 'Message',
    action: 'DELETE',
    retentionDays: 90,
    schedule: 'daily',
    isActive: true,
    lastExecutedAt: null,
    executionHistory: {
      __meta: {
        name: 'Delete old messages',
        classification: undefined,
        nextExecution: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      },
      history: [],
    },
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createPolicy
// ---------------------------------------------------------------------------

describe('RetentionService — createPolicy', () => {
  let service: RetentionService;

  beforeEach(() => {
    service = new RetentionService();
    jest.clearAllMocks();
  });

  it('creates a policy via Prisma and returns the mapped RetentionPolicy', async () => {
    const row = buildPrismaPolicyRow();
    (prisma.retentionPolicy.create as jest.Mock).mockResolvedValue(row);

    const policy = await service.createPolicy({
      name: 'Delete old messages',
      entityId: 'entity-1',
      dataType: 'Message',
      retentionDays: 90,
      action: 'DELETE',
      isActive: true,
    });

    expect(prisma.retentionPolicy.create).toHaveBeenCalledTimes(1);
    expect(policy).toMatchObject({
      id: 'policy-1',
      name: 'Delete old messages',
      entityId: 'entity-1',
      dataType: 'Message',
      retentionDays: 90,
      action: 'DELETE',
      isActive: true,
    });
    expect(policy.createdAt).toBeInstanceOf(Date);
  });

  it('stores name and classification in executionHistory.__meta', async () => {
    const row = buildPrismaPolicyRow({
      executionHistory: {
        __meta: { name: 'Classified Policy', classification: 'CONFIDENTIAL' },
        history: [],
      },
    });
    (prisma.retentionPolicy.create as jest.Mock).mockResolvedValue(row);

    await service.createPolicy({
      name: 'Classified Policy',
      entityId: 'entity-1',
      dataType: 'Message',
      classification: 'CONFIDENTIAL' as any,
      retentionDays: 365,
      action: 'ARCHIVE',
      isActive: true,
    });

    const createArg = (prisma.retentionPolicy.create as jest.Mock).mock.calls[0][0];
    expect(createArg.data.executionHistory.__meta.name).toBe('Classified Policy');
    expect(createArg.data.executionHistory.__meta.classification).toBe('CONFIDENTIAL');
  });
});

// ---------------------------------------------------------------------------
// getPolicy
// ---------------------------------------------------------------------------

describe('RetentionService — getPolicy', () => {
  let service: RetentionService;

  beforeEach(() => {
    service = new RetentionService();
    jest.clearAllMocks();
  });

  it('returns the policy mapped from Prisma row', async () => {
    (prisma.retentionPolicy.findUnique as jest.Mock).mockResolvedValue(
      buildPrismaPolicyRow(),
    );

    const found = await service.getPolicy('policy-1');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('policy-1');
    expect(found!.name).toBe('Delete old messages');
  });

  it('returns null for non-existent id', async () => {
    (prisma.retentionPolicy.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await service.getPolicy('does-not-exist');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listPolicies
// ---------------------------------------------------------------------------

describe('RetentionService — listPolicies', () => {
  let service: RetentionService;

  beforeEach(() => {
    service = new RetentionService();
    jest.clearAllMocks();
  });

  it('returns global + entity policies when entityId is provided', async () => {
    (prisma.retentionPolicy.findMany as jest.Mock).mockResolvedValue([
      buildPrismaPolicyRow({ id: 'p-1', entityId: '', executionHistory: { __meta: { name: 'Global Policy' }, history: [] } }),
      buildPrismaPolicyRow({ id: 'p-2', entityId: 'entity-1', executionHistory: { __meta: { name: 'Entity Policy' }, history: [] } }),
    ]);

    const policies = await service.listPolicies('entity-1');

    expect(prisma.retentionPolicy.findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ entityId: '' }, { entityId: 'entity-1' }],
      },
    });
    expect(policies).toHaveLength(2);
    const names = policies.map((p) => p.name);
    expect(names).toContain('Global Policy');
    expect(names).toContain('Entity Policy');
  });

  it('returns all policies when no entityId is provided', async () => {
    (prisma.retentionPolicy.findMany as jest.Mock).mockResolvedValue([
      buildPrismaPolicyRow({ id: 'p-1' }),
      buildPrismaPolicyRow({ id: 'p-2' }),
    ]);

    const all = await service.listPolicies();

    expect(prisma.retentionPolicy.findMany).toHaveBeenCalledWith();
    expect(all).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// updatePolicy
// ---------------------------------------------------------------------------

describe('RetentionService — updatePolicy', () => {
  let service: RetentionService;

  beforeEach(() => {
    service = new RetentionService();
    jest.clearAllMocks();
  });

  it('updates specified fields and preserves the id', async () => {
    const existingRow = buildPrismaPolicyRow();
    (prisma.retentionPolicy.findUnique as jest.Mock).mockResolvedValue(existingRow);

    const updatedRow = buildPrismaPolicyRow({
      executionHistory: {
        __meta: { name: 'Updated Name' },
        history: [],
      },
      retentionDays: 60,
      isActive: false,
    });
    (prisma.retentionPolicy.update as jest.Mock).mockResolvedValue(updatedRow);

    const updated = await service.updatePolicy('policy-1', {
      name: 'Updated Name',
      retentionDays: 60,
      isActive: false,
    });

    expect(updated.id).toBe('policy-1');
    expect(prisma.retentionPolicy.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'policy-1' } }),
    );
  });

  it('throws for non-existent policy id', async () => {
    (prisma.retentionPolicy.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.updatePolicy('ghost', { name: 'nope' })).rejects.toThrow(
      'Retention policy not found: ghost',
    );
  });
});

// ---------------------------------------------------------------------------
// deletePolicy
// ---------------------------------------------------------------------------

describe('RetentionService — deletePolicy', () => {
  let service: RetentionService;

  beforeEach(() => {
    service = new RetentionService();
    jest.clearAllMocks();
  });

  it('deletes the policy via Prisma', async () => {
    (prisma.retentionPolicy.findUnique as jest.Mock).mockResolvedValue(
      buildPrismaPolicyRow(),
    );
    (prisma.retentionPolicy.delete as jest.Mock).mockResolvedValue(
      buildPrismaPolicyRow(),
    );

    await service.deletePolicy('policy-1');

    expect(prisma.retentionPolicy.delete).toHaveBeenCalledWith({
      where: { id: 'policy-1' },
    });
  });

  it('throws for non-existent policy id', async () => {
    (prisma.retentionPolicy.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.deletePolicy('phantom')).rejects.toThrow(
      'Retention policy not found: phantom',
    );
  });
});

// ---------------------------------------------------------------------------
// executePolicy — DELETE action
// ---------------------------------------------------------------------------

describe('RetentionService — executePolicy (DELETE)', () => {
  let service: RetentionService;

  beforeEach(() => {
    service = new RetentionService();
    jest.clearAllMocks();
    (legalHoldService.isRecordUnderHold as jest.Mock).mockResolvedValue(false);
    // Mock the update call used by markPolicyExecuted
    (prisma.retentionPolicy.update as jest.Mock).mockResolvedValue(buildPrismaPolicyRow());
  });

  it('deletes old records and reports recordsDeleted', async () => {
    (prisma.retentionPolicy.findUnique as jest.Mock).mockResolvedValue(
      buildPrismaPolicyRow(),
    );

    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      { id: 'msg-1' },
      { id: 'msg-2' },
    ]);
    (prisma.message.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });

    const result = await service.executePolicy('policy-1');

    expect(result.policyId).toBe('policy-1');
    expect(result.policyName).toBe('Delete old messages');
    expect(result.recordsProcessed).toBe(2);
    expect(result.recordsDeleted).toBe(2);
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// executePolicy — ARCHIVE action
// ---------------------------------------------------------------------------

describe('RetentionService — executePolicy (ARCHIVE)', () => {
  let service: RetentionService;

  beforeEach(() => {
    service = new RetentionService();
    jest.clearAllMocks();
    (legalHoldService.isRecordUnderHold as jest.Mock).mockResolvedValue(false);
    (prisma.retentionPolicy.update as jest.Mock).mockResolvedValue(buildPrismaPolicyRow());
  });

  it('archives old records and reports recordsArchived', async () => {
    (prisma.retentionPolicy.findUnique as jest.Mock).mockResolvedValue(
      buildPrismaPolicyRow({
        dataType: 'ActionLog',
        action: 'ARCHIVE',
        retentionDays: 365,
        executionHistory: { __meta: { name: 'Archive Logs' }, history: [] },
      }),
    );

    (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([
      { id: 'log-1' },
      { id: 'log-2' },
      { id: 'log-3' },
    ]);
    (prisma.actionLog.updateMany as jest.Mock).mockResolvedValue({ count: 3 });

    const result = await service.executePolicy('policy-1');

    expect(result.recordsProcessed).toBe(3);
    expect(result.recordsArchived).toBe(3);
    expect(prisma.actionLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['log-1', 'log-2', 'log-3'] } },
        data: expect.objectContaining({ status: 'ARCHIVED' }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// executePolicy — ANONYMIZE action
// ---------------------------------------------------------------------------

describe('RetentionService — executePolicy (ANONYMIZE)', () => {
  let service: RetentionService;

  beforeEach(() => {
    service = new RetentionService();
    jest.clearAllMocks();
    (legalHoldService.isRecordUnderHold as jest.Mock).mockResolvedValue(false);
    (prisma.retentionPolicy.update as jest.Mock).mockResolvedValue(buildPrismaPolicyRow());
  });

  it('anonymizes old records and reports recordsAnonymized', async () => {
    (prisma.retentionPolicy.findUnique as jest.Mock).mockResolvedValue(
      buildPrismaPolicyRow({
        dataType: 'Contact',
        action: 'ANONYMIZE',
        retentionDays: 730,
        executionHistory: { __meta: { name: 'Anonymize Contacts' }, history: [] },
      }),
    );

    (prisma.contact.findMany as jest.Mock).mockResolvedValue([
      { id: 'contact-1' },
      { id: 'contact-2' },
    ]);
    (prisma.contact.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

    const result = await service.executePolicy('policy-1');

    expect(result.recordsProcessed).toBe(2);
    expect(result.recordsAnonymized).toBe(2);
    expect(prisma.contact.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: '[ANONYMIZED]',
          email: '[ANONYMIZED]',
          phone: '[ANONYMIZED]',
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// executePolicy — Legal hold skip
// ---------------------------------------------------------------------------

describe('RetentionService — executePolicy (legal hold)', () => {
  let service: RetentionService;

  beforeEach(() => {
    service = new RetentionService();
    jest.clearAllMocks();
    (prisma.retentionPolicy.update as jest.Mock).mockResolvedValue(buildPrismaPolicyRow());
  });

  it('skips records under legal hold', async () => {
    (prisma.retentionPolicy.findUnique as jest.Mock).mockResolvedValue(
      buildPrismaPolicyRow({
        retentionDays: 30,
        executionHistory: { __meta: { name: 'Delete with hold' }, history: [] },
      }),
    );

    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      { id: 'msg-held' },
      { id: 'msg-free' },
    ]);

    (legalHoldService.isRecordUnderHold as jest.Mock)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    (prisma.message.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    const result = await service.executePolicy('policy-1');

    expect(result.recordsProcessed).toBe(1);
    expect(result.recordsDeleted).toBe(1);
    expect(prisma.message.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['msg-free'] } },
    });
  });

  it('records an error and skips when legal hold check throws', async () => {
    (prisma.retentionPolicy.findUnique as jest.Mock).mockResolvedValue(
      buildPrismaPolicyRow({
        retentionDays: 30,
        executionHistory: { __meta: { name: 'Hold error test' }, history: [] },
      }),
    );

    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      { id: 'msg-err' },
      { id: 'msg-ok' },
    ]);

    (legalHoldService.isRecordUnderHold as jest.Mock)
      .mockRejectedValueOnce(new Error('DB down'))
      .mockResolvedValueOnce(false);

    (prisma.message.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    const result = await service.executePolicy('policy-1');

    expect(result.recordsProcessed).toBe(1);
    expect(result.recordsDeleted).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Legal hold check failed');
    expect(result.errors[0]).toContain('msg-err');
  });
});

// ---------------------------------------------------------------------------
// executePolicy — error cases
// ---------------------------------------------------------------------------

describe('RetentionService — executePolicy (errors)', () => {
  let service: RetentionService;

  beforeEach(() => {
    service = new RetentionService();
    jest.clearAllMocks();
    (legalHoldService.isRecordUnderHold as jest.Mock).mockResolvedValue(false);
    (prisma.retentionPolicy.update as jest.Mock).mockResolvedValue(buildPrismaPolicyRow());
  });

  it('throws when policy id does not exist', async () => {
    (prisma.retentionPolicy.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.executePolicy('nonexistent')).rejects.toThrow(
      'Retention policy not found: nonexistent',
    );
  });

  it('reports 0 processed and no mutations when no records match', async () => {
    (prisma.retentionPolicy.findUnique as jest.Mock).mockResolvedValue(
      buildPrismaPolicyRow(),
    );

    (prisma.message.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.executePolicy('policy-1');

    expect(result.recordsProcessed).toBe(0);
    expect(result.recordsDeleted).toBe(0);
    expect(prisma.message.deleteMany).not.toHaveBeenCalled();
  });

  it('captures Prisma errors in result.errors without throwing', async () => {
    (prisma.retentionPolicy.findUnique as jest.Mock).mockResolvedValue(
      buildPrismaPolicyRow(),
    );

    (prisma.message.findMany as jest.Mock).mockRejectedValue(
      new Error('Connection refused'),
    );

    const result = await service.executePolicy('policy-1');

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Policy execution failed');
    expect(result.errors[0]).toContain('Connection refused');
  });
});

// ---------------------------------------------------------------------------
// previewPolicyExecution
// ---------------------------------------------------------------------------

describe('RetentionService — previewPolicyExecution', () => {
  let service: RetentionService;

  beforeEach(() => {
    service = new RetentionService();
    jest.clearAllMocks();
    (legalHoldService.isRecordUnderHold as jest.Mock).mockResolvedValue(false);
  });

  it('returns count without executing (deleteMany/updateMany NOT called)', async () => {
    (prisma.retentionPolicy.findUnique as jest.Mock).mockResolvedValue(
      buildPrismaPolicyRow({
        retentionDays: 60,
        executionHistory: { __meta: { name: 'Preview Policy' }, history: [] },
      }),
    );

    const oldDate = new Date('2024-01-01');
    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      { id: 'msg-1', createdAt: oldDate },
      { id: 'msg-2', createdAt: oldDate },
      { id: 'msg-3', createdAt: new Date('2024-06-01') },
    ]);

    const preview = await service.previewPolicyExecution('policy-1');

    expect(preview.recordCount).toBe(3);
    expect(preview.dataTypes).toContain('Message');
    expect(preview.oldestRecord).toEqual(oldDate);
    expect(preview.legalHoldConflicts).toBe(0);

    expect(prisma.message.deleteMany).not.toHaveBeenCalled();
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
  });

  it('counts legal hold conflicts in preview', async () => {
    (prisma.retentionPolicy.findUnique as jest.Mock).mockResolvedValue(
      buildPrismaPolicyRow({
        dataType: 'Document',
        retentionDays: 30,
        executionHistory: { __meta: { name: 'Preview with holds' }, history: [] },
      }),
    );

    (prisma.document.findMany as jest.Mock).mockResolvedValue([
      { id: 'doc-1', createdAt: new Date('2024-01-01') },
      { id: 'doc-2', createdAt: new Date('2024-02-01') },
    ]);

    (legalHoldService.isRecordUnderHold as jest.Mock)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const preview = await service.previewPolicyExecution('policy-1');

    expect(preview.recordCount).toBe(2);
    expect(preview.legalHoldConflicts).toBe(1);
  });

  it('throws for non-existent policy id', async () => {
    (prisma.retentionPolicy.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.previewPolicyExecution('ghost')).rejects.toThrow(
      'Retention policy not found: ghost',
    );
  });
});

// ---------------------------------------------------------------------------
// createDefaultPolicies
// ---------------------------------------------------------------------------

describe('RetentionService — createDefaultPolicies', () => {
  let service: RetentionService;

  beforeEach(() => {
    service = new RetentionService();
    jest.clearAllMocks();
  });

  it('creates 4 default policies', async () => {
    let callCount = 0;
    (prisma.retentionPolicy.create as jest.Mock).mockImplementation(() => {
      callCount++;
      const names = [
        'ActionLog Retention (365 days)',
        'Public Messages Retention (180 days)',
        'Confidential+ Messages Retention (730 days)',
        'Temporary Files Retention (30 days)',
      ];
      return Promise.resolve(
        buildPrismaPolicyRow({
          id: `policy-${callCount}`,
          entityId: 'entity-defaults',
          executionHistory: {
            __meta: { name: names[callCount - 1] },
            history: [],
          },
        }),
      );
    });

    const policies = await service.createDefaultPolicies('entity-defaults');

    expect(policies).toHaveLength(4);
    expect(prisma.retentionPolicy.create).toHaveBeenCalledTimes(4);

    const names = policies.map((p) => p.name);
    expect(names).toContain('ActionLog Retention (365 days)');
    expect(names).toContain('Public Messages Retention (180 days)');
    expect(names).toContain('Confidential+ Messages Retention (730 days)');
    expect(names).toContain('Temporary Files Retention (30 days)');

    for (const policy of policies) {
      expect(policy.entityId).toBe('entity-defaults');
      expect(policy.id).toBeDefined();
      expect(policy.createdAt).toBeInstanceOf(Date);
    }
  });
});

// ---------------------------------------------------------------------------
// executeAllDuePolicies
// ---------------------------------------------------------------------------

describe('RetentionService — executeAllDuePolicies', () => {
  let service: RetentionService;

  beforeEach(() => {
    service = new RetentionService();
    jest.clearAllMocks();
    (legalHoldService.isRecordUnderHold as jest.Mock).mockResolvedValue(false);
    (prisma.retentionPolicy.update as jest.Mock).mockResolvedValue(buildPrismaPolicyRow());
  });

  it('executes only active policies with nextExecution in the past', async () => {
    const pastDate = new Date(Date.now() - 1000).toISOString();

    // findMany for active policies
    (prisma.retentionPolicy.findMany as jest.Mock).mockResolvedValue([
      buildPrismaPolicyRow({
        id: 'due-policy',
        executionHistory: {
          __meta: { name: 'Due Policy', nextExecution: pastDate },
          history: [],
        },
      }),
      buildPrismaPolicyRow({
        id: 'future-policy',
        executionHistory: {
          __meta: {
            name: 'Future Policy',
            nextExecution: new Date(Date.now() + 999999999).toISOString(),
          },
          history: [],
        },
      }),
    ]);

    // findUnique for the due policy when executePolicy is called
    (prisma.retentionPolicy.findUnique as jest.Mock).mockResolvedValue(
      buildPrismaPolicyRow({
        id: 'due-policy',
        executionHistory: {
          __meta: { name: 'Due Policy', nextExecution: pastDate },
          history: [],
        },
      }),
    );

    (prisma.message.findMany as jest.Mock).mockResolvedValue([]);

    const results = await service.executeAllDuePolicies();

    expect(results).toHaveLength(1);
    expect(results[0].policyName).toBe('Due Policy');
  });

  it('returns empty array when no policies are due', async () => {
    (prisma.retentionPolicy.findMany as jest.Mock).mockResolvedValue([
      buildPrismaPolicyRow({
        id: 'not-due',
        executionHistory: {
          __meta: {
            name: 'Not Due',
            nextExecution: new Date(Date.now() + 999999999).toISOString(),
          },
          history: [],
        },
      }),
    ]);

    const results = await service.executeAllDuePolicies();
    expect(results).toEqual([]);
  });
});
