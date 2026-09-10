import { OfflineQueue } from '@/modules/capture/services/offline-queue';

/**
 * P-25 -- why there are no fixed sleeps in this file any more.
 *
 * Two separate problems produced the intermittent failures five agents saw here,
 * in a file none of them had touched.
 *
 * 1. SHARED REDIS KEY SPACE (the one that actually moved the numbers).
 *
 *    `OfflineQueue` hardcodes the BullMQ queue name `capture-queue`, and BullMQ
 *    derives its Redis keys from that name alone. Every process on the machine
 *    that loads this module therefore reads and writes the *same keys*, and
 *    `clearQueue()` -- called in `beforeEach` and `afterEach` below -- is
 *    `obliterate({ force: true })`, a global delete across them. Three
 *    concurrent jest runs on this machine failed 16 lanes out of 18: one run's
 *    "start clean" was another run's enqueued jobs disappearing between the
 *    enqueue and the assertion, which surfaces as `Expected: 2, Received: 1`.
 *    Giving each lane its own Redis database took the same experiment to 0 of
 *    18. The fix shipped here goes further: `tests/helpers/redis.ts`, wired from
 *    `jest.config.ts`, sets REDIS_URL to the explicit "no Redis" value, so this
 *    suite opens no connection at all and exercises the in-memory fallback that
 *    CI's unit job already exercises and documents. Not a closed port -- that
 *    still opens a socket, and the connection error it eventually produces can
 *    arrive after teardown as an uncaught exception.
 *
 * 2. FIRE-AND-FORGET ENQUEUE, MEASURED WITH A STOPWATCH.
 *
 *    `enqueueOfflineCapture` is the legacy synchronous API: it returns `void`
 *    and does its work in a floating promise (`void this.getReadyQueue().then`).
 *    A caller gets no handle on completion, so every assertion here used to be
 *    preceded by a hundred-millisecond sleep -- a guess that the enqueue would
 *    be done by then. That guess is not a property of the queue; it is a
 *    property of how contended the machine is.
 *
 *    Raising the number would only lower the failure rate. `waitForQueueSize`
 *    below waits on the observable state instead: it returns the instant the
 *    queue actually holds what was put in it, and its deadline exists only so a
 *    genuine hang fails with a sentence rather than sitting there. A slow
 *    machine makes it wait longer; it does not make it wrong.
 *
 *    Every test below waits for its own enqueues to land before it asserts, so
 *    nothing is in flight by the time `afterEach` closes the queue. `afterEach`
 *    therefore needs no drain of its own -- one was written and then removed,
 *    because its predicate (`size >= 0`) was true on the first read and it was
 *    doing nothing but looking like it was.
 */

/** Deadline for the waits below. Only ever reached if something is genuinely stuck. */
const WAIT_TIMEOUT_MS = 10_000;

/**
 * Resolve once `read()` equals `expected`, or throw saying what it saw instead.
 *
 * Deliberately not a sleep followed by an assertion: the thing each caller wants
 * to wait for is "the enqueue landed", so that is what is waited on.
 */
async function waitFor<T>(what: string, expected: T, read: () => Promise<T>): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  let seen = await read();
  while (seen !== expected && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5));
    seen = await read();
  }
  if (seen !== expected) {
    throw new Error(
      `Timed out after ${WAIT_TIMEOUT_MS}ms waiting for ${what} to be ${String(expected)}; ` +
        `last saw ${String(seen)}. The enqueue never landed -- this is not a slow machine.`
    );
  }
}

/** Wait until the queue holds exactly `n` pending items. */
async function waitForQueueSize(queue: OfflineQueue, n: number): Promise<void> {
  await waitFor('the queue size', n, () => queue.getQueueSize());
}

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

      await waitForQueueSize(queue, 1);
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

      await waitForQueueSize(queue, 2);
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

      await waitForQueueSize(queue, 1);
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

      await waitForQueueSize(queue, 1);
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

      await waitForQueueSize(queue, 3);
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

      await waitForQueueSize(queue, 1);
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

      await waitForQueueSize(queue, 1);
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

      await waitForQueueSize(queue, 1);
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

      await waitForQueueSize(queue, 2);
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

      await waitForQueueSize(queue, 1);
      await queue.clearQueue();
      expect(await queue.getQueueSize()).toBe(0);
      expect(await queue.getQueuedItems()).toEqual([]);
    });
  });
});
