import { conductReview, requestReview, reviewStore } from '@/modules/developer/services/security-review-service';
import { registerPlugin, pluginStore } from '@/modules/developer/services/plugin-service';

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('AI-generated content'),
  generateJSON: jest.fn().mockResolvedValue({
    findings: [
      { severity: 'INFO', description: 'Plugin follows standard patterns' },
    ],
  }),
  chat: jest.fn().mockResolvedValue('AI response'),
}));

beforeEach(() => {
  pluginStore.clear();
  reviewStore.clear();
  jest.clearAllMocks();
});

describe('conductReview (AI-powered)', () => {
  const { generateJSON } = jest.requireMock('@/lib/ai');

  it('should call generateJSON with plugin permissions and config', async () => {
    const plugin = await registerPlugin({
      name: 'Test Plugin',
      description: 'A test plugin',
      version: '1.0.0',
      author: 'test-author',
      permissions: ['tasks.read'],
      entryPoint: 'index.js',
      configSchema: { key: 'value' },
    });

    await conductReview(plugin.id, 'reviewer-1');
    expect(generateJSON).toHaveBeenCalled();
    const callArgs = (generateJSON as jest.Mock).mock.calls[0][0];
    expect(callArgs).toContain('tasks.read');
    expect(callArgs).toContain('Test Plugin');
  });

  it('should produce findings with severity levels', async () => {
    (generateJSON as jest.Mock).mockResolvedValue({
      findings: [
        { severity: 'MEDIUM', description: 'Plugin has broad read access' },
        { severity: 'LOW', description: 'Config schema allows arbitrary keys' },
      ],
    });

    const plugin = await registerPlugin({
      name: 'Test Plugin',
      description: 'A test',
      version: '1.0.0',
      author: 'test',
      permissions: ['tasks.read', 'documents.read'],
      entryPoint: 'index.js',
      configSchema: {},
    });

    const review = await conductReview(plugin.id, 'reviewer-1');
    expect(review.findings.length).toBeGreaterThan(0);
    for (const finding of review.findings) {
      expect(finding.severity).toBeDefined();
      expect(finding.description).toBeDefined();
    }
  });

  it('should use temperature 0.1 for security analysis', async () => {
    const plugin = await registerPlugin({
      name: 'Test Plugin',
      description: 'A test',
      version: '1.0.0',
      author: 'test',
      permissions: ['tasks.read'],
      entryPoint: 'index.js',
      configSchema: {},
    });

    await conductReview(plugin.id, 'reviewer-1');
    const callOptions = (generateJSON as jest.Mock).mock.calls[0][1];
    expect(callOptions.temperature).toBe(0.1);
  });

  it('should flag excessive permissions', async () => {
    const plugin = await registerPlugin({
      name: 'Greedy Plugin',
      description: 'Too many perms',
      version: '1.0.0',
      author: 'test',
      permissions: Array.from({ length: 12 }, (_, i) => `perm.${i}`),
      entryPoint: 'index.js',
      configSchema: {},
    });

    const review = await conductReview(plugin.id, 'reviewer-1');
    const excessivePerm = review.findings.find((f) =>
      f.description.includes('more than 10 permissions')
    );
    expect(excessivePerm).toBeDefined();
  });

  it('should handle AI failure gracefully', async () => {
    (generateJSON as jest.Mock).mockRejectedValue(new Error('AI unavailable'));

    const plugin = await registerPlugin({
      name: 'Test Plugin',
      description: 'A test',
      version: '1.0.0',
      author: 'test',
      permissions: ['tasks.read'],
      entryPoint: 'index.js',
      configSchema: {},
    });

    const review = await conductReview(plugin.id, 'reviewer-1');
    // Should still complete with rule-based findings
    expect(review.status).toBeDefined();
    expect(review.pluginId).toBe(plugin.id);
  });

  it('should reject plugins with dangerous permissions', async () => {
    const plugin = await registerPlugin({
      name: 'Dangerous Plugin',
      description: 'Has dangerous perms',
      version: '1.0.0',
      author: 'test',
      permissions: ['admin.all', 'tasks.read'],
      entryPoint: 'index.js',
      configSchema: {},
    });

    const review = await conductReview(plugin.id, 'reviewer-1');
    expect(review.status).toBe('REJECTED');
    expect(review.permissionsVerified).toBe(false);
  });

  it('should reject plugins with sandbox escape attempts', async () => {
    const plugin = await registerPlugin({
      name: 'Escape Plugin',
      description: 'Tries to escape',
      version: '1.0.0',
      author: 'test',
      permissions: ['tasks.read'],
      entryPoint: '../../../etc/passwd',
      configSchema: {},
    });

    const review = await conductReview(plugin.id, 'reviewer-1');
    expect(review.status).toBe('REJECTED');
    expect(review.isolationVerified).toBe(false);
  });
});
