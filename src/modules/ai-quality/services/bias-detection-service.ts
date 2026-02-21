import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
import type { BiasReport, BiasDimension } from '../types';

export async function detectBias(
  entityId: string,
  period: string
): Promise<BiasReport> {
  const { startDate, endDate } = parsePeriod(period);

  const dimensions: BiasDimension[] = [];

  // 1. Entity bias: Does the AI favor one entity's tasks over another?
  const entityBias = await detectEntityBias(entityId, startDate, endDate);
  dimensions.push(entityBias);

  // 2. Contact bias: Does response quality vary by contact?
  const contactBias = await detectContactBias(entityId, startDate, endDate);
  dimensions.push(contactBias);

  // 3. Channel bias: Does accuracy differ by communication channel?
  const channelBias = await detectChannelBias(entityId, startDate, endDate);
  dimensions.push(channelBias);

  // 4. Time bias: Does performance degrade at certain hours?
  const timeBias = await detectTimeBias(startDate, endDate);
  dimensions.push(timeBias);

  const overallBiasScore =
    dimensions.length > 0
      ? Math.round(
          (dimensions.reduce((sum, d) => sum + d.score, 0) /
            dimensions.length) *
            100
        ) / 100
      : 0;

  // Use AI to analyze distribution data and produce bias assessments
  try {
    const aiResult = await generateJSON<{ dimensions: { name: string; description: string }[]; alerts: string[] }>(
      `You are a fairness and bias analyst for an AI system. Analyze these bias dimensions and provide descriptions and alerts.

Dimensions detected:
${dimensions.map(d => `- ${d.name}: score ${d.score.toFixed(2)}, affected groups: ${d.affectedGroups.map(g => `${g.group} (deviation: ${g.deviation})`).join(', ')}`).join('\n')}

Overall bias score: ${overallBiasScore}

Respond with JSON:
{
  "dimensions": [${dimensions.map(d => `{ "name": "${d.name}", "description": "<1-sentence analysis of this dimension>" }`).join(', ')}],
  "alerts": ["<alert for any dimension with score > 0.5, include specific remediation advice>"]
}`,
      { temperature: 0.4, maxTokens: 512 }
    );

    // Update dimension descriptions with AI-generated ones
    for (const aiDim of aiResult.dimensions) {
      const dim = dimensions.find(d => d.name === aiDim.name);
      if (dim) {
        dim.description = aiDim.description;
      }
    }

    return {
      entityId,
      period,
      dimensions,
      overallBiasScore,
      alerts: aiResult.alerts.length > 0 ? aiResult.alerts : [],
    };
  } catch {
    // Fallback to static alerts
    const alerts: string[] = [];
    for (const dim of dimensions) {
      if (dim.score > 0.5) {
        alerts.push(
          `High bias detected in ${dim.name}: score ${dim.score.toFixed(2)}`
        );
      }
    }

    return {
      entityId,
      period,
      dimensions,
      overallBiasScore,
      alerts,
    };
  }
}

export function getAffectedGroups(
  dimension: BiasDimension
): { group: string; expectedRate: number; actualRate: number; deviation: number }[] {
  if (dimension.affectedGroups.length === 0) return [];

  const _avgDeviation =
    dimension.affectedGroups.reduce(
      (sum, g) => sum + Math.abs(g.deviation),
      0
    ) / dimension.affectedGroups.length;

  return dimension.affectedGroups.map((group) => ({
    group: group.group,
    expectedRate: 1 / dimension.affectedGroups.length, // Equal distribution
    actualRate:
      1 / dimension.affectedGroups.length + group.deviation,
    deviation: group.deviation,
  }));
}

async function detectEntityBias(
  entityId: string,
  startDate: Date,
  endDate: Date
): Promise<BiasDimension> {
  // Get user's entities
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { userId: true },
  });

  if (!entity) {
    return {
      name: 'entity_bias',
      score: 0,
      description: 'No entity data available.',
      affectedGroups: [],
    };
  }

  const entities = await prisma.entity.findMany({
    where: { userId: entity.userId },
  });

  // Get task completion rates per entity
  const affectedGroups: { group: string; deviation: number }[] = [];
  const rates: number[] = [];

  for (const e of entities) {
    const total = await prisma.task.count({
      where: {
        entityId: e.id,
        createdAt: { gte: startDate, lte: endDate },
      },
    });
    const done = await prisma.task.count({
      where: {
        entityId: e.id,
        status: 'DONE',
        updatedAt: { gte: startDate, lte: endDate },
      },
    });
    const rate = total > 0 ? done / total : 0;
    rates.push(rate);
    affectedGroups.push({ group: e.name, deviation: 0 });
  }

  // Calculate deviation from mean
  const meanRate = rates.length > 0 ? rates.reduce((s, r) => s + r, 0) / rates.length : 0;
  for (let i = 0; i < rates.length; i++) {
    affectedGroups[i].deviation = Math.round((rates[i] - meanRate) * 1000) / 1000;
  }

  const variance =
    rates.length > 0
      ? rates.reduce((sum, r) => sum + Math.pow(r - meanRate, 2), 0) / rates.length
      : 0;
  const score = Math.min(1, Math.sqrt(variance) * 2); // Normalize

  return {
    name: 'entity_bias',
    score: Math.round(score * 100) / 100,
    description:
      score > 0.3
        ? 'Task completion rates vary significantly across entities.'
        : 'Task completion rates are consistent across entities.',
    affectedGroups,
  };
}

async function detectContactBias(
  entityId: string,
  startDate: Date,
  endDate: Date
): Promise<BiasDimension> {
  const messages = await prisma.message.findMany({
    where: {
      entityId,
      createdAt: { gte: startDate, lte: endDate },
    },
    select: { recipientId: true, draftStatus: true },
  });

  // Group by recipient
  const recipientMap = new Map<string, { total: number; approved: number }>();
  for (const msg of messages) {
    const existing = recipientMap.get(msg.recipientId) ?? {
      total: 0,
      approved: 0,
    };
    existing.total++;
    if (msg.draftStatus === 'APPROVED' || msg.draftStatus === 'SENT') {
      existing.approved++;
    }
    recipientMap.set(msg.recipientId, existing);
  }

  const rates: number[] = [];
  const affectedGroups: { group: string; deviation: number }[] = [];

  for (const [contactId, data] of recipientMap) {
    const rate = data.total > 0 ? data.approved / data.total : 0;
    rates.push(rate);
    affectedGroups.push({ group: contactId, deviation: 0 });
  }

  const meanRate =
    rates.length > 0 ? rates.reduce((s, r) => s + r, 0) / rates.length : 0;
  for (let i = 0; i < rates.length; i++) {
    affectedGroups[i].deviation = Math.round((rates[i] - meanRate) * 1000) / 1000;
  }

  const variance =
    rates.length > 0
      ? rates.reduce((sum, r) => sum + Math.pow(r - meanRate, 2), 0) / rates.length
      : 0;
  const score = Math.min(1, Math.sqrt(variance) * 2);

  return {
    name: 'contact_bias',
    score: Math.round(score * 100) / 100,
    description:
      score > 0.3
        ? 'Response quality varies by contact.'
        : 'Response quality is consistent across contacts.',
    affectedGroups,
  };
}

async function detectChannelBias(
  entityId: string,
  startDate: Date,
  endDate: Date
): Promise<BiasDimension> {
  const messages = await prisma.message.findMany({
    where: {
      entityId,
      createdAt: { gte: startDate, lte: endDate },
    },
    select: { channel: true, draftStatus: true },
  });

  const channelMap = new Map<string, { total: number; approved: number }>();
  for (const msg of messages) {
    const existing = channelMap.get(msg.channel) ?? {
      total: 0,
      approved: 0,
    };
    existing.total++;
    if (msg.draftStatus === 'APPROVED' || msg.draftStatus === 'SENT') {
      existing.approved++;
    }
    channelMap.set(msg.channel, existing);
  }

  const rates: number[] = [];
  const affectedGroups: { group: string; deviation: number }[] = [];

  for (const [channel, data] of channelMap) {
    const rate = data.total > 0 ? data.approved / data.total : 0;
    rates.push(rate);
    affectedGroups.push({ group: channel, deviation: 0 });
  }

  const meanRate =
    rates.length > 0 ? rates.reduce((s, r) => s + r, 0) / rates.length : 0;
  for (let i = 0; i < rates.length; i++) {
    affectedGroups[i].deviation = Math.round((rates[i] - meanRate) * 1000) / 1000;
  }

  const variance =
    rates.length > 0
      ? rates.reduce((sum, r) => sum + Math.pow(r - meanRate, 2), 0) / rates.length
      : 0;
  const score = Math.min(1, Math.sqrt(variance) * 2);

  return {
    name: 'channel_bias',
    score: Math.round(score * 100) / 100,
    description:
      score > 0.3
        ? 'Accuracy differs by communication channel.'
        : 'Accuracy is consistent across channels.',
    affectedGroups,
  };
}

async function detectTimeBias(
  startDate: Date,
  endDate: Date
): Promise<BiasDimension> {
  const actions = await prisma.actionLog.findMany({
    where: {
      actor: 'AI',
      timestamp: { gte: startDate, lte: endDate },
    },
  });

  // Group by hour of day
  const hourMap = new Map<number, { total: number; failed: number }>();
  for (const action of actions) {
    const hour = action.timestamp.getHours();
    const existing = hourMap.get(hour) ?? { total: 0, failed: 0 };
    existing.total++;
    if (action.status === 'FAILED' || action.status === 'ROLLED_BACK') {
      existing.failed++;
    }
    hourMap.set(hour, existing);
  }

  const rates: number[] = [];
  const affectedGroups: { group: string; deviation: number }[] = [];

  for (const [hour, data] of hourMap) {
    const successRate = data.total > 0 ? 1 - data.failed / data.total : 1;
    rates.push(successRate);
    affectedGroups.push({ group: `${hour}:00`, deviation: 0 });
  }

  const meanRate =
    rates.length > 0 ? rates.reduce((s, r) => s + r, 0) / rates.length : 0;
  for (let i = 0; i < rates.length; i++) {
    affectedGroups[i].deviation = Math.round((rates[i] - meanRate) * 1000) / 1000;
  }

  const variance =
    rates.length > 0
      ? rates.reduce((sum, r) => sum + Math.pow(r - meanRate, 2), 0) / rates.length
      : 0;
  const score = Math.min(1, Math.sqrt(variance) * 2);

  return {
    name: 'time_bias',
    score: Math.round(score * 100) / 100,
    description:
      score > 0.3
        ? 'Performance varies by time of day.'
        : 'Performance is consistent throughout the day.',
    affectedGroups,
  };
}

function parsePeriod(period: string): { startDate: Date; endDate: Date } {
  const weekMatch = period.match(/^(\d{4})-(\d{2})-W(\d+)$/);
  if (weekMatch) {
    const year = parseInt(weekMatch[1]);
    const week = parseInt(weekMatch[3]);
    const jan1 = new Date(year, 0, 1);
    const startDate = new Date(jan1.getTime() + (week - 1) * 7 * 86400000);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate.getTime() + 7 * 86400000);
    endDate.setHours(23, 59, 59, 999);
    return { startDate, endDate };
  }

  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const year = parseInt(monthMatch[1]);
    const month = parseInt(monthMatch[2]) - 1;
    return {
      startDate: new Date(year, month, 1),
      endDate: new Date(year, month + 1, 0, 23, 59, 59, 999),
    };
  }

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 7 * 86400000);
  return { startDate, endDate };
}
