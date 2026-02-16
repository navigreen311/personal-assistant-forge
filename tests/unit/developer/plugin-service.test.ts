jest.mock('@/lib/db', () => ({
  prisma: {
    document: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import {
  registerPlugin,
  getPlugins,
  listPlugins,
  getPlugin,
  enablePlugin,
  disablePlugin,
  validateManifest,
  unregisterPlugin,
} from '@/modules/developer/services/plugin-service';

const mockDocument = prisma.document as jest.Mocked<typeof prisma.document>;

describe('Plugin Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validManifest = {
    name: 'Test Plugin',
    description: 'A test plugin',
    version: '1.0.0',
    author: 'Test Author',
    permissions: ['tasks.read', 'documents.read'],
    entryPoint: 'index.js',
    configSchema: {},
  };

  describe('registerPlugin', () => {
    it('should create a document with type PLUGIN', async () => {
      const mockDoc = {
        id: 'plugin-1',
        title: 'Test Plugin',
        entityId: 'entity-1',
        type: 'PLUGIN',
        version: 1,
        templateId: null,
        citations: [],
        content: JSON.stringify({ ...validManifest, status: 'pending_review' }),
        status: 'DRAFT',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (mockDocument.create as jest.Mock).mockResolvedValue(mockDoc);

      const result = await registerPlugin({ ...validManifest, entityId: 'entity-1' });

      expect(mockDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'PLUGIN',
            entityId: 'entity-1',
          }),
        })
      );
      expect(result.id).toBe('plugin-1');
    });

    it('should store manifest in content field', async () => {
      const mockDoc = {
        id: 'plugin-1',
        title: 'Test Plugin',
        entityId: 'entity-1',
        type: 'PLUGIN',
        version: 1,
        templateId: null,
        citations: [],
        content: JSON.stringify({ ...validManifest, status: 'pending_review' }),
        status: 'DRAFT',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (mockDocument.create as jest.Mock).mockResolvedValue(mockDoc);

      const result = await registerPlugin({ ...validManifest, entityId: 'entity-1' });

      expect(result.name).toBe('Test Plugin');
      expect(result.version).toBe('1.0.0');
      expect(result.permissions).toEqual(['tasks.read', 'documents.read']);
    });

    it('should set initial status to pending_review', async () => {
      const mockDoc = {
        id: 'plugin-1',
        title: 'Test Plugin',
        entityId: 'entity-1',
        type: 'PLUGIN',
        version: 1,
        templateId: null,
        citations: [],
        content: JSON.stringify({ ...validManifest, status: 'pending_review' }),
        status: 'DRAFT',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (mockDocument.create as jest.Mock).mockResolvedValue(mockDoc);

      await registerPlugin({ ...validManifest, entityId: 'entity-1' });

      const createCall = (mockDocument.create as jest.Mock).mock.calls[0][0];
      const content = JSON.parse(createCall.data.content);
      expect(content.status).toBe('pending_review');
    });
  });

  describe('validateManifest', () => {
    it('should pass for valid manifests', () => {
      const result = validateManifest(validManifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for missing required fields', () => {
      const result = validateManifest({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors).toContain('Missing required field: name');
    });

    it('should warn about dangerous permissions', () => {
      const result = validateManifest({
        ...validManifest,
        permissions: ['filesystem', 'network', 'tasks.read'],
      });
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Dangerous permissions');
    });
  });

  describe('enablePlugin / disablePlugin', () => {
    it('should update metadata.status to active (APPROVED)', async () => {
      const mockDoc = {
        id: 'plugin-1',
        title: 'Test Plugin',
        entityId: 'entity-1',
        type: 'PLUGIN',
        version: 1,
        templateId: null,
        citations: [],
        content: JSON.stringify({ ...validManifest, status: 'DRAFT' }),
        status: 'DRAFT',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (mockDocument.findUnique as jest.Mock).mockResolvedValue(mockDoc);
      (mockDocument.update as jest.Mock).mockResolvedValue({
        ...mockDoc,
        status: 'APPROVED',
        content: JSON.stringify({ ...validManifest, status: 'APPROVED' }),
      });

      const result = await enablePlugin('plugin-1');
      expect(result.status).toBe('APPROVED');
    });

    it('should update metadata.status to disabled (DRAFT)', async () => {
      const mockDoc = {
        id: 'plugin-1',
        title: 'Test Plugin',
        entityId: 'entity-1',
        type: 'PLUGIN',
        version: 1,
        templateId: null,
        citations: [],
        content: JSON.stringify({ ...validManifest, status: 'APPROVED' }),
        status: 'APPROVED',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (mockDocument.findUnique as jest.Mock).mockResolvedValue(mockDoc);
      (mockDocument.update as jest.Mock).mockResolvedValue({
        ...mockDoc,
        status: 'DRAFT',
        content: JSON.stringify({ ...validManifest, status: 'DRAFT' }),
      });

      const result = await disablePlugin('plugin-1');
      expect(result.status).toBe('DRAFT');
    });
  });

  describe('getPlugins', () => {
    it('should return all plugins', async () => {
      (mockDocument.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'p1',
          title: 'Plugin 1',
          content: JSON.stringify({ name: 'Plugin 1', status: 'APPROVED' }),
          status: 'APPROVED',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await getPlugins();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Plugin 1');
    });
  });

  describe('unregisterPlugin', () => {
    it('should delete the plugin document', async () => {
      (mockDocument.findUnique as jest.Mock).mockResolvedValue({
        id: 'plugin-1',
        type: 'PLUGIN',
        content: JSON.stringify(validManifest),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (mockDocument.delete as jest.Mock).mockResolvedValue({});

      await unregisterPlugin('plugin-1');
      expect(mockDocument.delete).toHaveBeenCalledWith({ where: { id: 'plugin-1' } });
    });

    it('should throw if plugin not found', async () => {
      (mockDocument.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(unregisterPlugin('nonexistent')).rejects.toThrow('not found');
    });
  });
});
