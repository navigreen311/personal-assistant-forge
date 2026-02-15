import { createSOP, getSOP, listSOPs, updateSOP, matchSOPToContext, recordUsage } from '@/modules/knowledge/services/sop-service';

jest.mock('@/lib/db', () => ({
  prisma: {
    document: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

const mockCreate = prisma.document.create as jest.Mock;
const mockFindUnique = prisma.document.findUnique as jest.Mock;
const mockFindMany = prisma.document.findMany as jest.Mock;
const mockUpdate = prisma.document.update as jest.Mock;

function makeSOPDoc(overrides: Record<string, unknown> = {}) {
  const sopData = {
    title: overrides.title || 'Test SOP',
    description: overrides.description || 'Test description',
    steps: overrides.steps || [{ order: 1, instruction: 'Step 1', isOptional: false }],
    triggerConditions: overrides.triggerConditions || ['new employee', 'onboarding'],
    status: overrides.sopStatus || 'ACTIVE',
    lastUsed: null,
    useCount: overrides.useCount || 0,
  };

  return {
    id: overrides.id || 'sop-1',
    title: sopData.title,
    entityId: overrides.entityId || 'entity-1',
    type: 'SOP',
    version: overrides.version || 1,
    content: JSON.stringify(sopData),
    status: 'APPROVED',
    citations: [],
    createdAt: overrides.createdAt || new Date().toISOString(),
    updatedAt: overrides.updatedAt || new Date().toISOString(),
  };
}

describe('sop-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSOP', () => {
    it('should create a new SOP with version 1', async () => {
      mockCreate.mockResolvedValue(makeSOPDoc());

      const sop = await createSOP({
        entityId: 'entity-1',
        title: 'Test SOP',
        description: 'Test description',
        steps: [{ order: 1, instruction: 'Step 1', isOptional: false }],
        triggerConditions: ['new employee'],
        tags: ['hr'],
        status: 'ACTIVE',
      });

      expect(sop.title).toBe('Test SOP');
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSOP', () => {
    it('should return SOP by id', async () => {
      mockFindUnique.mockResolvedValue(makeSOPDoc({ id: 'sop-1' }));

      const sop = await getSOP('sop-1');
      expect(sop).not.toBeNull();
      expect(sop!.id).toBe('sop-1');
    });

    it('should return null for non-existent SOP', async () => {
      mockFindUnique.mockResolvedValue(null);
      const sop = await getSOP('nonexistent');
      expect(sop).toBeNull();
    });
  });

  describe('updateSOP', () => {
    it('should increment version on update', async () => {
      const existingDoc = makeSOPDoc({ id: 'sop-1', version: 1 });
      mockFindUnique.mockResolvedValue(existingDoc);

      const updatedDoc = makeSOPDoc({ id: 'sop-1', version: 2, title: 'Updated SOP' });
      mockUpdate.mockResolvedValue(updatedDoc);

      const sop = await updateSOP('sop-1', { title: 'Updated SOP' });

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.data.version).toBe(2);
    });

    it('should throw for non-existent SOP', async () => {
      mockFindUnique.mockResolvedValue(null);
      await expect(updateSOP('nonexistent', { title: 'Test' })).rejects.toThrow();
    });
  });

  describe('listSOPs', () => {
    it('should return SOPs filtered by status', async () => {
      mockFindMany.mockResolvedValue([
        makeSOPDoc({ id: 'sop-1', sopStatus: 'ACTIVE' }),
        makeSOPDoc({ id: 'sop-2', sopStatus: 'DRAFT' }),
      ]);

      const sops = await listSOPs('entity-1', { status: 'ACTIVE' });
      expect(sops.every((s) => s.status === 'ACTIVE')).toBe(true);
    });
  });

  describe('matchSOPToContext', () => {
    it('should find SOPs whose trigger conditions match context', async () => {
      mockFindMany.mockResolvedValue([
        makeSOPDoc({ id: 'sop-1', triggerConditions: ['new employee', 'onboarding'] }),
        makeSOPDoc({ id: 'sop-2', triggerConditions: ['monthly report', 'audit'] }),
      ]);

      const matches = await matchSOPToContext('new employee just started onboarding', 'entity-1');
      expect(matches.some((s) => s.id === 'sop-1')).toBe(true);
    });

    it('should return empty for no matches', async () => {
      mockFindMany.mockResolvedValue([
        makeSOPDoc({ id: 'sop-1', triggerConditions: ['specific event'] }),
      ]);

      const matches = await matchSOPToContext('completely unrelated context', 'entity-1');
      expect(matches.length).toBe(0);
    });
  });

  describe('recordUsage', () => {
    it('should increment useCount', async () => {
      mockFindUnique.mockResolvedValue(makeSOPDoc({ id: 'sop-1', useCount: 5 }));
      mockUpdate.mockResolvedValue({});

      await recordUsage('sop-1');

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      const updateCall = mockUpdate.mock.calls[0][0];
      const updatedContent = JSON.parse(updateCall.data.content);
      expect(updatedContent.useCount).toBe(6);
    });

    it('should throw for non-existent SOP', async () => {
      mockFindUnique.mockResolvedValue(null);
      await expect(recordUsage('nonexistent')).rejects.toThrow();
    });
  });
});
