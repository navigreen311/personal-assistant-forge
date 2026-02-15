import { OfflineQueue } from '@/modules/capture/services/offline-queue';

describe('OfflineQueue', () => {
  let queue: OfflineQueue;

  beforeEach(() => {
    queue = new OfflineQueue();
  });

  describe('enqueueOfflineCapture', () => {
    it('should add item to the queue', () => {
      queue.enqueueOfflineCapture({
        userId: 'user-1',
        source: 'VOICE',
        contentType: 'TEXT',
        rawContent: 'Offline note 1',
        metadata: {},
      });

      expect(queue.getQueueSize()).toBe(1);
    });

    it('should increment queue size', () => {
      queue.enqueueOfflineCapture({
        userId: 'user-1',
        source: 'VOICE',
        contentType: 'TEXT',
        rawContent: 'Note 1',
        metadata: {},
      });
      queue.enqueueOfflineCapture({
        userId: 'user-1',
        source: 'MANUAL',
        contentType: 'TEXT',
        rawContent: 'Note 2',
        metadata: {},
      });

      expect(queue.getQueueSize()).toBe(2);
    });

    it('should set offline creation timestamp', () => {
      const offlineTime = new Date('2026-02-10T10:00:00Z');
      queue.enqueueOfflineCapture({
        userId: 'user-1',
        source: 'VOICE',
        contentType: 'TEXT',
        rawContent: 'Offline note',
        metadata: {},
        offlineCreatedAt: offlineTime,
      });

      const items = queue.getQueuedItems();
      expect(items[0].offlineCreatedAt).toEqual(offlineTime);
    });
  });

  describe('syncQueue', () => {
    it('should process all queued items', async () => {
      const processor = jest.fn().mockResolvedValue({});
      queue.setProcessor(processor);

      queue.enqueueOfflineCapture({
        userId: 'user-1',
        source: 'VOICE',
        contentType: 'TEXT',
        rawContent: 'Sync me',
        metadata: {},
      });

      const result = await queue.syncQueue();
      expect(result.synced).toBe(1);
      expect(result.failed).toBe(0);
      expect(processor).toHaveBeenCalledTimes(1);
    });

    it('should return count of synced and failed items', async () => {
      let callCount = 0;
      const processor = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({});
      });
      queue.setProcessor(processor);

      queue.enqueueOfflineCapture({
        userId: 'user-1',
        source: 'VOICE',
        contentType: 'TEXT',
        rawContent: 'Item 1',
        metadata: {},
      });
      queue.enqueueOfflineCapture({
        userId: 'user-1',
        source: 'VOICE',
        contentType: 'TEXT',
        rawContent: 'Item 2 (will fail)',
        metadata: {},
      });
      queue.enqueueOfflineCapture({
        userId: 'user-1',
        source: 'VOICE',
        contentType: 'TEXT',
        rawContent: 'Item 3',
        metadata: {},
      });

      const result = await queue.syncQueue();
      expect(result.synced).toBe(2);
      expect(result.failed).toBe(1);
    });

    it('should remove successfully synced items', async () => {
      const processor = jest.fn().mockResolvedValue({});
      queue.setProcessor(processor);

      queue.enqueueOfflineCapture({
        userId: 'user-1',
        source: 'VOICE',
        contentType: 'TEXT',
        rawContent: 'Sync me',
        metadata: {},
      });

      await queue.syncQueue();
      expect(queue.getQueueSize()).toBe(0);
    });

    it('should retain failed items with incremented retry count', async () => {
      const processor = jest.fn().mockRejectedValue(new Error('Network error'));
      queue.setProcessor(processor);

      queue.enqueueOfflineCapture({
        userId: 'user-1',
        source: 'VOICE',
        contentType: 'TEXT',
        rawContent: 'Will fail',
        metadata: {},
      });

      await queue.syncQueue();
      expect(queue.getQueueSize()).toBe(1);

      // Sync again to verify retry count increment
      await queue.syncQueue();
      const items = queue.getQueuedItems();
      expect((items[0] as Record<string, unknown>)['retryCount']).toBe(2);
    });

    it('should return all failed when no processor is set', async () => {
      queue.enqueueOfflineCapture({
        userId: 'user-1',
        source: 'VOICE',
        contentType: 'TEXT',
        rawContent: 'No processor',
        metadata: {},
      });

      const result = await queue.syncQueue();
      expect(result.synced).toBe(0);
      expect(result.failed).toBe(1);
    });
  });

  describe('clearQueue', () => {
    it('should remove all items from queue', () => {
      queue.enqueueOfflineCapture({
        userId: 'user-1',
        source: 'VOICE',
        contentType: 'TEXT',
        rawContent: 'Item 1',
        metadata: {},
      });
      queue.enqueueOfflineCapture({
        userId: 'user-1',
        source: 'VOICE',
        contentType: 'TEXT',
        rawContent: 'Item 2',
        metadata: {},
      });

      queue.clearQueue();
      expect(queue.getQueueSize()).toBe(0);
    });

    it('should reset queue size to 0', () => {
      queue.enqueueOfflineCapture({
        userId: 'user-1',
        source: 'VOICE',
        contentType: 'TEXT',
        rawContent: 'Clear me',
        metadata: {},
      });

      queue.clearQueue();
      expect(queue.getQueueSize()).toBe(0);
      expect(queue.getQueuedItems()).toEqual([]);
    });
  });
});
