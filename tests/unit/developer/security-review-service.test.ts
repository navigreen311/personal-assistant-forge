/**
 * P-37 -- this suite used to seed a Map and then read the same Map back.
 *
 * `security-review-service` kept plugins in `plugin-service :: pluginStore`, a
 * module-level `Map`, and this file mocked `plugin-service` down to nothing but
 * that Map. So `breakGlassRevoke` set `status = 'REVOKED'` on an object the test
 * had put there and the test read it back and passed -- while the plugin being
 * SERVED lived in a `Document` row that the revocation never touched. A test
 * that calls the emergency kill switch and then inspects the Map proves the
 * Map, not the kill switch.
 *
 * The Map is gone. The service reads plugins through `getPlugin`, mocked here,
 * and writes revocations through Prisma, mocked here too. What a mocked client
 * CAN honestly show is asserted below: the registry row is written, every
 * installation is written, and `affectedUsers` comes from the rows the call
 * actually moved. What it CANNOT show -- that the revocation survives a restart
 * and that the plugin is then refused through a real request path -- is proved
 * against a real Postgres in tests/db/plugin-revocation.test.ts.
 */
import type { PluginDefinition } from '@/modules/developer/types';
import type { MockedDelegates } from '../../support/prisma-mock';

/** The plugins the database holds, as far as this suite is concerned. */
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

/** Installations of the seeded plugin that are still live at revocation time. */
function seedInstallations(ids: string[]): void {
  mockPrisma.pluginRecord.findMany!.mockResolvedValue(ids.map((id) => ({ id })));
  mockPrisma.pluginRecord.count!.mockResolvedValue(ids.length);
}

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
  it('should create a PENDING review for an existing plugin', async () => {
    seedPlugin();

    const review = await requestReview('plugin-1');

    expect(review.pluginId).toBe('plugin-1');
    expect(review.status).toBe('PENDING');
    expect(review.permissionsVerified).toBe(false);
    expect(review.isolationVerified).toBe(false);
    expect(review.findings).toEqual([]);
    expect(reviewStore.has('plugin-1')).toBe(true);
  });

  it('should throw for unknown plugin', async () => {
    await expect(requestReview('non-existent')).rejects.toThrow('Plugin non-existent not found');
  });

  it('should set reviewer to empty string for initial request', async () => {
    seedPlugin();

    const review = await requestReview('plugin-1');

    expect(review.reviewer).toBe('');
  });

  it('should overwrite a previous review when requested again', async () => {
    seedPlugin();

    await requestReview('plugin-1');
    const secondReview = await requestReview('plugin-1');

    expect(secondReview.status).toBe('PENDING');
    expect(reviewStore.size).toBe(1);
  });
});

describe('conductReview', () => {
  it('should approve plugin with safe permissions and valid entry point', async () => {
    seedPlugin({ permissions: ['tasks.read', 'documents.read'] });
    mockGenerateJSON.mockResolvedValueOnce({ findings: [] });

    const review = await conductReview('plugin-1', 'reviewer-1');

    expect(review.status).toBe('APPROVED');
    expect(review.permissionsVerified).toBe(true);
    expect(review.isolationVerified).toBe(true);
    expect(review.reviewer).toBe('reviewer-1');
    expect(review.reviewedAt).toBeInstanceOf(Date);
  });

  it('should reject plugin with admin.all permission', async () => {
    seedPlugin({ permissions: ['tasks.read', 'admin.all'] });
    mockGenerateJSON.mockResolvedValueOnce({ findings: [] });

    const review = await conductReview('plugin-1', 'reviewer-1');

    expect(review.status).toBe('REJECTED');
    expect(review.permissionsVerified).toBe(false);
    const highFindings = review.findings.filter((f) => f.severity === 'HIGH');
    expect(highFindings.length).toBeGreaterThan(0);
    expect(highFindings[0].description).toContain('admin.all');
  });

  it('should reject plugin with system.execute permission', async () => {
    seedPlugin({ permissions: ['system.execute'] });
    mockGenerateJSON.mockResolvedValueOnce({ findings: [] });

    const review = await conductReview('plugin-1', 'reviewer-1');

    expect(review.status).toBe('REJECTED');
    expect(review.permissionsVerified).toBe(false);
    const highFindings = review.findings.filter((f) => f.severity === 'HIGH');
    expect(highFindings.some((f) => f.description.includes('system.execute'))).toBe(true);
  });

  it('should reject plugin with files.delete_all permission', async () => {
    seedPlugin({ permissions: ['files.delete_all'] });
    mockGenerateJSON.mockResolvedValueOnce({ findings: [] });

    const review = await conductReview('plugin-1', 'reviewer-1');

    expect(review.status).toBe('REJECTED');
    const highFindings = review.findings.filter((f) => f.severity === 'HIGH');
    expect(highFindings.some((f) => f.description.includes('files.delete_all'))).toBe(true);
  });

  it('should reject plugin with path traversal in entryPoint', async () => {
    seedPlugin({ entryPoint: '../../../etc/passwd' });
    mockGenerateJSON.mockResolvedValueOnce({ findings: [] });

    const review = await conductReview('plugin-1', 'reviewer-1');

    expect(review.status).toBe('REJECTED');
    expect(review.isolationVerified).toBe(false);
    const criticalFindings = review.findings.filter((f) => f.severity === 'CRITICAL');
    expect(criticalFindings.length).toBeGreaterThan(0);
    expect(criticalFindings[0].description).toContain('sandbox isolation');
  });

  it('should reject plugin with absolute path entryPoint', async () => {
    seedPlugin({ entryPoint: '/usr/bin/evil' });
    mockGenerateJSON.mockResolvedValueOnce({ findings: [] });

    const review = await conductReview('plugin-1', 'reviewer-1');

    expect(review.status).toBe('REJECTED');
    expect(review.isolationVerified).toBe(false);
  });

  it('should add MEDIUM finding when plugin requests more than 10 permissions', async () => {
    const manyPerms = Array.from({ length: 12 }, (_, i) => `scope.perm${i}`);
    seedPlugin({ permissions: manyPerms });
    mockGenerateJSON.mockResolvedValueOnce({ findings: [] });

    const review = await conductReview('plugin-1', 'reviewer-1');

    const mediumFindings = review.findings.filter((f) => f.severity === 'MEDIUM');
    expect(mediumFindings.length).toBeGreaterThan(0);
    expect(mediumFindings[0].description).toContain('more than 10 permissions');
  });

  it('should include AI-generated findings when AI succeeds', async () => {
    seedPlugin();
    mockGenerateJSON.mockResolvedValueOnce({
      findings: [
        { severity: 'LOW', description: 'Plugin accesses network without justification' },
      ],
    });

    const review = await conductReview('plugin-1', 'reviewer-1');

    expect(review.findings.some((f) => f.description.includes('network without justification'))).toBe(true);
  });

  it('should not duplicate findings from AI that match rule-based checks', async () => {
    seedPlugin({ permissions: ['admin.all'] });
    mockGenerateJSON.mockResolvedValueOnce({
      findings: [
        { severity: 'HIGH', description: 'Plugin requests dangerous permissions: admin.all is risky' },
      ],
    });

    const review = await conductReview('plugin-1', 'reviewer-1');

    // The AI finding overlaps with the rule-based finding (starts with same 30 chars)
    // so it should be deduplicated
    const adminFindings = review.findings.filter((f) =>
      f.description.toLowerCase().includes('dangerous permissions')
    );
    expect(adminFindings.length).toBe(1);
  });

  it('should still produce rule-based findings when AI fails', async () => {
    seedPlugin({ permissions: ['admin.all'], entryPoint: '../escape' });
    mockGenerateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

    const review = await conductReview('plugin-1', 'reviewer-1');

    expect(review.status).toBe('REJECTED');
    expect(review.findings.length).toBeGreaterThanOrEqual(2);
    expect(review.findings.some((f) => f.severity === 'HIGH')).toBe(true);
    expect(review.findings.some((f) => f.severity === 'CRITICAL')).toBe(true);
  });

  it('should throw for unknown plugin', async () => {
    await expect(conductReview('non-existent', 'reviewer-1')).rejects.toThrow(
      'Plugin non-existent not found'
    );
  });
});

describe('getReview', () => {
  it('should return null for unknown pluginId', async () => {
    const review = await getReview('unknown-plugin');
    expect(review).toBeNull();
  });

  it('should return the review for a known pluginId', async () => {
    seedPlugin();
    await requestReview('plugin-1');

    const review = await getReview('plugin-1');

    expect(review).not.toBeNull();
    expect(review!.pluginId).toBe('plugin-1');
    expect(review!.status).toBe('PENDING');
  });

  it('should return updated review after conductReview', async () => {
    seedPlugin();
    mockGenerateJSON.mockResolvedValueOnce({ findings: [] });

    await conductReview('plugin-1', 'reviewer-1');
    const review = await getReview('plugin-1');

    expect(review).not.toBeNull();
    expect(review!.status).toBe('APPROVED');
    expect(review!.reviewer).toBe('reviewer-1');
  });
});

describe('breakGlassRevoke', () => {
  it('revokes the REGISTRY row -- the thing that is actually served', async () => {
    seedPlugin();

    await breakGlassRevoke('plugin-1', 'Security incident');

    expect(mockPrisma.document.update!).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'plugin-1' },
        data: expect.objectContaining({ status: 'REVOKED' }),
      })
    );
    // The manifest is JSON-stuffed into Document.content and the status COLUMN
    // was the half nobody wrote. Both, or the documents API keeps calling a
    // revoked plugin an active document.
    const written = JSON.parse(mockPrisma.document.update!.mock.calls[0][0].data.content);
    expect(written.status).toBe('REVOKED');
  });

  it('revokes every live installation, which is what stops it being served', async () => {
    seedPlugin();
    seedInstallations(['rec-1', 'rec-2', 'rec-3']);

    await breakGlassRevoke('plugin-1', 'Security incident');

    expect(mockPrisma.pluginRecord.updateMany!).toHaveBeenCalledWith({
      where: { id: { in: ['rec-1', 'rec-2', 'rec-3'] } },
      data: expect.objectContaining({ status: 'REVOKED' }),
    });
  });

  it('COUNTS affectedUsers rather than returning the literal 0 it used to', async () => {
    seedPlugin();
    seedInstallations(['rec-1', 'rec-2', 'rec-3']);

    const result = await breakGlassRevoke('plugin-1', 'Security incident');

    expect(result.affectedUsers).toBe(3);
  });

  it('returns 0 only when it counted 0, and leaves a tombstone so the name stays dead', async () => {
    seedPlugin();
    // No installations at all: the old code returned 0 here too, and returned 0
    // in the case above as well. That is the difference this pair pins down.

    const result = await breakGlassRevoke('plugin-1', 'Security incident', { revokedBy: 'user-1' });

    expect(result.affectedUsers).toBe(0);
    expect(mockPrisma.pluginRecord.create!).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', name: 'Test Plugin', status: 'REVOKED' }),
      })
    );
  });

  it('writes a revocation ledger entry naming who, when, why and how many', async () => {
    seedPlugin();
    seedInstallations(['rec-1', 'rec-2']);

    await breakGlassRevoke('plugin-1', 'Exfiltrating contacts', { revokedBy: 'user-9' });

    const arg = mockPrisma.pluginReview.createMany!.mock.calls[0][0];
    expect(arg.data).toHaveLength(2);
    expect(arg.data[0]).toEqual(
      expect.objectContaining({ reviewerId: 'user-9', status: 'REVOKED', affectedUsers: 2 })
    );
    expect(JSON.stringify(arg.data[0].findings)).toContain('Exfiltrating contacts');
  });

  it('applies registry, installations and ledger in ONE transaction', async () => {
    seedPlugin();
    seedInstallations(['rec-1']);

    await breakGlassRevoke('plugin-1', 'Security incident');

    // A break-glass revocation that half-applied and returned { revoked: true }
    // would be the same bug with more steps.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('throws for unknown plugin, and writes nothing', async () => {
    await expect(breakGlassRevoke('non-existent', 'reason')).rejects.toThrow(
      'Plugin non-existent not found'
    );

    expect(mockPrisma.document.update!).not.toHaveBeenCalled();
    expect(mockPrisma.pluginRecord.updateMany!).not.toHaveBeenCalled();
  });
});
