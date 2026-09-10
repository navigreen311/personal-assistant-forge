import { createSOP, getSOP, listSOPs, updateSOP, matchSOPToContext, recordUsage } from '@/modules/knowledge/services/sop-service';

// tenancy-pattern.md sec.8 trap 1: reads are now findFirst (scope in the WHERE)
// and writes updateMany, so the mock declares those delegates.
jest.mock('@/lib/db', () => ({
  prisma: {
    document: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import { verifiedEntityIdForTest } from '../../helpers/factories';

const mockCreate = prisma.document.create as jest.Mock;
const mockFindFirst = prisma.document.findFirst as jest.Mock;
const mockFindMany = prisma.document.findMany as jest.Mock;
const mockUpdateMany = prisma.document.updateMany as jest.Mock;

const ENTITY_1 = verifiedEntityIdForTest('entity-1');
const ENTITY_2 = verifiedEntityIdForTest('entity-2');

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

      const sop = await createSOP(
        {
          title: 'Test SOP',
          description: 'Test description',
          steps: [{ order: 1, instruction: 'Step 1', isOptional: false }],
          triggerConditions: ['new employee'],
          tags: ['hr'],
          status: 'ACTIVE',
        },
        ENTITY_1
      );

      expect(sop.title).toBe('Test SOP');
      expect(mockCreate).toHaveBeenCalledTimes(1);
      // The scope is written, not anything the caller supplied.
      expect(mockCreate.mock.calls[0][0].data.entityId).toBe('entity-1');
    });
  });

  describe('getSOP', () => {
    it('should return SOP by id', async () => {
      mockFindFirst.mockResolvedValue(makeSOPDoc({ id: 'sop-1' }));

      const sop = await getSOP('sop-1', ENTITY_1);
      expect(sop).not.toBeNull();
      expect(sop!.id).toBe('sop-1');
    });

    it('should return null for non-existent SOP', async () => {
      mockFindFirst.mockResolvedValue(null);
      const sop = await getSOP('nonexistent', ENTITY_1);
      expect(sop).toBeNull();
    });

    it('puts the scope in the WHERE clause rather than checking after the read', async () => {
      mockFindFirst.mockResolvedValue(makeSOPDoc({ id: 'sop-1' }));

      await getSOP('sop-1', ENTITY_1);

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { id: 'sop-1', entityId: 'entity-1', type: 'SOP' },
      });
    });
  });

  describe('updateSOP', () => {
    it('should increment version on update', async () => {
      mockFindFirst.mockResolvedValue(makeSOPDoc({ id: 'sop-1', version: 1 }));
      mockUpdateMany.mockResolvedValue({ count: 1 });

      await updateSOP('sop-1', ENTITY_1, { title: 'Updated SOP' });

      expect(mockUpdateMany).toHaveBeenCalledTimes(1);
      const updateCall = mockUpdateMany.mock.calls[0][0];
      expect(updateCall.data.version).toBe(2);
      expect(updateCall.where).toEqual({ id: 'sop-1', entityId: 'entity-1', type: 'SOP' });
    });

    it('should throw for non-existent SOP', async () => {
      mockFindFirst.mockResolvedValue(null);
      await expect(updateSOP('nonexistent', ENTITY_1, { title: 'Test' })).rejects.toThrow();
    });

    it("refuses another tenant's SOP, and writes nothing", async () => {
      mockFindFirst.mockResolvedValue(null); // out of scope, so not found

      await expect(updateSOP('sop-1', ENTITY_2, { title: 'Hijacked' })).rejects.toThrow();
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe('listSOPs', () => {
    it('should return SOPs filtered by status', async () => {
      mockFindMany.mockResolvedValue([
        makeSOPDoc({ id: 'sop-1', sopStatus: 'ACTIVE' }),
        makeSOPDoc({ id: 'sop-2', sopStatus: 'DRAFT' }),
      ]);

      const sops = await listSOPs(ENTITY_1, { status: 'ACTIVE' });
      expect(sops.every((s) => s.status === 'ACTIVE')).toBe(true);
    });
  });

  describe('matchSOPToContext', () => {
    it('should find SOPs whose trigger conditions match context', async () => {
      mockFindMany.mockResolvedValue([
        makeSOPDoc({ id: 'sop-1', triggerConditions: ['new employee', 'onboarding'] }),
        makeSOPDoc({ id: 'sop-2', triggerConditions: ['monthly report', 'audit'] }),
      ]);

      const matches = await matchSOPToContext('new employee just started onboarding', ENTITY_1);
      expect(matches.some((s) => s.id === 'sop-1')).toBe(true);
    });

    it('should return empty for no matches', async () => {
      mockFindMany.mockResolvedValue([
        makeSOPDoc({ id: 'sop-1', triggerConditions: ['specific event'] }),
      ]);

      const matches = await matchSOPToContext('completely unrelated context', ENTITY_1);
      expect(matches.length).toBe(0);
    });
  });

  describe('recordUsage', () => {
    it('should increment useCount', async () => {
      mockFindFirst.mockResolvedValue(makeSOPDoc({ id: 'sop-1', useCount: 5 }));
      mockUpdateMany.mockResolvedValue({ count: 1 });

      await recordUsage('sop-1', ENTITY_1);

      expect(mockUpdateMany).toHaveBeenCalledTimes(1);
      const updateCall = mockUpdateMany.mock.calls[0][0];
      const updatedContent = JSON.parse(updateCall.data.content);
      expect(updatedContent.useCount).toBe(6);
      expect(updateCall.where).toEqual({ id: 'sop-1', entityId: 'entity-1', type: 'SOP' });
    });

    it('should throw for non-existent SOP', async () => {
      mockFindFirst.mockResolvedValue(null);
      await expect(recordUsage('nonexistent', ENTITY_1)).rejects.toThrow();
    });
  });
});
