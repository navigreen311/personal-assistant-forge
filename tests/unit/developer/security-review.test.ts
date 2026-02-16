jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue(''),
  generateJSON: jest.fn().mockResolvedValue({ findings: [] }),
}));

jest.mock('@/modules/developer/services/plugin-service', () => {
  const store = new Map();
  return {
    pluginStore: store,
  };
});

import {
  requestReview,
  conductReview,
  getReview,
  breakGlassRevoke,
  reviewStore,
} from '@/modules/developer/services/security-review-service';
import { pluginStore } from '@/modules/developer/services/plugin-service';
import { generateJSON } from '@/lib/ai';
import type { PluginDefinition } from '@/modules/developer/types';

const mockGenerateJSON = generateJSON as jest.MockedFunction<typeof generateJSON>;
const mockPluginStore = pluginStore as Map<string, PluginDefinition>;

describe('security-review-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    reviewStore.clear();
    mockPluginStore.clear();
  });

  function seedPlugin(overrides: Partial<PluginDefinition> = {}): PluginDefinition {
    const plugin: PluginDefinition = {
      id: 'plugin-1',
      name: 'Test Plugin',
      description: 'A test plugin',
      version: '1.0.0',
      author: 'test-author',
      permissions: ['tasks.read', 'documents.read'],
      status: 'REVIEW',
      entryPoint: 'index.js',
      configSchema: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    mockPluginStore.set(plugin.id, plugin);
    return plugin;
  }

  describe('requestReview', () => {
    it('creates a PENDING review for an existing plugin', async () => {
      seedPlugin();

      const review = await requestReview('plugin-1');

      expect(review.pluginId).toBe('plugin-1');
      expect(review.status).toBe('PENDING');
      expect(review.permissionsVerified).toBe(false);
      expect(review.isolationVerified).toBe(false);
      expect(review.findings).toEqual([]);
      expect(reviewStore.has('plugin-1')).toBe(true);
    });

    it('throws for unknown plugin', async () => {
      await expect(requestReview('non-existent')).rejects.toThrow('Plugin non-existent not found');
    });
  });

  describe('conductReview', () => {
    it('with safe permissions returns APPROVED status', async () => {
      seedPlugin({ permissions: ['tasks.read', 'documents.read'] });
      mockGenerateJSON.mockResolvedValueOnce({ findings: [] });

      const review = await conductReview('plugin-1', 'reviewer-1');

      expect(review.status).toBe('APPROVED');
      expect(review.permissionsVerified).toBe(true);
      expect(review.isolationVerified).toBe(true);
      expect(review.reviewer).toBe('reviewer-1');
      expect(review.reviewedAt).toBeInstanceOf(Date);
    });

    it('with dangerous permissions (admin.all) returns REJECTED with HIGH findings', async () => {
      seedPlugin({ permissions: ['tasks.read', 'admin.all'] });
      mockGenerateJSON.mockResolvedValueOnce({ findings: [] });

      const review = await conductReview('plugin-1', 'reviewer-1');

      expect(review.status).toBe('REJECTED');
      expect(review.permissionsVerified).toBe(false);
      const highFindings = review.findings.filter((f) => f.severity === 'HIGH');
      expect(highFindings.length).toBeGreaterThan(0);
      expect(highFindings[0].description).toContain('admin.all');
    });

    it('with path traversal in entryPoint returns REJECTED with CRITICAL finding', async () => {
      seedPlugin({ entryPoint: '../../../etc/passwd' });
      mockGenerateJSON.mockResolvedValueOnce({ findings: [] });

      const review = await conductReview('plugin-1', 'reviewer-1');

      expect(review.status).toBe('REJECTED');
      expect(review.isolationVerified).toBe(false);
      const criticalFindings = review.findings.filter((f) => f.severity === 'CRITICAL');
      expect(criticalFindings.length).toBeGreaterThan(0);
      expect(criticalFindings[0].description).toContain('sandbox isolation');
    });

    it('with absolute path entryPoint returns REJECTED', async () => {
      seedPlugin({ entryPoint: '/usr/bin/evil' });
      mockGenerateJSON.mockResolvedValueOnce({ findings: [] });

      const review = await conductReview('plugin-1', 'reviewer-1');

      expect(review.status).toBe('REJECTED');
      expect(review.isolationVerified).toBe(false);
    });

    it('throws for unknown plugin', async () => {
      await expect(conductReview('non-existent', 'reviewer-1')).rejects.toThrow(
        'Plugin non-existent not found'
      );
    });
  });

  describe('breakGlassRevoke', () => {
    it('sets plugin status to REVOKED', async () => {
      seedPlugin();

      const result = await breakGlassRevoke('plugin-1', 'Security incident');

      expect(result.revoked).toBe(true);
      const plugin = mockPluginStore.get('plugin-1');
      expect(plugin?.status).toBe('REVOKED');
    });

    it('throws for unknown plugin', async () => {
      await expect(breakGlassRevoke('non-existent', 'reason')).rejects.toThrow(
        'Plugin non-existent not found'
      );
    });
  });

  describe('getReview', () => {
    it('returns null for unknown pluginId', async () => {
      const review = await getReview('unknown-plugin');
      expect(review).toBeNull();
    });

    it('returns the review for a known pluginId', async () => {
      seedPlugin();
      await requestReview('plugin-1');

      const review = await getReview('plugin-1');

      expect(review).not.toBeNull();
      expect(review!.pluginId).toBe('plugin-1');
      expect(review!.status).toBe('PENDING');
    });
  });
});
