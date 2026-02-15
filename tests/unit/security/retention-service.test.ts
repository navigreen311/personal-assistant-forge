// ============================================================================
// RetentionService — Unit Tests
// ============================================================================

import { RetentionService } from '@/modules/security/services/retention-service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    message: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
    actionLog: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
    document: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
    task: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
    contact: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
    call: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
    knowledgeEntry: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
  },
  prisma: {
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
// createPolicy
// ---------------------------------------------------------------------------

describe('RetentionService — createPolicy', () => {
  const service = new RetentionService();

  it('creates a policy with correct fields', () => {
    const policy = service.createPolicy({
      name: 'Delete old messages',
      entityId: 'entity-1',
      dataType: 'Message',
      retentionDays: 90,
      action: 'DELETE',
      isActive: true,
    });

    expect(policy).toMatchObject({
      name: 'Delete old messages',
      entityId: 'entity-1',
      dataType: 'Message',
      retentionDays: 90,
      action: 'DELETE',
      isActive: true,
    });
    expect(policy.id).toBeDefined();
    expect(policy.createdAt).toBeInstanceOf(Date);
    expect(policy.nextExecution).toBeInstanceOf(Date);
    expect(policy.lastExecuted).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getPolicy
// ---------------------------------------------------------------------------

describe('RetentionService — getPolicy', () => {
  const service = new RetentionService();

  it('returns the policy by id', () => {
    const created = service.createPolicy({
      name: 'Test Policy',
      dataType: 'Message',
      retentionDays: 30,
      action: 'DELETE',
      isActive: true,
    });

    const found = service.getPolicy(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.name).toBe('Test Policy');
  });

  it('returns null for non-existent id', () => {
    expect(service.getPolicy('does-not-exist')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listPolicies
// ---------------------------------------------------------------------------

describe('RetentionService — listPolicies', () => {
  const service = new RetentionService();

  it('returns global + entity policies', () => {
    // Global policy (no entityId)
    service.createPolicy({
      name: 'Global Policy',
      dataType: 'Message',
      retentionDays: 365,
      action: 'ARCHIVE',
      isActive: true,
    });

    // Entity-scoped policy
    service.createPolicy({
      name: 'Entity Policy',
      entityId: 'entity-1',
      dataType: 'Document',
      retentionDays: 30,
      action: 'DELETE',
      isActive: true,
    });

    // Policy for a different entity
    service.createPolicy({
      name: 'Other Entity Policy',
      entityId: 'entity-2',
      dataType: 'Task',
      retentionDays: 60,
      action: 'ANONYMIZE',
      isActive: true,
    });

    const entity1Policies = service.listPolicies('entity-1');

    // Should include the global policy (no entityId) + entity-1's own policy
    // Should NOT include entity-2's policy
    expect(entity1Policies).toHaveLength(2);
    const names = entity1Policies.map((p) => p.name);
    expect(names).toContain('Global Policy');
    expect(names).toContain('Entity Policy');
    expect(names).not.toContain('Other Entity Policy');
  });
});

// ---------------------------------------------------------------------------
// executePolicy — DELETE action
// ---------------------------------------------------------------------------

describe('RetentionService — executePolicy (DELETE)', () => {
  const service = new RetentionService();

  beforeEach(() => {
    jest.clearAllMocks();
    (legalHoldService.isRecordUnderHold as jest.Mock).mockResolvedValue(false);
  });

  it('deletes old records and reports recordsDeleted', async () => {
    const policy = service.createPolicy({
      name: 'Delete Messages',
      dataType: 'Message',
      retentionDays: 90,
      action: 'DELETE',
      isActive: true,
    });

    // Mock findMany to return stale records
    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      { id: 'msg-1' },
      { id: 'msg-2' },
    ]);

    // Mock deleteMany to confirm deletion count
    (prisma.message.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });

    const result = await service.executePolicy(policy.id);

    expect(result.policyId).toBe(policy.id);
    expect(result.policyName).toBe('Delete Messages');
    expect(result.recordsProcessed).toBe(2);
    expect(result.recordsDeleted).toBe(2);
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// executePolicy — ARCHIVE action
// ---------------------------------------------------------------------------

describe('RetentionService — executePolicy (ARCHIVE)', () => {
  const service = new RetentionService();

  beforeEach(() => {
    jest.clearAllMocks();
    (legalHoldService.isRecordUnderHold as jest.Mock).mockResolvedValue(false);
  });

  it('archives old records and reports recordsArchived', async () => {
    const policy = service.createPolicy({
      name: 'Archive Logs',
      dataType: 'ActionLog',
      retentionDays: 365,
      action: 'ARCHIVE',
      isActive: true,
    });

    (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([
      { id: 'log-1' },
      { id: 'log-2' },
      { id: 'log-3' },
    ]);

    (prisma.actionLog.updateMany as jest.Mock).mockResolvedValue({ count: 3 });

    const result = await service.executePolicy(policy.id);

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
  const service = new RetentionService();

  beforeEach(() => {
    jest.clearAllMocks();
    (legalHoldService.isRecordUnderHold as jest.Mock).mockResolvedValue(false);
  });

  it('anonymizes old records and reports recordsAnonymized', async () => {
    const policy = service.createPolicy({
      name: 'Anonymize Contacts',
      dataType: 'Contact',
      retentionDays: 730,
      action: 'ANONYMIZE',
      isActive: true,
    });

    (prisma.contact.findMany as jest.Mock).mockResolvedValue([
      { id: 'contact-1' },
      { id: 'contact-2' },
    ]);

    (prisma.contact.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

    const result = await service.executePolicy(policy.id);

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
  const service = new RetentionService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips records under legal hold', async () => {
    const policy = service.createPolicy({
      name: 'Delete with hold',
      dataType: 'Message',
      retentionDays: 30,
      action: 'DELETE',
      isActive: true,
    });

    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      { id: 'msg-held' },
      { id: 'msg-free' },
    ]);

    // First record is under hold, second is not
    (legalHoldService.isRecordUnderHold as jest.Mock)
      .mockResolvedValueOnce(true)   // msg-held — under hold
      .mockResolvedValueOnce(false); // msg-free — eligible

    (prisma.message.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    const result = await service.executePolicy(policy.id);

    // Only the non-held record should be processed
    expect(result.recordsProcessed).toBe(1);
    expect(result.recordsDeleted).toBe(1);

    // deleteMany should only receive the eligible record id
    expect(prisma.message.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['msg-free'] } },
    });
  });
});

// ---------------------------------------------------------------------------
// previewPolicyExecution
// ---------------------------------------------------------------------------

describe('RetentionService — previewPolicyExecution', () => {
  const service = new RetentionService();

  beforeEach(() => {
    jest.clearAllMocks();
    (legalHoldService.isRecordUnderHold as jest.Mock).mockResolvedValue(false);
  });

  it('returns count without executing (deleteMany/updateMany NOT called)', async () => {
    const policy = service.createPolicy({
      name: 'Preview Policy',
      dataType: 'Message',
      retentionDays: 60,
      action: 'DELETE',
      isActive: true,
    });

    const oldDate = new Date('2024-01-01');
    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      { id: 'msg-1', createdAt: oldDate },
      { id: 'msg-2', createdAt: oldDate },
      { id: 'msg-3', createdAt: new Date('2024-06-01') },
    ]);

    const preview = await service.previewPolicyExecution(policy.id);

    expect(preview.recordCount).toBe(3);
    expect(preview.dataTypes).toContain('Message');
    expect(preview.oldestRecord).toEqual(oldDate);
    expect(preview.legalHoldConflicts).toBe(0);

    // Verify no mutation operations were called
    expect(prisma.message.deleteMany).not.toHaveBeenCalled();
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createDefaultPolicies
// ---------------------------------------------------------------------------

describe('RetentionService — createDefaultPolicies', () => {
  const service = new RetentionService();

  it('creates 4 default policies', () => {
    const policies = service.createDefaultPolicies('entity-defaults');

    expect(policies).toHaveLength(4);

    const names = policies.map((p) => p.name);
    expect(names).toContain('ActionLog Retention (365 days)');
    expect(names).toContain('Public Messages Retention (180 days)');
    expect(names).toContain('Confidential+ Messages Retention (730 days)');
    expect(names).toContain('Temporary Files Retention (30 days)');

    // All should be active and have an entityId
    for (const policy of policies) {
      expect(policy.isActive).toBe(true);
      expect(policy.entityId).toBe('entity-defaults');
      expect(policy.id).toBeDefined();
      expect(policy.createdAt).toBeInstanceOf(Date);
    }
  });
});
