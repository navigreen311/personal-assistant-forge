import {
  checkConsentRequirements,
  recordConsent,
  verifyConsent,
  revokeConsent,
} from '@/lib/voice/consent-manager';

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    consentReceipt: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Consent Manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkConsentRequirements', () => {
    it('should require two-party consent when caller is in CA', () => {
      const result = checkConsentRequirements('CA', 'TX');
      expect(result.consentType).toBe('TWO_PARTY');
      expect(result.allowed).toBe(false);
      expect(result.recordingAllowed).toBe(false);
      expect(result.jurisdiction).toBe('CA');
    });

    it('should require two-party consent when recipient is in CA', () => {
      const result = checkConsentRequirements('TX', 'CA');
      expect(result.consentType).toBe('TWO_PARTY');
      expect(result.allowed).toBe(false);
      expect(result.recordingAllowed).toBe(false);
    });

    it('should require two-party consent when both are in two-party states', () => {
      const result = checkConsentRequirements('CA', 'FL');
      expect(result.consentType).toBe('TWO_PARTY');
      expect(result.allowed).toBe(false);
    });

    it('should allow one-party consent for TX to TX', () => {
      const result = checkConsentRequirements('TX', 'TX');
      expect(result.consentType).toBe('ONE_PARTY');
      expect(result.allowed).toBe(true);
      expect(result.recordingAllowed).toBe(true);
    });

    it('should allow one-party consent for NY to TX', () => {
      const result = checkConsentRequirements('NY', 'TX');
      expect(result.consentType).toBe('ONE_PARTY');
      expect(result.allowed).toBe(true);
      expect(result.recordingAllowed).toBe(true);
    });

    it('should identify FL as a two-party state', () => {
      const result = checkConsentRequirements('FL', 'TX');
      expect(result.consentType).toBe('TWO_PARTY');
    });

    it('should identify IL as a two-party state', () => {
      const result = checkConsentRequirements('IL', 'NY');
      expect(result.consentType).toBe('TWO_PARTY');
    });

    it('should identify MD as a two-party state', () => {
      const result = checkConsentRequirements('MD', 'NY');
      expect(result.consentType).toBe('TWO_PARTY');
    });

    it('should identify MA as a two-party state', () => {
      const result = checkConsentRequirements('MA', 'NY');
      expect(result.consentType).toBe('TWO_PARTY');
    });

    it('should identify PA as a two-party state', () => {
      const result = checkConsentRequirements('PA', 'NY');
      expect(result.consentType).toBe('TWO_PARTY');
    });

    it('should identify WA as a two-party state', () => {
      const result = checkConsentRequirements('WA', 'NY');
      expect(result.consentType).toBe('TWO_PARTY');
    });

    it('should handle lowercase state codes', () => {
      const result = checkConsentRequirements('ca', 'tx');
      expect(result.consentType).toBe('TWO_PARTY');
    });

    // All 12 two-party consent states
    const twoPartyStates = ['CA', 'CT', 'FL', 'IL', 'MD', 'MA', 'MI', 'MT', 'NV', 'NH', 'PA', 'WA'];
    for (const state of twoPartyStates) {
      it(`should identify ${state} as two-party consent state`, () => {
        const result = checkConsentRequirements(state, 'NY');
        expect(result.consentType).toBe('TWO_PARTY');
      });
    }
  });

  describe('recordConsent', () => {
    it('should create a consent receipt in DB', async () => {
      const mockReceipt = {
        id: 'receipt-1',
        actionId: 'call-1',
        description: 'Recording consent for call call-1',
        reason: 'TWO_PARTY consent obtained from contact contact-1',
        impacted: ['contact-1'],
        reversible: true,
        rollbackLink: null,
        confidence: 1.0,
        timestamp: new Date(),
      };
      (mockPrisma.consentReceipt.create as jest.Mock).mockResolvedValue(mockReceipt);

      const result = await recordConsent('call-1', 'contact-1', 'TWO_PARTY');
      expect(result.id).toBe('receipt-1');
      expect(mockPrisma.consentReceipt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actionId: 'call-1',
            impacted: ['contact-1'],
          }),
        })
      );
    });
  });

  describe('verifyConsent', () => {
    it('should return valid when consent receipt exists', async () => {
      (mockPrisma.consentReceipt.findFirst as jest.Mock).mockResolvedValue({
        id: 'receipt-1',
        actionId: 'call-1',
      });

      const result = await verifyConsent('call-1');
      expect(result.valid).toBe(true);
      expect(result.receipt).not.toBeNull();
    });

    it('should return invalid when no consent receipt exists', async () => {
      (mockPrisma.consentReceipt.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await verifyConsent('call-nonexistent');
      expect(result.valid).toBe(false);
      expect(result.receipt).toBeNull();
    });
  });

  describe('revokeConsent', () => {
    it('should update the consent receipt', async () => {
      (mockPrisma.consentReceipt.update as jest.Mock).mockResolvedValue({});

      await revokeConsent('receipt-1');
      expect(mockPrisma.consentReceipt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'receipt-1' },
          data: expect.objectContaining({
            reversible: false,
          }),
        })
      );
    });
  });
});
