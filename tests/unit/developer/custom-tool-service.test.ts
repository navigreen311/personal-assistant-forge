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

jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
import {
  createTool,
  getTool,
  getTools,
  updateTool,
  deleteTool,
  validateToolSchema,
  testToolExecution,
} from '@/modules/developer/services/custom-tool-service';

const mockDocument = prisma.document as jest.Mocked<typeof prisma.document>;
const mockGenerateJSON = generateJSON as jest.Mock;

describe('Custom Tool Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const toolDef = {
    entityId: 'entity-1',
    name: 'My Tool',
    description: 'A test tool',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
    outputSchema: {},
    implementation: 'WEBHOOK' as const,
    config: { url: 'https://example.com/hook' },
    isActive: true,
  };

  describe('createTool', () => {
    it('should create a document with type CUSTOM_TOOL', async () => {
      const mockDoc = {
        id: 'tool-1',
        title: 'My Tool',
        entityId: 'entity-1',
        type: 'CUSTOM_TOOL',
        version: 1,
        templateId: null,
        citations: [],
        content: JSON.stringify(toolDef),
        status: 'ACTIVE',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (mockDocument.create as jest.Mock).mockResolvedValue(mockDoc);

      const result = await createTool(toolDef);

      expect(mockDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'CUSTOM_TOOL' }),
        })
      );
      expect(result.id).toBe('tool-1');
    });

    it('should store tool definition in content', async () => {
      const mockDoc = {
        id: 'tool-1',
        title: 'My Tool',
        entityId: 'entity-1',
        type: 'CUSTOM_TOOL',
        version: 1,
        templateId: null,
        citations: [],
        content: JSON.stringify(toolDef),
        status: 'ACTIVE',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (mockDocument.create as jest.Mock).mockResolvedValue(mockDoc);

      const result = await createTool(toolDef);

      expect(result.name).toBe('My Tool');
      expect(result.description).toBe('A test tool');
      expect(result.inputSchema).toEqual(toolDef.inputSchema);
    });
  });

  describe('validateToolSchema', () => {
    it('should validate well-formed JSON Schema', () => {
      const result = validateToolSchema({
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid schema', () => {
      const result = validateToolSchema({
        type: 'array',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Root schema type must be "object"');
    });

    it('should reject when required field not in properties', () => {
      const result = validateToolSchema({
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name', 'email'],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('email'))).toBe(true);
    });
  });

  describe('testToolExecution', () => {
    const mockToolDoc = {
      id: 'tool-1',
      title: 'My Tool',
      entityId: 'entity-1',
      type: 'CUSTOM_TOOL',
      version: 1,
      templateId: null,
      citations: [],
      content: JSON.stringify(toolDef),
      status: 'ACTIVE',
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should validate input against schema', async () => {
      (mockDocument.findUnique as jest.Mock).mockResolvedValue(mockToolDoc);
      mockGenerateJSON.mockResolvedValue({ reasonable: true, issues: [] });

      const result = await testToolExecution('tool-1', { query: 'test' });
      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
    });

    it('should fail for invalid input', async () => {
      (mockDocument.findUnique as jest.Mock).mockResolvedValue(mockToolDoc);

      const result = await testToolExecution('tool-1', {});
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('query'))).toBe(true);
    });

    it('should use AI to evaluate output', async () => {
      (mockDocument.findUnique as jest.Mock).mockResolvedValue(mockToolDoc);
      mockGenerateJSON.mockResolvedValue({ reasonable: true, issues: [] });

      await testToolExecution('tool-1', { query: 'test' });
      expect(mockGenerateJSON).toHaveBeenCalled();
    });

    it('should handle AI failure gracefully', async () => {
      (mockDocument.findUnique as jest.Mock).mockResolvedValue(mockToolDoc);
      mockGenerateJSON.mockRejectedValue(new Error('AI service down'));

      const result = await testToolExecution('tool-1', { query: 'test' });
      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
    });
  });

  describe('updateTool', () => {
    it('should increment version on update', async () => {
      const mockDoc = {
        id: 'tool-1',
        title: 'My Tool',
        type: 'CUSTOM_TOOL',
        version: 1,
        content: JSON.stringify(toolDef),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (mockDocument.findUnique as jest.Mock).mockResolvedValue(mockDoc);
      (mockDocument.update as jest.Mock).mockResolvedValue({
        ...mockDoc,
        version: 2,
        content: JSON.stringify({ ...toolDef, name: 'Updated Tool' }),
      });

      const result = await updateTool('tool-1', { name: 'Updated Tool' });
      expect(mockDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ version: 2 }),
        })
      );
    });
  });

  describe('deleteTool', () => {
    it('should delete the tool document', async () => {
      (mockDocument.findUnique as jest.Mock).mockResolvedValue({
        id: 'tool-1',
        type: 'CUSTOM_TOOL',
        content: JSON.stringify(toolDef),
      });
      (mockDocument.delete as jest.Mock).mockResolvedValue({});

      await deleteTool('tool-1');
      expect(mockDocument.delete).toHaveBeenCalledWith({ where: { id: 'tool-1' } });
    });
  });
});
