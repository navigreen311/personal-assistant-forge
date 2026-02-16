import { BatchCaptureService } from '@/modules/capture/services/batch-capture';

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    document: {
      create: jest.fn().mockResolvedValue({ id: 'doc-batch-1' }),
    },
  },
}));

// Mock capture service
jest.mock('@/modules/capture/services/capture-service', () => {
  const items = new Map<string, Record<string, unknown>>();
  let idCounter = 0;

  return {
    captureService: {
      createCapture: jest.fn().mockImplementation(async (params: Record<string, unknown>) => {
        idCounter++;
        const id = `capture-${idCounter}`;
        const item = {
          id,
          ...params,
          status: 'PENDING',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        items.set(id, item);
        return item;
      }),
      processCapture: jest.fn().mockImplementation(async (captureId: string) => {
        const item = items.get(captureId);
        if (!item) throw new Error(`Capture "${captureId}" not found`);
        return {
          ...item,
          status: 'ROUTED',
          processedContent: item['rawContent'] as string,
          routingResult: {
            targetType: 'NOTE',
            entityId: '',
            confidence: 0.8,
            appliedRules: ['rule-1'],
          },
        };
      }),
    },
  };
});

describe('BatchCapture', () => {
  let service: BatchCaptureService;
  const { prisma } = jest.requireMock('@/lib/db') as {
    prisma: { document: { create: jest.Mock } };
  };

  beforeEach(() => {
    service = new BatchCaptureService();
    jest.clearAllMocks();
  });

  describe('startBatchSession', () => {
    it('should create session with ACTIVE status', () => {
      const session = service.startBatchSession('user-1');

      expect(session.id).toBeDefined();
      expect(session.status).toBe('ACTIVE');
      expect(session.userId).toBe('user-1');
    });

    it('should initialize empty items array', () => {
      const session = service.startBatchSession('user-1');
      expect(session.items).toEqual([]);
    });

    it('should set startedAt timestamp', () => {
      const before = new Date();
      const session = service.startBatchSession('user-1');
      const after = new Date();

      expect(session.startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session.startedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('addToBatch', () => {
    it('should add item to the session', () => {
      const session = service.startBatchSession('user-1');

      const item = service.addToBatch(session.id, 'First capture');
      expect(item.rawContent).toBe('First capture');

      const status = service.getBatchStatus(session.id);
      expect(status?.items.length).toBe(1);
    });

    it('should default source to VOICE', () => {
      const session = service.startBatchSession('user-1');
      const item = service.addToBatch(session.id, 'Voice capture');

      expect(item.source).toBe('VOICE');
    });

    it('should accept custom source', () => {
      const session = service.startBatchSession('user-1');
      const item = service.addToBatch(session.id, 'Manual capture', 'MANUAL');

      expect(item.source).toBe('MANUAL');
    });

    it('should accept custom contentType', () => {
      const session = service.startBatchSession('user-1');
      const item = service.addToBatch(session.id, 'Image capture', 'CAMERA_SCAN', 'IMAGE');

      expect(item.contentType).toBe('IMAGE');
    });

    it('should throw for non-existent session', () => {
      expect(() =>
        service.addToBatch('fake-session', 'Content'),
      ).toThrow('Batch session "fake-session" not found');
    });

    it('should throw for completed session', () => {
      const session = service.startBatchSession('user-1');

      // Force complete
      const status = service.getBatchStatus(session.id);
      if (status) status.status = 'COMPLETED';

      expect(() =>
        service.addToBatch(session.id, 'Too late'),
      ).toThrow('not active');
    });

    it('should validate non-empty rawContent', () => {
      const session = service.startBatchSession('user-1');

      expect(() =>
        service.addToBatch(session.id, ''),
      ).toThrow('rawContent must be non-empty');

      expect(() =>
        service.addToBatch(session.id, '   '),
      ).toThrow('rawContent must be non-empty');
    });

    it('should validate source is a valid CaptureSource', () => {
      const session = service.startBatchSession('user-1');

      expect(() =>
        service.addToBatch(session.id, 'Content', 'INVALID_SOURCE' as never),
      ).toThrow('Invalid source');
    });
  });

  describe('completeBatch', () => {
    it('should process and route all items', async () => {
      const session = service.startBatchSession('user-1');
      service.addToBatch(session.id, 'Item 1');
      service.addToBatch(session.id, 'Item 2');
      service.addToBatch(session.id, 'Item 3');

      const results = await service.completeBatch(session.id);
      expect(results.length).toBe(3);
    });

    it('should update session status to COMPLETED', async () => {
      const session = service.startBatchSession('user-1');
      service.addToBatch(session.id, 'Item 1');

      await service.completeBatch(session.id);

      const status = service.getBatchStatus(session.id);
      expect(status?.status).toBe('COMPLETED');
      expect(status?.completedAt).toBeDefined();
    });

    it('should return all processed items', async () => {
      const session = service.startBatchSession('user-1');
      service.addToBatch(session.id, 'Note about Q4 review');
      service.addToBatch(session.id, 'Follow up with vendor');

      const results = await service.completeBatch(session.id);
      expect(results.length).toBe(2);
      results.forEach((item) => {
        expect(item.status).toBe('ROUTED');
      });
    });

    it('should handle empty batch gracefully', async () => {
      const session = service.startBatchSession('user-1');
      const results = await service.completeBatch(session.id);
      expect(results).toEqual([]);
    });

    it('should throw for non-existent session', async () => {
      await expect(
        service.completeBatch('fake-session'),
      ).rejects.toThrow('Batch session "fake-session" not found');
    });

    it('should mark individual items as FAILED on processing error', async () => {
      const { captureService } = jest.requireMock(
        '@/modules/capture/services/capture-service',
      ) as { captureService: { processCapture: jest.Mock; createCapture: jest.Mock } };

      // Make processCapture fail for one item
      captureService.processCapture
        .mockRejectedValueOnce(new Error('Processing failed'));

      const session = service.startBatchSession('user-1');
      service.addToBatch(session.id, 'Will fail');
      service.addToBatch(session.id, 'Will succeed');

      const results = await service.completeBatch(session.id);
      expect(results.length).toBe(2);
      expect(results[0].status).toBe('FAILED');
      expect(results[1].status).toBe('ROUTED');
    });

    it('should store batch summary Document with item counts', async () => {
      const session = service.startBatchSession('user-1');
      service.addToBatch(session.id, 'Item 1');
      service.addToBatch(session.id, 'Item 2');

      await service.completeBatch(session.id);

      expect(prisma.document.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: expect.stringContaining('Batch Capture'),
          type: 'BATCH_CAPTURE',
          status: 'APPROVED',
          entityId: 'user-1',
        }),
      });

      // Verify content includes counts
      const callArg = prisma.document.create.mock.calls[0][0];
      const content = JSON.parse(callArg.data.content);
      expect(content.itemCount).toBe(2);
      expect(content.successCount).toBe(2);
      expect(content.failedCount).toBe(0);
    });
  });

  describe('getBatchStatus', () => {
    it('should return session status', () => {
      const session = service.startBatchSession('user-1');
      const status = service.getBatchStatus(session.id);

      expect(status).toBeDefined();
      expect(status?.id).toBe(session.id);
    });

    it('should return null for non-existent session', () => {
      expect(service.getBatchStatus('fake-id')).toBeNull();
    });
  });
});
