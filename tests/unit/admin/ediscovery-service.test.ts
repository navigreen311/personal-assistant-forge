import {
  requestExport,
  getExportStatus,
  listExports,
  exportStore,
} from '@/modules/admin/services/ediscovery-service';
import type { EDiscoveryExport } from '@/modules/admin/types';

describe('EDiscoveryService', () => {
  beforeEach(() => {
    exportStore.clear();
  });

  describe('requestExport', () => {
    it('should create an export request with PENDING status', async () => {
      const result = await requestExport(
        'entity-1',
        'admin-user',
        { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
        ['messages', 'documents']
      );

      expect(result.id).toBeDefined();
      expect(result.entityId).toBe('entity-1');
      expect(result.requestedBy).toBe('admin-user');
      expect(result.status).toBe('PENDING');
      expect(result.dataTypes).toEqual(['messages', 'documents']);
      expect(result.requestedAt).toBeInstanceOf(Date);
    });

    it('should store the export in the exportStore', async () => {
      const result = await requestExport(
        'entity-1',
        'admin-user',
        { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
        ['messages']
      );

      expect(exportStore.get(result.id)).toBeDefined();
      expect(exportStore.get(result.id)!.entityId).toBe('entity-1');
    });

    it('should include dateRange in the export request', async () => {
      const start = new Date('2026-01-01');
      const end = new Date('2026-01-31');
      const result = await requestExport('entity-1', 'admin-user', { start, end }, ['messages']);

      expect(result.dateRange.start).toBe(start);
      expect(result.dateRange.end).toBe(end);
    });
  });

  describe('getExportStatus', () => {
    it('should return the export by ID', async () => {
      const created = await requestExport(
        'entity-1',
        'admin-user',
        { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
        ['messages']
      );

      const result = await getExportStatus(created.id);
      expect(result.id).toBe(created.id);
      expect(result.entityId).toBe('entity-1');
    });

    it('should throw an error for a non-existent export ID', async () => {
      await expect(getExportStatus('nonexistent-id')).rejects.toThrow(
        'Export nonexistent-id not found'
      );
    });
  });

  describe('listExports', () => {
    it('should return all exports for a given entity', async () => {
      await requestExport(
        'entity-1',
        'admin-user',
        { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
        ['messages']
      );
      await requestExport(
        'entity-1',
        'admin-user',
        { start: new Date('2026-02-01'), end: new Date('2026-02-28') },
        ['documents']
      );
      await requestExport(
        'entity-2',
        'admin-user',
        { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
        ['messages']
      );

      const results = await listExports('entity-1');
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.entityId === 'entity-1')).toBe(true);
    });

    it('should return exports sorted by requestedAt descending', async () => {
      await requestExport(
        'entity-1',
        'admin-user',
        { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
        ['messages']
      );
      await requestExport(
        'entity-1',
        'admin-user',
        { start: new Date('2026-02-01'), end: new Date('2026-02-28') },
        ['documents']
      );

      const results = await listExports('entity-1');
      expect(results[0].requestedAt.getTime()).toBeGreaterThanOrEqual(
        results[1].requestedAt.getTime()
      );
    });

    it('should return empty array for entity with no exports', async () => {
      const results = await listExports('nonexistent-entity');
      expect(results).toEqual([]);
    });
  });
});
