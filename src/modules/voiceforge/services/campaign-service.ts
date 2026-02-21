// ============================================================================
// VoiceForge — Campaign Management Service
// Create, manage, and track outbound calling campaigns
// ============================================================================

import { prisma } from '@/lib/db';
import type {
  Campaign,
  CampaignStats,
  OutboundCallResult,
} from '@/modules/voiceforge/types';
import { generateJSON } from '@/lib/ai';

const DOC_TYPE = 'VOICE_CAMPAIGN';

function emptyStats(totalTargeted: number): CampaignStats {
  return {
    totalTargeted,
    totalCalled: 0,
    totalConnected: 0,
    totalVoicemail: 0,
    totalNoAnswer: 0,
    totalInterested: 0,
    totalNotInterested: 0,
    averageSentiment: 0,
    averageDuration: 0,
    conversionRate: 0,
  };
}

function deserializeCampaign(doc: { id: string; entityId: string; content: string | null; createdAt: Date; updatedAt: Date }): Campaign {
  const data = JSON.parse(doc.content ?? '{}');
  return {
    id: doc.id,
    entityId: doc.entityId,
    name: data.name ?? '',
    description: data.description ?? '',
    personaId: data.personaId ?? '',
    scriptId: data.scriptId ?? '',
    targetContactIds: data.targetContactIds ?? [],
    schedule: data.schedule ?? {},
    stopConditions: data.stopConditions ?? [],
    status: data.status ?? 'DRAFT',
    stats: data.stats ?? emptyStats(data.targetContactIds?.length ?? 0),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function serializeCampaign(data: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'>): string {
  return JSON.stringify({
    name: data.name,
    description: data.description,
    personaId: data.personaId,
    scriptId: data.scriptId,
    targetContactIds: data.targetContactIds,
    schedule: data.schedule,
    stopConditions: data.stopConditions,
    status: data.status,
    stats: data.stats,
  });
}

export async function createCampaign(
  data: Omit<Campaign, 'id' | 'stats' | 'createdAt' | 'updatedAt'>
): Promise<Campaign> {
  const campaignData = {
    ...data,
    stats: emptyStats(data.targetContactIds.length),
  };

  const doc = await prisma.document.create({
    data: {
      title: data.name,
      entityId: data.entityId,
      type: DOC_TYPE,
      content: serializeCampaign(campaignData),
      status: 'DRAFT',
    },
  });

  return deserializeCampaign(doc);
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const doc = await prisma.document.findFirst({
    where: { id, type: DOC_TYPE },
  });
  if (!doc) return null;
  return deserializeCampaign(doc);
}

export async function listCampaigns(entityId: string): Promise<Campaign[]> {
  const docs = await prisma.document.findMany({
    where: { entityId, type: DOC_TYPE },
    orderBy: { createdAt: 'desc' },
  });
  return docs.map(deserializeCampaign);
}

export async function startCampaign(id: string): Promise<Campaign> {
  return updateCampaignStatus(id, 'ACTIVE');
}

export async function pauseCampaign(id: string): Promise<Campaign> {
  return updateCampaignStatus(id, 'PAUSED');
}

export async function stopCampaign(id: string): Promise<Campaign> {
  return updateCampaignStatus(id, 'STOPPED');
}

async function updateCampaignStatus(
  id: string,
  status: Campaign['status']
): Promise<Campaign> {
  const campaign = await getCampaign(id);
  if (!campaign) throw new Error(`Campaign ${id} not found`);

  campaign.status = status;
  await prisma.document.update({
    where: { id },
    data: {
      content: serializeCampaign(campaign),
    },
  });

  return campaign;
}

export async function updateStats(
  id: string,
  callResult: OutboundCallResult
): Promise<CampaignStats> {
  const campaign = await getCampaign(id);
  if (!campaign) throw new Error(`Campaign ${id} not found`);

  const stats = { ...campaign.stats };
  stats.totalCalled += 1;

  switch (callResult.outcome) {
    case 'CONNECTED':
      stats.totalConnected += 1;
      break;
    case 'VOICEMAIL':
      stats.totalVoicemail += 1;
      break;
    case 'NO_ANSWER':
      stats.totalNoAnswer += 1;
      break;
    case 'INTERESTED':
      stats.totalConnected += 1;
      stats.totalInterested += 1;
      break;
    case 'NOT_INTERESTED':
      stats.totalConnected += 1;
      stats.totalNotInterested += 1;
      break;
    case 'BUSY':
      stats.totalNoAnswer += 1;
      break;
    case 'CALLBACK_REQUESTED':
      stats.totalConnected += 1;
      break;
  }

  // Recalculate averages
  const prevTotalSentiment = stats.averageSentiment * (stats.totalCalled - 1);
  stats.averageSentiment = (prevTotalSentiment + callResult.sentiment) / stats.totalCalled;

  const prevTotalDuration = stats.averageDuration * (stats.totalCalled - 1);
  stats.averageDuration = (prevTotalDuration + callResult.duration) / stats.totalCalled;

  // Conversion rate = interested / called
  stats.conversionRate =
    stats.totalCalled > 0 ? stats.totalInterested / stats.totalCalled : 0;

  campaign.stats = stats;
  await prisma.document.update({
    where: { id },
    data: { content: serializeCampaign(campaign) },
  });

  return stats;
}

export function checkStopConditions(
  campaign: Campaign
): { shouldStop: boolean; reason: string | null } {
  for (const condition of campaign.stopConditions) {
    const threshold =
      typeof condition.threshold === 'string'
        ? parseFloat(condition.threshold)
        : condition.threshold;

    switch (condition.type) {
      case 'MAX_CALLS':
        if (campaign.stats.totalCalled >= threshold) {
          return { shouldStop: true, reason: `Max calls reached: ${threshold}` };
        }
        break;
      case 'MAX_CONNECTS':
        if (campaign.stats.totalConnected >= threshold) {
          return { shouldStop: true, reason: `Max connects reached: ${threshold}` };
        }
        break;
      case 'CONVERSION_TARGET':
        if (campaign.stats.conversionRate >= threshold) {
          return { shouldStop: true, reason: `Conversion target reached: ${threshold}` };
        }
        break;
      case 'NEGATIVE_SENTIMENT':
        if (campaign.stats.averageSentiment <= -threshold) {
          return { shouldStop: true, reason: `Negative sentiment threshold: ${threshold}` };
        }
        break;
      case 'DATE': {
        const dateThreshold = typeof condition.threshold === 'string'
          ? new Date(condition.threshold)
          : new Date(threshold);
        if (new Date() >= dateThreshold) {
          return { shouldStop: true, reason: `End date reached: ${condition.threshold}` };
        }
        break;
      }
    }
  }

  return { shouldStop: false, reason: null };
}

export async function getNextContacts(
  campaignId: string,
  limit: number
): Promise<string[]> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) return [];

  // Get all calls for this campaign's contacts
  const calls = await prisma.call.findMany({
    where: {
      entityId: campaign.entityId,
      contactId: { in: campaign.targetContactIds },
      direction: 'OUTBOUND',
    },
    select: { contactId: true },
  });

  const calledContactIds = new Set(calls.map((c: { contactId: string | null }) => c.contactId).filter(Boolean));

  // Return contacts not yet called, up to limit
  return campaign.targetContactIds
    .filter((id) => !calledContactIds.has(id))
    .slice(0, limit);
}

export async function analyzeCampaignPerformance(
  campaignId: string,
): Promise<{
  insights: string[];
  recommendations: string[];
  predictedOutcome: string;
}> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  try {
    const result = await generateJSON<{
      insights: string[];
      recommendations: string[];
      predictedOutcome: string;
    }>(`Analyze this outbound calling campaign's performance.

Campaign: ${campaign.name}
Status: ${campaign.status}
Stats:
- Total targeted: ${campaign.stats.totalTargeted}
- Total called: ${campaign.stats.totalCalled}
- Total connected: ${campaign.stats.totalConnected}
- Interested: ${campaign.stats.totalInterested}
- Not interested: ${campaign.stats.totalNotInterested}
- Voicemail: ${campaign.stats.totalVoicemail}
- No answer: ${campaign.stats.totalNoAnswer}
- Average sentiment: ${campaign.stats.averageSentiment.toFixed(2)}
- Average duration: ${campaign.stats.averageDuration.toFixed(0)}s
- Conversion rate: ${(campaign.stats.conversionRate * 100).toFixed(1)}%

Return JSON with:
- insights: array of data-driven observations about performance
- recommendations: array of actionable improvements
- predictedOutcome: projected final result if current trends continue`, {
      maxTokens: 512,
      temperature: 0.4,
      system: 'You are a sales campaign analyst. Provide data-driven insights and actionable recommendations based on campaign performance metrics.',
    });

    return result;
  } catch {
    return {
      insights: ['Campaign analysis unavailable'],
      recommendations: ['Review campaign metrics manually'],
      predictedOutcome: 'Unable to predict',
    };
  }
}
