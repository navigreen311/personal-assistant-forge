/**
 * T-018: brand kits used to live in an in-memory Map keyed by a raw entityId
 * off the request. They are now persisted on `Entity.brandKit` (a Json column
 * that already existed -- no migration) and scoped by a VerifiedEntityId.
 *
 * These tests changed shape accordingly: `brandKitStore` is gone because the
 * store is gone, and the assertions are now about what reaches Prisma.
 */
jest.mock('@/lib/db', () => ({
  prisma: {
    entity: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

import {
  getBrandKit,
  updateBrandKit,
} from '@/modules/documents/services/brand-kit-service';
import { verifiedEntityIdForTest } from '../../helpers/factories';
import { prisma } from '@/lib/db';

const mockFindUnique = prisma.entity.findUnique as jest.Mock;
const mockUpdateMany = prisma.entity.updateMany as jest.Mock;

const ENTITY_A = verifiedEntityIdForTest('entity-1');

describe('brand-kit-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  describe('getBrandKit', () => {
    it('returns null for an entity with no brand kit', async () => {
      mockFindUnique.mockResolvedValue({ brandKit: null });

      const result = await getBrandKit(verifiedEntityIdForTest('entity-no-kit'));

      expect(result).toBeNull();
    });

    it('returns null when the entity does not exist', async () => {
      mockFindUnique.mockResolvedValue(null);

      expect(await getBrandKit(verifiedEntityIdForTest('nope'))).toBeNull();
    });

    it('returns the stored brand kit, stamped with the scope', async () => {
      mockFindUnique.mockResolvedValue({ brandKit: { primaryColor: '#FF0000' } });

      const result = await getBrandKit(ENTITY_A);

      expect(result).not.toBeNull();
      expect(result!.entityId).toBe('entity-1');
      expect(result!.primaryColor).toBe('#FF0000');
    });

    it('reads only the entity in scope', async () => {
      mockFindUnique.mockResolvedValue({ brandKit: {} });

      await getBrandKit(ENTITY_A);

      expect(mockFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'entity-1' } })
      );
    });
  });

  describe('updateBrandKit', () => {
    it('creates a brand kit with defaults when none exists', async () => {
      mockFindUnique.mockResolvedValue({ brandKit: null });

      const result = await updateBrandKit(verifiedEntityIdForTest('entity-new'), {
        logoUrl: 'https://logo.png',
      });

      expect(result.entityId).toBe('entity-new');
      expect(result.primaryColor).toBe('#000000');
      expect(result.secondaryColor).toBe('#666666');
      expect(result.fontFamily).toBe('Arial, sans-serif');
      expect(result.logoUrl).toBe('https://logo.png');
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'entity-new' } })
      );
    });

    it('merges partial updates into the existing brand kit', async () => {
      mockFindUnique.mockResolvedValue({
        brandKit: {
          primaryColor: '#FF0000',
          secondaryColor: '#00FF00',
          fontFamily: 'Helvetica',
        },
      });

      const updated = await updateBrandKit(ENTITY_A, {
        primaryColor: '#0000FF',
        logoUrl: 'https://new-logo.png',
      });

      expect(updated.primaryColor).toBe('#0000FF');
      expect(updated.secondaryColor).toBe('#00FF00');
      expect(updated.fontFamily).toBe('Helvetica');
      expect(updated.logoUrl).toBe('https://new-logo.png');
      expect(updated.entityId).toBe('entity-1');
    });

    it('ignores an entityId supplied in the payload -- the scope wins', async () => {
      mockFindUnique.mockResolvedValue({ brandKit: null });

      const updated = await updateBrandKit(ENTITY_A, {
        entityId: 'entity-belonging-to-someone-else',
        primaryColor: '#123456',
      });

      expect(updated.entityId).toBe('entity-1');
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'entity-1' } })
      );
      // The scope is never written into the stored blob either.
      const written = mockUpdateMany.mock.calls[0][0].data.brandKit;
      expect(written).not.toHaveProperty('entityId');
    });

    it('throws rather than silently writing nothing when the row is not matched', async () => {
      mockFindUnique.mockResolvedValue({ brandKit: null });
      mockUpdateMany.mockResolvedValue({ count: 0 });

      await expect(
        updateBrandKit(verifiedEntityIdForTest('gone'), { primaryColor: '#000' })
      ).rejects.toThrow('not found');
    });
  });
});
