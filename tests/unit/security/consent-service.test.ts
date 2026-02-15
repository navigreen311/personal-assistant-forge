// ============================================================================
// ConsentService — Unit Tests
// Tests consent management, data deletion, and right-to-be-forgotten flows
// ============================================================================

import { ConsentService } from '@/modules/security/services/consent-service';

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    message: { findMany: jest.fn(), deleteMany: jest.fn() },
    task: { findMany: jest.fn(), deleteMany: jest.fn() },
    call: { findMany: jest.fn(), deleteMany: jest.fn() },
    document: { findMany: jest.fn(), deleteMany: jest.fn() },
    knowledgeEntry: { findMany: jest.fn(), deleteMany: jest.fn() },
  },
  prisma: {
    message: { findMany: jest.fn(), deleteMany: jest.fn() },
    task: { findMany: jest.fn(), deleteMany: jest.fn() },
    call: { findMany: jest.fn(), deleteMany: jest.fn() },
    document: { findMany: jest.fn(), deleteMany: jest.fn() },
    knowledgeEntry: { findMany: jest.fn(), deleteMany: jest.fn() },
  },
}));

jest.mock('@/modules/security/services/legal-hold-service', () => ({
  legalHoldService: {
    listLegalHolds: jest.fn().mockResolvedValue([]),
  },
}));

// Re-import mocks so we can manipulate them per test
import { prisma } from '@/lib/db';
import { legalHoldService } from '@/modules/security/services/legal-hold-service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONTACT_ID = 'contact-001';
const ENTITY_ID = 'entity-001';
const CONSENT_TYPE = 'DATA_PROCESSING' as const;

function baseConsentParams(overrides: Record<string, unknown> = {}) {
  return {
    contactId: CONTACT_ID,
    entityId: ENTITY_ID,
    consentType: CONSENT_TYPE,
    status: 'GRANTED' as const,
    method: 'EXPLICIT' as const,
    purpose: 'Process personal data for service delivery',
    grantedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// recordConsent
// ---------------------------------------------------------------------------

describe('ConsentService — recordConsent', () => {
  let service: ConsentService;

  beforeEach(() => {
    service = new ConsentService();
  });

  it('creates a consent record with GRANTED status', async () => {
    const params = baseConsentParams();
    const record = await service.recordConsent(params);

    expect(record).toBeDefined();
    expect(record.id).toBeDefined();
    expect(record.status).toBe('GRANTED');
    expect(record.contactId).toBe(CONTACT_ID);
    expect(record.entityId).toBe(ENTITY_ID);
    expect(record.consentType).toBe(CONSENT_TYPE);
    expect(record.version).toBe(1);
  });

  it('auto-increments version for the same contact/entity/type combination', async () => {
    const params = baseConsentParams();

    const first = await service.recordConsent(params);
    expect(first.version).toBe(1);

    const second = await service.recordConsent(params);
    expect(second.version).toBe(2);

    // IDs should be different
    expect(first.id).not.toBe(second.id);
  });
});

// ---------------------------------------------------------------------------
// checkConsent
// ---------------------------------------------------------------------------

describe('ConsentService — checkConsent', () => {
  let service: ConsentService;

  beforeEach(() => {
    service = new ConsentService();
  });

  it('returns true for granted consent', async () => {
    await service.recordConsent(baseConsentParams({ status: 'GRANTED' }));

    const result = await service.checkConsent(CONTACT_ID, ENTITY_ID, CONSENT_TYPE);
    expect(result).toBe(true);
  });

  it('returns false for revoked consent', async () => {
    // First grant, then revoke
    await service.recordConsent(baseConsentParams({ status: 'GRANTED' }));
    await service.revokeConsent(CONTACT_ID, ENTITY_ID, CONSENT_TYPE);

    const result = await service.checkConsent(CONTACT_ID, ENTITY_ID, CONSENT_TYPE);
    expect(result).toBe(false);
  });

  it('returns false for expired consent', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
    await service.recordConsent(
      baseConsentParams({
        status: 'GRANTED',
        expiresAt: pastDate,
      }),
    );

    const result = await service.checkConsent(CONTACT_ID, ENTITY_ID, CONSENT_TYPE);
    expect(result).toBe(false);
  });

  it('returns false when no consent record exists', async () => {
    const result = await service.checkConsent('nonexistent-contact', ENTITY_ID, CONSENT_TYPE);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// revokeConsent
// ---------------------------------------------------------------------------

describe('ConsentService — revokeConsent', () => {
  let service: ConsentService;

  beforeEach(() => {
    service = new ConsentService();
  });

  it('creates a new record with REVOKED status and incremented version', async () => {
    const original = await service.recordConsent(baseConsentParams({ status: 'GRANTED' }));
    expect(original.version).toBe(1);

    const revoked = await service.revokeConsent(CONTACT_ID, ENTITY_ID, CONSENT_TYPE);

    expect(revoked.status).toBe('REVOKED');
    expect(revoked.version).toBe(2);
    expect(revoked.revokedAt).toBeInstanceOf(Date);
    expect(revoked.id).not.toBe(original.id);
  });
});

// ---------------------------------------------------------------------------
// requestDeletion
// ---------------------------------------------------------------------------

describe('ConsentService — requestDeletion', () => {
  let service: ConsentService;

  beforeEach(() => {
    service = new ConsentService();
  });

  it('creates a deletion request with PENDING status', async () => {
    const request = await service.requestDeletion(CONTACT_ID, ENTITY_ID);

    expect(request).toBeDefined();
    expect(request.id).toBeDefined();
    expect(request.contactId).toBe(CONTACT_ID);
    expect(request.entityId).toBe(ENTITY_ID);
    expect(request.status).toBe('PENDING');
    expect(request.scope).toBe('FULL');
    expect(request.requestedAt).toBeInstanceOf(Date);
    expect(request.verificationToken).toBeDefined();
  });

  it('scopes to entity when entityId is provided', async () => {
    const request = await service.requestDeletion(CONTACT_ID, ENTITY_ID);
    expect(request.entityId).toBe(ENTITY_ID);
  });

  it('scopes to all entities when entityId is not provided', async () => {
    const request = await service.requestDeletion(CONTACT_ID);
    expect(request.entityId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// executeDeletion
// ---------------------------------------------------------------------------

describe('ConsentService — executeDeletion', () => {
  let service: ConsentService;

  beforeEach(() => {
    service = new ConsentService();
    jest.clearAllMocks();

    // Default: no legal holds
    (legalHoldService.listLegalHolds as jest.Mock).mockResolvedValue([]);

    // Default: deleteMany resolves successfully
    (prisma.message.deleteMany as jest.Mock).mockResolvedValue({ count: 5 });
    (prisma.call.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });
    (prisma.knowledgeEntry.deleteMany as jest.Mock).mockResolvedValue({ count: 3 });
  });

  it('deletes contact data by calling prisma deleteMany', async () => {
    const request = await service.requestDeletion(CONTACT_ID, ENTITY_ID);
    const result = await service.executeDeletion(request.id);

    expect(prisma.message.deleteMany).toHaveBeenCalledWith({
      where: {
        senderId: CONTACT_ID,
        entityId: ENTITY_ID,
      },
    });
    expect(prisma.call.deleteMany).toHaveBeenCalledWith({
      where: {
        contactId: CONTACT_ID,
        entityId: ENTITY_ID,
      },
    });
    expect(prisma.knowledgeEntry.deleteMany).toHaveBeenCalledWith({
      where: {
        entityId: ENTITY_ID,
      },
    });

    expect(result.affectedSystems).toContain('messages');
    expect(result.affectedSystems).toContain('calls');
    expect(result.affectedSystems).toContain('knowledge');
  });

  it('respects legal holds and sets status to PARTIAL', async () => {
    (legalHoldService.listLegalHolds as jest.Mock).mockResolvedValue([
      {
        id: 'hold-001',
        name: 'Litigation Hold',
        entityId: ENTITY_ID,
        reason: 'Pending lawsuit',
        scope: { contactIds: [CONTACT_ID] },
        status: 'ACTIVE',
        createdBy: 'admin',
        createdAt: new Date(),
      },
    ]);

    const request = await service.requestDeletion(CONTACT_ID, ENTITY_ID);
    const result = await service.executeDeletion(request.id);

    expect(result.status).toBe('PARTIAL');
    expect(result.retainedData).toBeDefined();
    expect(result.retainedData!.length).toBeGreaterThan(0);
    expect(result.retainedData![0]).toContain('legal hold');

    // Prisma deleteMany should NOT have been called because of the hold
    expect(prisma.message.deleteMany).not.toHaveBeenCalled();
    expect(prisma.call.deleteMany).not.toHaveBeenCalled();
    expect(prisma.knowledgeEntry.deleteMany).not.toHaveBeenCalled();
  });

  it('updates deletion status to COMPLETED when no legal holds exist', async () => {
    const request = await service.requestDeletion(CONTACT_ID, ENTITY_ID);
    const result = await service.executeDeletion(request.id);

    expect(result.status).toBe('COMPLETED');
    expect(result.completedAt).toBeInstanceOf(Date);
  });

  it('logs status in the deletion request (audit trail)', async () => {
    const request = await service.requestDeletion(CONTACT_ID, ENTITY_ID);

    // Before execution: PENDING
    const statusBefore = await service.getDeletionStatus(request.id);
    expect(statusBefore.status).toBe('PENDING');

    // After execution: COMPLETED
    const result = await service.executeDeletion(request.id);
    expect(result.status).toBe('COMPLETED');

    // Verify via getDeletionStatus
    const statusAfter = await service.getDeletionStatus(request.id);
    expect(statusAfter.status).toBe('COMPLETED');
  });
});
