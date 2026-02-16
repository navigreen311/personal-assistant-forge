import {
  getBrandKit,
  updateBrandKit,
  brandKitStore,
} from '@/modules/documents/services/brand-kit-service';

describe('brand-kit-service', () => {
  beforeEach(() => {
    brandKitStore.clear();
  });

  describe('getBrandKit', () => {
    it('returns null for entity with no brand kit', async () => {
      const result = await getBrandKit('entity-no-kit');
      expect(result).toBeNull();
    });

    it('returns the brand kit for a known entity', async () => {
      await updateBrandKit('entity-1', { primaryColor: '#FF0000' });

      const result = await getBrandKit('entity-1');

      expect(result).not.toBeNull();
      expect(result!.entityId).toBe('entity-1');
      expect(result!.primaryColor).toBe('#FF0000');
    });
  });

  describe('updateBrandKit', () => {
    it('creates a brand kit with defaults when none exists', async () => {
      const result = await updateBrandKit('entity-new', { logoUrl: 'https://logo.png' });

      expect(result.entityId).toBe('entity-new');
      expect(result.primaryColor).toBe('#000000');
      expect(result.secondaryColor).toBe('#666666');
      expect(result.fontFamily).toBe('Arial, sans-serif');
      expect(result.logoUrl).toBe('https://logo.png');
      expect(brandKitStore.has('entity-new')).toBe(true);
    });

    it('merges partial updates into existing brand kit', async () => {
      await updateBrandKit('entity-1', {
        primaryColor: '#FF0000',
        secondaryColor: '#00FF00',
        fontFamily: 'Helvetica',
      });

      const updated = await updateBrandKit('entity-1', {
        primaryColor: '#0000FF',
        logoUrl: 'https://new-logo.png',
      });

      expect(updated.primaryColor).toBe('#0000FF');
      expect(updated.secondaryColor).toBe('#00FF00');
      expect(updated.fontFamily).toBe('Helvetica');
      expect(updated.logoUrl).toBe('https://new-logo.png');
      expect(updated.entityId).toBe('entity-1');
    });
  });
});
