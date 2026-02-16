import { CaptureService } from '@/modules/capture/services/capture-service';

// Mock routing service
jest.mock('@/modules/capture/services/routing-service', () => ({
  routingService: {
    routeCapture: jest.fn().mockResolvedValue({
      targetType: 'NOTE',
      entityId: 'entity-1',
      confidence: 0.8,
      appliedRules: ['rule-1'],
    }),
  },
}));

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockRejectedValue(new Error('AI unavailable in test')),
}));

describe('CaptureService', () => {
  let service: CaptureService;

  beforeEach(() => {
    service = new CaptureService();
  });

  describe('createCapture', () => {
    it('should create a capture with PENDING status', async () => {
      const capture = await service.createCapture({
        userId: 'user-1',
        source: 'MANUAL',
        contentType: 'TEXT',
        rawContent: 'Test capture content',
      });

      expect(capture.status).toBe('PENDING');
    });

    it('should generate a unique ID', async () => {
      const c1 = await service.createCapture({
        userId: 'user-1',
        source: 'MANUAL',
        contentType: 'TEXT',
        rawContent: 'Capture 1',
      });
      const c2 = await service.createCapture({
        userId: 'user-1',
        source: 'MANUAL',
        contentType: 'TEXT',
        rawContent: 'Capture 2',
      });

      expect(c1.id).not.toBe(c2.id);
    });

    it('should set createdAt timestamp', async () => {
      const before = new Date();
      const capture = await service.createCapture({
        userId: 'user-1',
        source: 'MANUAL',
        contentType: 'TEXT',
        rawContent: 'Test',
      });
      const after = new Date();

      expect(capture.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(capture.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should accept optional metadata', async () => {
      const capture = await service.createCapture({
        userId: 'user-1',
        source: 'CLIPBOARD',
        contentType: 'TEXT',
        rawContent: 'From clipboard',
        metadata: { sourceApp: 'Chrome', deviceInfo: 'Desktop' },
      });

      expect(capture.metadata.sourceApp).toBe('Chrome');
      expect(capture.metadata.deviceInfo).toBe('Desktop');
    });
  });

  describe('processCapture', () => {
    it('should update status to PROCESSING then ROUTED', async () => {
      const capture = await service.createCapture({
        userId: 'user-1',
        source: 'MANUAL',
        contentType: 'TEXT',
        rawContent: 'Process me',
      });

      const processed = await service.processCapture(capture.id);
      expect(processed.status).toBe('ROUTED');
    });

    it('should call routing service after processing', async () => {
      const { routingService } = jest.requireMock(
        '@/modules/capture/services/routing-service',
      );

      const capture = await service.createCapture({
        userId: 'user-1',
        source: 'MANUAL',
        contentType: 'TEXT',
        rawContent: 'Route me',
      });

      await service.processCapture(capture.id);
      expect(routingService.routeCapture).toHaveBeenCalled();
    });

    it('should track processing latency', async () => {
      const capture = await service.createCapture({
        userId: 'user-1',
        source: 'MANUAL',
        contentType: 'TEXT',
        rawContent: 'Track latency',
      });

      await service.processCapture(capture.id);

      const metrics = await service.getCaptureMetrics('user-1');
      expect(metrics.length).toBe(1);
      expect(metrics[0].totalMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle processing errors gracefully', async () => {
      await expect(service.processCapture('non-existent-id')).rejects.toThrow();
    });
  });

  describe('listCaptures', () => {
    beforeEach(async () => {
      await service.createCapture({
        userId: 'user-1',
        source: 'VOICE',
        contentType: 'AUDIO',
        rawContent: 'Voice capture',
      });
      await service.createCapture({
        userId: 'user-1',
        source: 'MANUAL',
        contentType: 'TEXT',
        rawContent: 'Manual capture',
      });
      await service.createCapture({
        userId: 'user-2',
        source: 'MANUAL',
        contentType: 'TEXT',
        rawContent: 'Other user capture',
      });
    });

    it('should filter by source', async () => {
      const result = await service.listCaptures('user-1', { source: 'VOICE' });
      expect(result.data.length).toBe(1);
      expect(result.data[0].source).toBe('VOICE');
    });

    it('should filter by status', async () => {
      const result = await service.listCaptures('user-1', { status: 'PENDING' });
      expect(result.data.length).toBe(2);
    });

    it('should paginate results', async () => {
      const page1 = await service.listCaptures('user-1', undefined, 1, 1);
      expect(page1.data.length).toBe(1);
      expect(page1.total).toBe(2);

      const page2 = await service.listCaptures('user-1', undefined, 2, 1);
      expect(page2.data.length).toBe(1);
    });
  });

  describe('archiveCapture', () => {
    it('should set status to ARCHIVED', async () => {
      const capture = await service.createCapture({
        userId: 'user-1',
        source: 'MANUAL',
        contentType: 'TEXT',
        rawContent: 'Archive me',
      });

      await service.archiveCapture(capture.id);

      const archived = await service.getCaptureById(capture.id);
      expect(archived?.status).toBe('ARCHIVED');
    });

    it('should throw for non-existent capture', async () => {
      await expect(service.archiveCapture('fake-id')).rejects.toThrow();
    });
  });

  describe('classifyCaptureWithAI', () => {
    const { generateJSON } = jest.requireMock('@/lib/ai') as { generateJSON: jest.Mock };

    beforeEach(() => {
      generateJSON.mockReset();
      generateJSON.mockRejectedValue(new Error('AI unavailable'));
    });

    it('should classify captures using AI', async () => {
      generateJSON.mockResolvedValueOnce({
        category: 'TASK',
        confidence: 0.85,
        suggestedActions: ['Create a task', 'Set deadline'],
      });

      const capture = await service.createCapture({
        userId: 'user-1',
        source: 'MANUAL',
        contentType: 'TEXT',
        rawContent: 'I need to follow up with the vendor by Friday',
      });

      const result = await service.classifyCaptureWithAI(capture.id);

      expect(generateJSON).toHaveBeenCalled();
      expect(result.category).toBe('TASK');
      expect(result.confidence).toBe(0.85);
    });

    it('should fall back to NOTE on AI failure', async () => {
      generateJSON.mockRejectedValueOnce(new Error('AI error'));

      const capture = await service.createCapture({
        userId: 'user-1',
        source: 'MANUAL',
        contentType: 'TEXT',
        rawContent: 'Some content',
      });

      const result = await service.classifyCaptureWithAI(capture.id);

      expect(result.category).toBe('NOTE');
      expect(result.confidence).toBe(0.3);
    });
  });
});
