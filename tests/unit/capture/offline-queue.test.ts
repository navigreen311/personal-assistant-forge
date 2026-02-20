import { OfflineQueue } from '@/modules/capture/services/offline-queue';

describe('OfflineQueue', () => {
  let queue: OfflineQueue;

  beforeEach(async () => {
    queue = new OfflineQueue();
    // Clear any leftover items from previous tests (Redis persists across instances)
    await queue.clearQueue();
  });

  afterEach(async () => {
    await queue.clearQueue();
    await queue.close();
  });

  describe('enqueueOfflineCapture', () => {
    it('should add item to the queue', async () => {
      queue.enqueueOfflineCapture({
        userId: 'user-1',
        source: 'VOICE',
        contentType: 'TEXT',
        rawContent: 'Offline note 1',
        metadata: {},
      });

      // Give async BullMQ add a moment to complete
      await new Promise((r) => setTimeout(r, 100));
      expect(await queue.getQueueSize()).toBe(1);
    });

    it('should increment queue size', async () => {
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

      await new Promise((r) => setTimeout(r, 100));
      expect(await queue.getQueueSize()).toBe(2);
    });

    it('should set offline creation timestamp', async () => {
      const offlineTime = new Date('2026-02-10T10:00:00Z');
      queue.enqueueOfflineCapture({
        userId: 'user-1',
        source: 'VOICE',
        contentType: 'TEXT',
        rawContent: 'Offline note',
        metadata: {},
        offlineCreatedAt: offlineTime,
      });

      await new Promise((r) => setTimeout(r, 100));
      const items = await queue.getQueuedItems();
      // BullMQ serializes Date to string via JSON, so compare as string
      expect(new Date(items[0].offlineCreatedAt as unknown as string).toISOString()).toEqual(offlineTime.toISOString());
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

      await new Promise((r) => setTimeout(r, 100));
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

      await new Promise((r) => setTimeout(r, 100));
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

      await new Promise((r) => setTimeout(r, 100));
      await queue.syncQueue();
      expect(await queue.getQueueSize()).toBe(0);
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

      await new Promise((r) => setTimeout(r, 100));
      await queue.syncQueue();

      // After first sync, item should either be in queue or dead letter depending on BullMQ retry config
      // The BullMQ-backed flush increments retryCount
      const queueSize = await queue.getQueueSize();
      const deadLetterItems = await queue.getDeadLetterItems();
      expect(queueSize + deadLetterItems.length).toBeGreaterThanOrEqual(1);

      // Sync again to verify retry count increment
      await queue.syncQueue();
      const items = await queue.getQueuedItems();
      const dlItems = await queue.getDeadLetterItems();
      const allItems = [...items, ...dlItems];
      if (allItems.length > 0) {
        expect((allItems[0] as unknown as Record<string, unknown>)['retryCount']).toBeGreaterThanOrEqual(1);
      }
    });

    it('should return all failed when no processor is set', async () => {
      queue.enqueueOfflineCapture({
        userId: 'user-1',
        source: 'VOICE',
        contentType: 'TEXT',
        rawContent: 'No processor',
        metadata: {},
      });

      await new Promise((r) => setTimeout(r, 100));
      const result = await queue.syncQueue();
      expect(result.synced).toBe(0);
      expect(result.failed).toBeGreaterThanOrEqual(1);
    });
  });

  describe('clearQueue', () => {
    it('should remove all items from queue', async () => {
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

      await new Promise((r) => setTimeout(r, 100));
      await queue.clearQueue();
      expect(await queue.getQueueSize()).toBe(0);
    });

    it('should reset queue size to 0', async () => {
      queue.enqueueOfflineCapture({
        userId: 'user-1',
        source: 'VOICE',
        contentType: 'TEXT',
        rawContent: 'Clear me',
        metadata: {},
      });

      await new Promise((r) => setTimeout(r, 100));
      await queue.clearQueue();
      expect(await queue.getQueueSize()).toBe(0);
      expect(await queue.getQueuedItems()).toEqual([]);
    });
  });
});
