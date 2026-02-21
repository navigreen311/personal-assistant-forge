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
  it('should set plugin status to REVOKED', async () => {
    seedPlugin();

    const result = await breakGlassRevoke('plugin-1', 'Security incident');

    expect(result.revoked).toBe(true);
    const plugin = mockPluginStore.get('plugin-1');
    expect(plugin?.status).toBe('REVOKED');
  });

  it('should update the plugin updatedAt timestamp', async () => {
    const originalDate = new Date('2025-01-01');
    seedPlugin({ updatedAt: originalDate });

    await breakGlassRevoke('plugin-1', 'Security incident');

    const plugin = mockPluginStore.get('plugin-1');
    expect(plugin!.updatedAt.getTime()).toBeGreaterThan(originalDate.getTime());
  });

  it('should throw for unknown plugin', async () => {
    await expect(breakGlassRevoke('non-existent', 'reason')).rejects.toThrow(
      'Plugin non-existent not found'
    );
  });

  it('should return zero affectedUsers as placeholder', async () => {
    seedPlugin();

    const result = await breakGlassRevoke('plugin-1', 'Reason');

    expect(result.affectedUsers).toBe(0);
  });
});
