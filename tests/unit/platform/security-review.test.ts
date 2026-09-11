import { v4 as uuidv4 } from 'uuid';
import type { MockedDelegates } from '../../support/prisma-mock';

/** The columns the review service supplies when it writes a Document row. */
type DocumentInput = {
  title?: string;
  entityId?: string;
  type?: string;
  status?: string;
  content?: string;
};

// Mock prisma before importing any services
/**
 * P-35: the delegate/method names in the literal below were unconstrained, and
 * the `mockImplementation` args were `any`. `MockedDelegates` binds the names
 * to the real client (see tests/support/prisma-mock.ts) and the arg types name
 * the fields this fake actually reads, so the mock states an interface instead
 * of asserting nothing.
 */
const mockPrisma: MockedDelegates<'document' | 'pluginRecord'> = {
  document: {
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    // P-37: `conductReview` no longer reads the plugin out of a module-level
    // Map -- it reads the Document row, the same row `registerPlugin` wrote and
    // the same row the plugin is served from. So this fake has to remember what
    // it created, and `findFirst` has to hand it back.
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    // Migration window 02 (P-40): `registerPlugin` now asks the REGISTRY
    // whether a same-named plugin was revoked IN THIS ENTITY, rather than
    // whether the name was revoked anywhere on the platform. Always 0 here, for
    // the same reason as `pluginRecord.count` below.
    count: jest.fn(),
  },
  // P-37: register asks whether the plugin NAME carries a break-glass
  // revocation tombstone. Always 0 here; the refusal is proved against a real
  // Postgres in tests/db/plugin-revocation.test.ts -- and, for the per-registry
  // scoping window 02 added, in tests/db/migration-window-02.test.ts.
  pluginRecord: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
};

/** Rows this fake has "written", keyed by id. */
const mockDocuments = new Map<string, Record<string, unknown>>();

jest.mock('@/lib/db', () => ({ prisma: mockPrisma }));

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('AI-generated content'),
  generateJSON: jest.fn().mockResolvedValue({
    findings: [
      { severity: 'INFO', description: 'Plugin follows standard patterns' },
    ],
  }),
  chat: jest.fn().mockResolvedValue('AI response'),
}));

import { conductReview, requestReview, reviewStore } from '@/modules/developer/services/security-review-service';
import { registerPlugin } from '@/modules/developer/services/plugin-service';

beforeEach(() => {
  reviewStore.clear();
  mockDocuments.clear();
  jest.clearAllMocks();

  mockPrisma.pluginRecord.count!.mockResolvedValue(0);
  mockPrisma.pluginRecord.findMany!.mockResolvedValue([]);
  mockPrisma.document.count!.mockResolvedValue(0);

  // Make prisma.document.create return a proper document object -- and keep it,
  // so a later read sees what the write produced instead of a Map the service
  // happened to also update.
  mockPrisma.document.create!.mockImplementation(async ({ data }: { data: DocumentInput }) => {
    const id = uuidv4();
    const row = {
      id,
      title: data.title,
      entityId: data.entityId,
      type: data.type,
      status: data.status,
      content: data.content,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    mockDocuments.set(id, row);
    return row;
  });

  mockPrisma.document.findFirst!.mockImplementation(
    async ({ where }: { where: { id?: string } }) =>
      (where.id ? mockDocuments.get(where.id) : undefined) ?? null
  );
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
