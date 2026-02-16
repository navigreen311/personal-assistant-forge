import {
  getAvailableSources,
  initiateImport,
  getImportStatus,
  cancelImport,
  importStore,
} from '@/modules/onboarding/services/migration-service';

describe('migration-service', () => {
  beforeEach(() => {
    importStore.clear();
  });

  describe('getAvailableSources', () => {
    it('should return 9 predefined sources all with NOT_STARTED status', () => {
      const sources = getAvailableSources();

      expect(sources).toHaveLength(9);
      for (const source of sources) {
        expect(source.status).toBe('NOT_STARTED');
        expect(source.isConnected).toBe(false);
      }
    });

    it('should include expected source ids', () => {
      const sources = getAvailableSources();
      const ids = sources.map((s) => s.id);

      expect(ids).toContain('notion');
      expect(ids).toContain('todoist');
      expect(ids).toContain('asana');
      expect(ids).toContain('google-calendar');
      expect(ids).toContain('outlook-calendar');
      expect(ids).toContain('gmail');
      expect(ids).toContain('outlook-mail');
      expect(ids).toContain('hubspot');
      expect(ids).toContain('salesforce');
    });
  });

  describe('initiateImport', () => {
    it('should set source to IMPORTING with isConnected=true', async () => {
      const result = await initiateImport('user-1', 'notion');

      expect(result.id).toBe('notion');
      expect(result.status).toBe('IMPORTING');
      expect(result.isConnected).toBe(true);
      expect(result.importedCount).toBe(0);
    });

    it('should throw for unknown sourceId', async () => {
      await expect(initiateImport('user-1', 'unknown-source')).rejects.toThrow(
        'Source unknown-source not found'
      );
    });

    it('should store the import keyed by userId:sourceId', async () => {
      await initiateImport('user-1', 'todoist');

      expect(importStore.has('user-1:todoist')).toBe(true);
      const stored = importStore.get('user-1:todoist');
      expect(stored?.status).toBe('IMPORTING');
    });
  });

  describe('getImportStatus', () => {
    it('should return current status for an imported source', async () => {
      await initiateImport('user-1', 'gmail');

      const status = await getImportStatus('user-1', 'gmail');

      expect(status.status).toBe('IMPORTING');
      expect(status.isConnected).toBe(true);
    });

    it('should return default source info when no import has been started', async () => {
      const status = await getImportStatus('user-1', 'notion');

      expect(status.id).toBe('notion');
      expect(status.status).toBe('NOT_STARTED');
      expect(status.isConnected).toBe(false);
    });

    it('should throw for unknown sourceId when no import exists', async () => {
      await expect(getImportStatus('user-1', 'unknown')).rejects.toThrow(
        'Source unknown not found'
      );
    });
  });

  describe('cancelImport', () => {
    it('should reset source to NOT_STARTED with isConnected=false', async () => {
      await initiateImport('user-1', 'asana');
      await cancelImport('user-1', 'asana');

      const stored = importStore.get('user-1:asana');
      expect(stored?.status).toBe('NOT_STARTED');
      expect(stored?.isConnected).toBe(false);
    });

    it('should do nothing if no import exists for the key', async () => {
      // Should not throw
      await cancelImport('user-1', 'notion');

      expect(importStore.has('user-1:notion')).toBe(false);
    });
  });
});
