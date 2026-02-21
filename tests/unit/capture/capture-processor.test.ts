// Mock BullMQ before any imports
const mockOn = jest.fn().mockReturnThis();
const mockWorkerInstance = {
  on: mockOn,
};
const MockWorker = jest.fn().mockReturnValue(mockWorkerInstance);

jest.mock('bullmq', () => ({
  Worker: MockWorker,
}));

// Mock the queue connection
jest.mock('@/lib/queue/connection', () => ({
  getRedisUrl: jest.fn().mockReturnValue('redis://localhost:6379'),
}));

// Mock the capture service
jest.mock('@/modules/capture/services/capture-service', () => ({
  captureService: {
    createCapture: jest.fn().mockResolvedValue({ id: 'capture-123' }),
    processCapture: jest.fn().mockResolvedValue(undefined),
  },
}));

import {
  createCaptureWorker,
  createCustomCaptureWorker,
} from '@/modules/capture/services/capture-processor';
import { captureService } from '@/modules/capture/services/capture-service';
import { getRedisUrl } from '@/lib/queue/connection';

describe('CaptureProcessor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the mockWorkerInstance.on to track fresh calls
    mockOn.mockClear();
    MockWorker.mockClear();
    MockWorker.mockReturnValue(mockWorkerInstance);
  });

  // ─── createCaptureWorker ───────────────────────────────────────────

  describe('createCaptureWorker', () => {
    it('should create a BullMQ Worker with the capture-queue name', () => {
      createCaptureWorker();

      expect(MockWorker).toHaveBeenCalledTimes(1);
      expect(MockWorker.mock.calls[0][0]).toBe('capture-queue');
    });

    it('should use default concurrency of 5 when no options provided', () => {
      createCaptureWorker();

      const workerOptions = MockWorker.mock.calls[0][2];
      expect(workerOptions.concurrency).toBe(5);
    });

    it('should use custom concurrency when provided', () => {
      createCaptureWorker({ concurrency: 10 });

      const workerOptions = MockWorker.mock.calls[0][2];
      expect(workerOptions.concurrency).toBe(10);
    });

    it('should pass the Redis URL from getRedisUrl to the connection option', () => {
      createCaptureWorker();

      const workerOptions = MockWorker.mock.calls[0][2];
      expect(workerOptions.connection).toEqual({ url: 'redis://localhost:6379' });
      expect(getRedisUrl).toHaveBeenCalled();
    });

    it('should register failed, completed, and error event handlers', () => {
      createCaptureWorker();

      const eventNames = mockOn.mock.calls.map(
        (call: [string, (...args: unknown[]) => void]) => call[0]
      );
      expect(eventNames).toContain('failed');
      expect(eventNames).toContain('completed');
      expect(eventNames).toContain('error');
    });

    it('should return the Worker instance', () => {
      const worker = createCaptureWorker();
      expect(worker).toBe(mockWorkerInstance);
    });

    it('should process capture-item jobs by calling captureService', async () => {
      createCaptureWorker();

      // Extract the processor function (second argument to Worker constructor)
      const processorFn = MockWorker.mock.calls[0][1];

      const mockJob = {
        name: 'capture-item',
        data: {
          userId: 'user-1',
          source: 'MANUAL',
          contentType: 'TEXT',
          rawContent: 'Test content',
          entityId: 'entity-1',
          metadata: { sourceApp: 'test' },
          retryCount: 0,
        },
        updateProgress: jest.fn().mockResolvedValue(undefined),
      };

      await processorFn(mockJob);

      expect(captureService.createCapture).toHaveBeenCalledWith({
        userId: 'user-1',
        source: 'MANUAL',
        contentType: 'TEXT',
        rawContent: 'Test content',
        entityId: 'entity-1',
        metadata: { sourceApp: 'test' },
      });
      expect(captureService.processCapture).toHaveBeenCalledWith('capture-123');
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should ignore jobs that are not capture-item', async () => {
      createCaptureWorker();

      const processorFn = MockWorker.mock.calls[0][1];

      const mockJob = {
        name: 'some-other-job',
        data: { rawContent: 'ignored' },
        updateProgress: jest.fn(),
      };

      await processorFn(mockJob);

      expect(captureService.createCapture).not.toHaveBeenCalled();
      expect(captureService.processCapture).not.toHaveBeenCalled();
      expect(mockJob.updateProgress).not.toHaveBeenCalled();
    });

    it('should log errors on failed event with job data id', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      createCaptureWorker();

      // Find the 'failed' handler
      const failedHandler = mockOn.mock.calls.find(
        (call: [string, (...args: unknown[]) => void]) => call[0] === 'failed'
      )?.[1];

      failedHandler(
        { data: { id: 'item-42' }, id: 'job-id-1' },
        new Error('Redis connection lost')
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        '[capture-processor] Job item-42 failed:',
        'Redis connection lost'
      );

      consoleSpy.mockRestore();
    });

    it('should log completed event with job data id', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      createCaptureWorker();

      const completedHandler = mockOn.mock.calls.find(
        (call: [string, (...args: unknown[]) => void]) => call[0] === 'completed'
      )?.[1];

      completedHandler({ data: { id: 'item-99' }, id: 'job-id-2' });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[capture-processor] Job item-99 completed'
      );

      consoleSpy.mockRestore();
    });

    it('should handle failed event when job has no data id, falling back to job id', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      createCaptureWorker();

      const failedHandler = mockOn.mock.calls.find(
        (call: [string, (...args: unknown[]) => void]) => call[0] === 'failed'
      )?.[1];

      failedHandler(
        { data: {}, id: 'fallback-job-id' },
        new Error('some error')
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        '[capture-processor] Job fallback-job-id failed:',
        'some error'
      );

      consoleSpy.mockRestore();
    });

    it('should handle error event on the worker', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      createCaptureWorker();

      const errorHandler = mockOn.mock.calls.find(
        (call: [string, (...args: unknown[]) => void]) => call[0] === 'error'
      )?.[1];

      errorHandler(new Error('Worker crashed'));

      expect(consoleSpy).toHaveBeenCalledWith(
        '[capture-processor] Worker error:',
        'Worker crashed'
      );

      consoleSpy.mockRestore();
    });
  });

  // ─── createCustomCaptureWorker ─────────────────────────────────────

  describe('createCustomCaptureWorker', () => {
    it('should create a Worker with a custom processing function', async () => {
      const customFn = jest.fn().mockResolvedValue(undefined);

      createCustomCaptureWorker(customFn);

      expect(MockWorker).toHaveBeenCalledTimes(1);
      expect(MockWorker.mock.calls[0][0]).toBe('capture-queue');

      // Extract processor and test it
      const processorFn = MockWorker.mock.calls[0][1];

      const mockJob = {
        name: 'capture-item',
        data: {
          id: 'item-1',
          userId: 'user-1',
          source: 'VOICE',
          contentType: 'AUDIO',
          rawContent: 'audio-data',
        },
        updateProgress: jest.fn().mockResolvedValue(undefined),
      };

      await processorFn(mockJob);

      expect(customFn).toHaveBeenCalledWith(mockJob.data);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should use default concurrency of 5 for custom worker', () => {
      const customFn = jest.fn();
      createCustomCaptureWorker(customFn);

      const workerOptions = MockWorker.mock.calls[0][2];
      expect(workerOptions.concurrency).toBe(5);
    });

    it('should accept custom concurrency for custom worker', () => {
      const customFn = jest.fn();
      createCustomCaptureWorker(customFn, { concurrency: 3 });

      const workerOptions = MockWorker.mock.calls[0][2];
      expect(workerOptions.concurrency).toBe(3);
    });

    it('should not call custom function for non-capture-item jobs', async () => {
      const customFn = jest.fn().mockResolvedValue(undefined);
      createCustomCaptureWorker(customFn);

      const processorFn = MockWorker.mock.calls[0][1];

      const mockJob = {
        name: 'unrelated-job',
        data: { foo: 'bar' },
        updateProgress: jest.fn(),
      };

      await processorFn(mockJob);

      expect(customFn).not.toHaveBeenCalled();
      expect(mockJob.updateProgress).not.toHaveBeenCalled();
    });

    it('should register event handlers on the custom worker', () => {
      const customFn = jest.fn();
      createCustomCaptureWorker(customFn);

      const eventNames = mockOn.mock.calls.map(
        (call: [string, (...args: unknown[]) => void]) => call[0]
      );
      expect(eventNames).toContain('failed');
      expect(eventNames).toContain('completed');
      expect(eventNames).toContain('error');
    });
  });
});
