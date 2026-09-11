/**
 * P-37 -- see tests/unit/developer/security-review-service.test.ts for the full
 * account. In short: this suite seeded `plugin-service :: pluginStore` (a
 * module-level `Map`) and then asserted that `breakGlassRevoke` had changed the
 * same Map. That is asserting the bug -- the plugin being served came from a
 * `Document` row the revocation never touched. The Map is gone; the service
 * reads through `getPlugin` and writes through Prisma, both mocked here.
 */
import type { PluginDefinition } from '@/modules/developer/types';
import type { MockedDelegates } from '../../support/prisma-mock';

const mockPlugins = new Map<string, PluginDefinition>();

const mockPrisma: MockedDelegates<'document' | 'pluginRecord' | 'pluginReview'> & {
  $transaction: jest.Mock;
} = {
  document: { findFirst: jest.fn(), update: jest.fn() },
  pluginRecord: { findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn(), create: jest.fn() },
  pluginReview: { createMany: jest.fn(), findMany: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock('@/lib/db', () => ({ prisma: mockPrisma }));

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue(''),
  generateJSON: jest.fn().mockResolvedValue({ findings: [] }),
}));

jest.mock('@/modules/developer/services/plugin-service', () => ({
  PLUGIN_REVOKED: 'REVOKED',
  getPlugin: jest.fn(async (pluginId: string) => {
    const plugin = mockPlugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
    return plugin;
  }),
}));

import {
  requestReview,
  conductReview,
  getReview,
  breakGlassRevoke,
  reviewStore,
} from '@/modules/developer/services/security-review-service';
import { generateJSON } from '@/lib/ai';

const mockGenerateJSON = generateJSON as jest.MockedFunction<typeof generateJSON>;

function resetPrismaMock(): void {
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma)
  );
  mockPrisma.document.findFirst!.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const plugin = mockPlugins.get(where.id);
    if (!plugin) return null;
    return {
      id: plugin.id,
      title: plugin.name,
      entityId: 'entity-1',
      type: 'PLUGIN',
      status: plugin.status,
      content: JSON.stringify(plugin),
      createdAt: plugin.createdAt,
      updatedAt: plugin.updatedAt,
      deletedAt: null,
    };
  });
  mockPrisma.document.update!.mockResolvedValue({});
  mockPrisma.pluginRecord.findMany!.mockResolvedValue([]);
  mockPrisma.pluginRecord.count!.mockResolvedValue(0);
  mockPrisma.pluginRecord.updateMany!.mockResolvedValue({ count: 0 });
  mockPrisma.pluginRecord.create!.mockResolvedValue({ id: 'tombstone-1' });
  mockPrisma.pluginReview.createMany!.mockResolvedValue({ count: 0 });
}

describe('security-review-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    reviewStore.clear();
    mockPlugins.clear();
    resetPrismaMock();
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
    mockPlugins.set(plugin.id, plugin);
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
    it('writes REVOKED to the registry row rather than to an in-process object', async () => {
      seedPlugin();

      const result = await breakGlassRevoke('plugin-1', 'Security incident');

      expect(result.revoked).toBe(true);
      // The predecessor of this assertion read the status back off the Map the
      // test had just seeded, which is true of any implementation that mutates
      // the object it was handed -- including the one that never persisted.
      expect(mockPrisma.document.update!).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'plugin-1' },
          data: expect.objectContaining({ status: 'REVOKED' }),
        })
      );
    });

    it('revokes the installations, and counts them into affectedUsers', async () => {
      seedPlugin();
      mockPrisma.pluginRecord.findMany!.mockResolvedValue([{ id: 'rec-1' }, { id: 'rec-2' }]);
      mockPrisma.pluginRecord.count!.mockResolvedValue(2);

      const result = await breakGlassRevoke('plugin-1', 'Security incident');

      expect(mockPrisma.pluginRecord.updateMany!).toHaveBeenCalledWith({
        where: { id: { in: ['rec-1', 'rec-2'] } },
        data: expect.objectContaining({ status: 'REVOKED' }),
      });
      expect(result.affectedUsers).toBe(2);
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
