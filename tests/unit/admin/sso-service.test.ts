jest.mock('@/lib/db', () => ({
  prisma: {
    entity: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import {
  configureSSOProvider,
  getSSOConfig,
  validateSSOConfig,
  testConnection,
  deleteSSOConfig,
} from '@/modules/admin/services/sso-service';

const mockEntity = prisma.entity as jest.Mocked<typeof prisma.entity>;

describe('SSO Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('configureSSOProvider', () => {
    it('should store SSO config in entity complianceProfile', async () => {
      (mockEntity.findUnique as jest.Mock).mockResolvedValue({
        id: 'entity-1',
        complianceProfile: [],
      });
      (mockEntity.update as jest.Mock).mockResolvedValue({
        id: 'entity-1',
        complianceProfile: ['sso:{"entityId":"entity-1","provider":"SAML"}'],
      });

      const result = await configureSSOProvider('entity-1', {
        provider: 'SAML',
        issuerUrl: 'https://idp.example.com',
        certificateFingerprint: 'abc123',
      });

      expect(result.provider).toBe('SAML');
      expect(result.entityId).toBe('entity-1');
      expect(mockEntity.update).toHaveBeenCalled();
    });

    it('should throw if entity not found', async () => {
      (mockEntity.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        configureSSOProvider('nonexistent', { provider: 'SAML' })
      ).rejects.toThrow('not found');
    });
  });

  describe('validateSSOConfig', () => {
    it('should pass for valid SAML config', () => {
      const result = validateSSOConfig({
        provider: 'SAML',
        issuerUrl: 'https://idp.example.com/saml',
        certificateFingerprint: 'abc123def456',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass for valid OIDC config', () => {
      const result = validateSSOConfig({
        provider: 'OIDC',
        issuerUrl: 'https://accounts.google.com',
        clientId: 'my-client-id',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for missing required fields', () => {
      const result = validateSSOConfig({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Provider is required');
    });

    it('should fail for missing SAML fields', () => {
      const result = validateSSOConfig({
        provider: 'SAML',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Issuer URL is required for SAML');
      expect(result.errors).toContain('Certificate fingerprint is required for SAML');
    });

    it('should fail for invalid URLs', () => {
      const result = validateSSOConfig({
        provider: 'SAML',
        issuerUrl: 'not-a-valid-url',
        certificateFingerprint: 'abc',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Issuer URL must be a valid URL');
    });
  });

  describe('testConnection', () => {
    it('should validate stored config', async () => {
      (mockEntity.findUnique as jest.Mock).mockResolvedValue({
        id: 'entity-1',
        complianceProfile: [
          `sso:${JSON.stringify({
            entityId: 'entity-1',
            provider: 'SAML',
            issuerUrl: 'https://idp.example.com',
            certificateFingerprint: 'abc',
            isEnabled: true,
          })}`,
        ],
      });

      const result = await testConnection('entity-1');
      expect(result.success).toBe(true);
      expect(result.responseTime).toBeDefined();
    });

    it('should return success for valid config', async () => {
      (mockEntity.findUnique as jest.Mock).mockResolvedValue({
        id: 'entity-1',
        complianceProfile: [
          `sso:${JSON.stringify({
            entityId: 'entity-1',
            provider: 'OIDC',
            issuerUrl: 'https://accounts.google.com',
            clientId: 'client-123',
            isEnabled: true,
          })}`,
        ],
      });

      const result = await testConnection('entity-1');
      expect(result.success).toBe(true);
    });

    it('should fail when SSO not configured', async () => {
      (mockEntity.findUnique as jest.Mock).mockResolvedValue({
        id: 'entity-1',
        complianceProfile: [],
      });

      const result = await testConnection('entity-1');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getSSOConfig', () => {
    it('should return NONE when no config exists', async () => {
      (mockEntity.findUnique as jest.Mock).mockResolvedValue({
        id: 'entity-1',
        complianceProfile: [],
      });

      const result = await getSSOConfig('entity-1');
      expect(result.provider).toBe('NONE');
      expect(result.isEnabled).toBe(false);
    });
  });

  describe('deleteSSOConfig', () => {
    it('should remove SSO config from complianceProfile', async () => {
      (mockEntity.findUnique as jest.Mock).mockResolvedValue({
        id: 'entity-1',
        complianceProfile: ['sso:{"provider":"SAML"}', 'other-compliance'],
      });
      (mockEntity.update as jest.Mock).mockResolvedValue({});

      await deleteSSOConfig('entity-1');
      expect(mockEntity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { complianceProfile: ['other-compliance'] },
        })
      );
    });
  });
});
