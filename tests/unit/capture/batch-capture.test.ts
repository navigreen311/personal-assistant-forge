import { BatchCaptureService } from '@/modules/capture/services/batch-capture';

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
