import {
  checkStopConditions,
  updateStats,
  getNextContacts,
  createCampaign,
} from '@/modules/voiceforge/services/campaign-service';
import type { Campaign, CampaignStats, OutboundCallResult } from '@/modules/voiceforge/types';

jest.mock('@/lib/db', () => ({
  prisma: {
    document: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    call: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 'campaign-1',
    entityId: 'entity-1',
    name: 'Test Campaign',
    description: 'Test',
    personaId: 'persona-1',
    scriptId: 'script-1',
    targetContactIds: ['c1', 'c2', 'c3', 'c4', 'c5'],
    schedule: {
      startDate: new Date(),
      callWindowStart: '09:00',
      callWindowEnd: '17:00',
      timezone: 'America/Chicago',
      maxCallsPerDay: 100,
      retryAttempts: 2,
      retryDelayHours: 4,
    },
    stopConditions: [],
    status: 'ACTIVE',
    stats: {
      totalTargeted: 5,
      totalCalled: 0,
      totalConnected: 0,
      totalVoicemail: 0,
      totalNoAnswer: 0,
      totalInterested: 0,
      totalNotInterested: 0,
      averageSentiment: 0,
      averageDuration: 0,
      conversionRate: 0,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Campaign Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkStopConditions', () => {
    it('should not stop when no conditions are met', () => {
      const campaign = makeCampaign({
        stopConditions: [{ type: 'MAX_CALLS', threshold: 100 }],
        stats: { ...makeCampaign().stats, totalCalled: 5 },
      });
      const result = checkStopConditions(campaign);
      expect(result.shouldStop).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('should stop when MAX_CALLS threshold reached', () => {
      const campaign = makeCampaign({
        stopConditions: [{ type: 'MAX_CALLS', threshold: 10 }],
        stats: { ...makeCampaign().stats, totalCalled: 10 },
      });
      const result = checkStopConditions(campaign);
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toContain('Max calls');
    });

    it('should stop when MAX_CONNECTS threshold reached', () => {
      const campaign = makeCampaign({
        stopConditions: [{ type: 'MAX_CONNECTS', threshold: 5 }],
        stats: { ...makeCampaign().stats, totalConnected: 5 },
      });
      const result = checkStopConditions(campaign);
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toContain('Max connects');
    });

    it('should stop when CONVERSION_TARGET reached', () => {
      const campaign = makeCampaign({
        stopConditions: [{ type: 'CONVERSION_TARGET', threshold: 0.5 }],
        stats: { ...makeCampaign().stats, conversionRate: 0.6 },
      });
      const result = checkStopConditions(campaign);
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toContain('Conversion target');
    });

    it('should stop when NEGATIVE_SENTIMENT threshold hit', () => {
      const campaign = makeCampaign({
        stopConditions: [{ type: 'NEGATIVE_SENTIMENT', threshold: 0.5 }],
        stats: { ...makeCampaign().stats, averageSentiment: -0.6 },
      });
      const result = checkStopConditions(campaign);
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toContain('Negative sentiment');
    });

    it('should evaluate multiple conditions', () => {
      const campaign = makeCampaign({
        stopConditions: [
          { type: 'MAX_CALLS', threshold: 100 },
          { type: 'CONVERSION_TARGET', threshold: 0.3 },
        ],
        stats: { ...makeCampaign().stats, totalCalled: 50, conversionRate: 0.4 },
      });
      const result = checkStopConditions(campaign);
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toContain('Conversion target');
    });
  });

  describe('updateStats', () => {
    it('should increment totalCalled and totalConnected for CONNECTED', async () => {
      const campaign = makeCampaign();
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue({
        id: 'campaign-1',
        entityId: 'entity-1',
        content: JSON.stringify({
          name: campaign.name,
          description: campaign.description,
          personaId: campaign.personaId,
          scriptId: campaign.scriptId,
          targetContactIds: campaign.targetContactIds,
          schedule: campaign.schedule,
          stopConditions: campaign.stopConditions,
          status: campaign.status,
          stats: campaign.stats,
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (mockPrisma.document.update as jest.Mock).mockResolvedValue({});

      const callResult: OutboundCallResult = {
        callId: 'call-1',
        outcome: 'CONNECTED',
        duration: 120,
        voicemailDropped: false,
        commitmentsMade: [],
        actionItems: [],
        nextSteps: [],
        sentiment: 0.5,
        escalated: false,
      };

      const stats = await updateStats('campaign-1', callResult);
      expect(stats.totalCalled).toBe(1);
      expect(stats.totalConnected).toBe(1);
    });

    it('should increment totalVoicemail for VOICEMAIL outcome', async () => {
      const campaign = makeCampaign();
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue({
        id: 'campaign-1',
        entityId: 'entity-1',
        content: JSON.stringify({
          ...campaign,
          stats: campaign.stats,
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (mockPrisma.document.update as jest.Mock).mockResolvedValue({});

      const callResult: OutboundCallResult = {
        callId: 'call-2',
        outcome: 'VOICEMAIL',
        duration: 30,
        voicemailDropped: true,
        commitmentsMade: [],
        actionItems: [],
        nextSteps: [],
        sentiment: 0,
        escalated: false,
      };

      const stats = await updateStats('campaign-1', callResult);
      expect(stats.totalVoicemail).toBe(1);
      expect(stats.totalCalled).toBe(1);
    });

    it('should increment totalInterested for INTERESTED outcome', async () => {
      const campaign = makeCampaign();
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue({
        id: 'campaign-1',
        entityId: 'entity-1',
        content: JSON.stringify({
          ...campaign,
          stats: campaign.stats,
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (mockPrisma.document.update as jest.Mock).mockResolvedValue({});

      const callResult: OutboundCallResult = {
        callId: 'call-3',
        outcome: 'INTERESTED',
        duration: 180,
        voicemailDropped: false,
        commitmentsMade: [],
        actionItems: [],
        nextSteps: [],
        sentiment: 0.8,
        escalated: false,
      };

      const stats = await updateStats('campaign-1', callResult);
      expect(stats.totalInterested).toBe(1);
      expect(stats.totalConnected).toBe(1);
      expect(stats.conversionRate).toBeGreaterThan(0);
    });
  });

  describe('getNextContacts', () => {
    it('should return contacts not yet called', async () => {
      const campaign = makeCampaign();
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue({
        id: 'campaign-1',
        entityId: 'entity-1',
        content: JSON.stringify({
          ...campaign,
          stats: campaign.stats,
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (mockPrisma.call.findMany as jest.Mock).mockResolvedValue([
        { contactId: 'c1' },
        { contactId: 'c2' },
      ]);

      const result = await getNextContacts('campaign-1', 10);
      expect(result).toEqual(['c3', 'c4', 'c5']);
    });

    it('should respect limit parameter', async () => {
      const campaign = makeCampaign();
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue({
        id: 'campaign-1',
        entityId: 'entity-1',
        content: JSON.stringify({
          ...campaign,
          stats: campaign.stats,
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (mockPrisma.call.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getNextContacts('campaign-1', 2);
      expect(result).toHaveLength(2);
    });

    it('should return empty for non-existent campaign', async () => {
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue(null);
      const result = await getNextContacts('nonexistent', 10);
      expect(result).toEqual([]);
    });
  });
});
