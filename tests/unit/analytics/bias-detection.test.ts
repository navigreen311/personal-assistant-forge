import { detectBias } from '@/modules/ai-quality/services/bias-detection-service';

// Mock prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    entity: {
      findUnique: jest.fn().mockResolvedValue({ userId: 'user1' }),
      findMany: jest.fn().mockResolvedValue([
        { id: 'entity1', name: 'Entity A', userId: 'user1' },
        { id: 'entity2', name: 'Entity B', userId: 'user1' },
      ]),
    },
    task: {
      count: jest.fn().mockResolvedValue(10),
    },
    message: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    actionLog: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockResolvedValue({
    dimensions: [
      { name: 'entity_bias', description: 'AI: Entity bias is low and consistent.' },
      { name: 'contact_bias', description: 'AI: Contact response quality is uniform.' },
      { name: 'channel_bias', description: 'AI: Channel accuracy is consistent.' },
      { name: 'time_bias', description: 'AI: Performance is stable across hours.' },
    ],
    alerts: [],
  }),
  generateText: jest.fn().mockResolvedValue('AI-generated insight'),
}));

const { generateJSON } = require('@/lib/ai');
const { prisma } = require('@/lib/db');

describe('detectBias (AI-powered)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset default mocks
    prisma.entity.findUnique.mockResolvedValue({ userId: 'user1' });
    prisma.entity.findMany.mockResolvedValue([
      { id: 'entity1', name: 'Entity A', userId: 'user1' },
      { id: 'entity2', name: 'Entity B', userId: 'user1' },
    ]);
    prisma.task.count.mockResolvedValue(10);
    prisma.message.findMany.mockResolvedValue([]);
    prisma.actionLog.findMany.mockResolvedValue([]);
  });

  it('should call generateJSON with distribution data', async () => {
    const report = await detectBias('entity1', '2026-02');
    expect(generateJSON).toHaveBeenCalledTimes(1);
    const prompt = generateJSON.mock.calls[0][0] as string;
    expect(prompt).toContain('entity_bias');
    expect(prompt).toContain('contact_bias');
    expect(prompt).toContain('channel_bias');
    expect(prompt).toContain('time_bias');
  });

  it('should return bias scores per dimension', async () => {
    const report = await detectBias('entity1', '2026-02');
    expect(report.dimensions).toHaveLength(4);
    expect(report.dimensions[0].name).toBe('entity_bias');
    expect(report.dimensions[1].name).toBe('contact_bias');
    expect(report.dimensions[2].name).toBe('channel_bias');
    expect(report.dimensions[3].name).toBe('time_bias');
    for (const dim of report.dimensions) {
      expect(dim.score).toBeGreaterThanOrEqual(0);
      expect(dim.score).toBeLessThanOrEqual(1);
    }
  });

  it('should include overall bias score', async () => {
    const report = await detectBias('entity1', '2026-02');
    expect(report.overallBiasScore).toBeGreaterThanOrEqual(0);
    expect(report.overallBiasScore).toBeLessThanOrEqual(1);
    expect(report.entityId).toBe('entity1');
    expect(report.period).toBe('2026-02');
  });

  it('should use AI-generated descriptions for dimensions', async () => {
    const report = await detectBias('entity1', '2026-02');
    expect(report.dimensions[0].description).toBe('AI: Entity bias is low and consistent.');
  });

  it('should handle AI failure gracefully', async () => {
    generateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

    const report = await detectBias('entity1', '2026-02');
    expect(report.dimensions).toHaveLength(4);
    // Should fall back to static descriptions
    for (const dim of report.dimensions) {
      expect(dim.description).toBeTruthy();
      expect(dim.description.length).toBeGreaterThan(0);
    }
  });

  it('should generate alerts for high bias scores', async () => {
    generateJSON.mockResolvedValueOnce({
      dimensions: [
        { name: 'entity_bias', description: 'High entity bias detected.' },
        { name: 'contact_bias', description: 'Contact bias is significant.' },
        { name: 'channel_bias', description: 'Channel accuracy varies.' },
        { name: 'time_bias', description: 'Performance is stable.' },
      ],
      alerts: ['High bias detected in entity_bias: review task distribution across entities.'],
    });

    // Make entity bias high by having very different task counts
    prisma.task.count
      .mockResolvedValueOnce(100)  // entity1 total
      .mockResolvedValueOnce(90)   // entity1 done
      .mockResolvedValueOnce(100)  // entity2 total
      .mockResolvedValueOnce(10);  // entity2 done

    const report = await detectBias('entity1', '2026-02');
    expect(report.alerts.length).toBeGreaterThanOrEqual(1);
    expect(report.alerts[0]).toContain('entity_bias');
  });
});
