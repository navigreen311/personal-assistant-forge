// ============================================================================
// Relationship Intelligence Service
// Computes relationship scores, detects ghosting, and builds relationship graphs.
// ============================================================================

import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
import { differenceInDays } from 'date-fns';
import type { MessageChannel, Tone } from '@/shared/types';
import type {
  RelationshipNode,
  GhostingAnalysis,
  ReengagementStrategy,
} from '@/modules/communication/types';

/**
 * Calculate a relationship score (0-100) for a contact.
 * Uses 4 signals: frequency, recency, sentiment, commitment fulfillment.
 */
export async function calculateRelationshipScore(contactId: string): Promise<number> {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new Error(`Contact not found: ${contactId}`);

  const now = new Date();

  // Signal 1: Interaction frequency (0-25 points)
  const messages = await prisma.message.findMany({
    where: {
      OR: [{ senderId: contactId }, { recipientId: contactId }],
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const frequencyScore = Math.min(messages.length / 4, 25);

  // Signal 2: Recency (0-25 points)
  const lastTouch = contact.lastTouch;
  let recencyScore = 0;
  if (lastTouch) {
    const daysSince = differenceInDays(now, lastTouch);
    if (daysSince <= 7) recencyScore = 25;
    else if (daysSince <= 14) recencyScore = 20;
    else if (daysSince <= 30) recencyScore = 15;
    else if (daysSince <= 60) recencyScore = 10;
    else if (daysSince <= 90) recencyScore = 5;
    else recencyScore = 0;
  }

  // Signal 3: Sentiment from calls (0-25 points)
  const calls = await prisma.call.findMany({
    where: { contactId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  let sentimentScore = 12.5; // default neutral
  if (calls.length > 0) {
    const avgSentiment = calls.reduce((sum: number, c: { sentiment?: number | null }) => sum + (c.sentiment ?? 0), 0) / calls.length;
    // sentiment is -1 to 1, map to 0-25
    sentimentScore = ((avgSentiment + 1) / 2) * 25;
  }

  // Signal 4: Commitment fulfillment (0-25 points)
  const commitments = (contact.commitments as Array<{ status: string }>) ?? [];
  let commitmentScore = 12.5; // default neutral if no commitments
  if (commitments.length > 0) {
    const fulfilled = commitments.filter((c) => c.status === 'FULFILLED').length;
    commitmentScore = (fulfilled / commitments.length) * 25;
  }

  const total = Math.round(frequencyScore + recencyScore + sentimentScore + commitmentScore);
  return Math.min(Math.max(total, 0), 100);
}

/**
 * Build a relationship graph for an entity's contacts.
 */
export async function getRelationshipGraph(entityId: string): Promise<RelationshipNode[]> {
  const contacts = await prisma.contact.findMany({
    where: { entityId },
    include: { messages: true, calls: true },
  });

  return contacts.map((contact: { id: string; name: string; relationshipScore: number; lastTouch: Date | null; tags: string[]; messages?: unknown[]; calls?: unknown[] }) => {
    const score = contact.relationshipScore;
    const interactionCount = (contact.messages?.length ?? 0) + (contact.calls?.length ?? 0);
    const connectionStrength = getConnectionStrength(score);

    // Build edges from tags that reference other contacts
    const tags = contact.tags ?? [];
    const edges = tags
      .filter((tag: string) => tag.startsWith('rel:'))
      .map((tag: string) => {
        const parts = tag.replace('rel:', '').split(':');
        return {
          targetContactId: parts[1] ?? '',
          relationship: parts[0] ?? 'unknown',
          strength: score / 100,
        };
      })
      .filter((e: { targetContactId: string }) => e.targetContactId !== '');

    return {
      contactId: contact.id,
      name: contact.name,
      score,
      connectionStrength,
      lastInteraction: contact.lastTouch,
      interactionCount,
      edges,
    };
  });
}

/**
 * Detect if a contact has gone silent beyond their typical cadence.
 */
export async function detectGhosting(contactId: string): Promise<GhostingAnalysis> {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new Error(`Contact not found: ${contactId}`);

  const now = new Date();

  // Get message timestamps to compute average cadence
  const messages = await prisma.message.findMany({
    where: {
      OR: [{ senderId: contactId }, { recipientId: contactId }],
    },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });

  // Compute average cadence (days between messages)
  let averageCadenceDays = 14; // default
  if (messages.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < messages.length; i++) {
      gaps.push(differenceInDays(messages[i].createdAt, messages[i - 1].createdAt));
    }
    averageCadenceDays = Math.max(gaps.reduce((a, b) => a + b, 0) / gaps.length, 1);
  }

  const daysSinceLastContact = contact.lastTouch
    ? differenceInDays(now, contact.lastTouch)
    : 999;

  // Ghosting = silent for more than 2x their average cadence
  const ghostingThreshold = averageCadenceDays * 2;
  const isGhosting = daysSinceLastContact > ghostingThreshold;

  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  let suggestedAction: string;

  if (daysSinceLastContact <= averageCadenceDays) {
    riskLevel = 'LOW';
    suggestedAction = 'No action needed — contact is within normal cadence.';
  } else if (daysSinceLastContact <= ghostingThreshold) {
    riskLevel = 'MEDIUM';
    suggestedAction = 'Consider a casual check-in message.';
  } else {
    riskLevel = 'HIGH';
    suggestedAction = 'Contact has gone silent. Initiate re-engagement strategy.';
  }

  return {
    isGhosting,
    daysSinceLastContact,
    averageCadenceDays: Math.round(averageCadenceDays),
    riskLevel,
    suggestedAction,
  };
}

/**
 * Suggest a re-engagement strategy for a dormant contact.
 */
export async function suggestReengagement(contactId: string): Promise<ReengagementStrategy> {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new Error(`Contact not found: ${contactId}`);

  const preferences = (contact.preferences as Record<string, unknown>) ?? {};
  const preferredChannel = (preferences.preferredChannel as MessageChannel) ?? 'EMAIL';
  const _preferredTone = (preferences.preferredTone as Tone) ?? 'WARM';

  const ghosting = await detectGhosting(contactId);

  let approach: string;
  let suggestedMessage: string;

  if (ghosting.riskLevel === 'HIGH') {
    approach = 'Value-first re-engagement — lead with something useful to them';
    suggestedMessage = `Hi ${contact.name}, I came across something I thought you'd find valuable. It's been a while since we connected, and I'd love to catch up when you have a moment.`;
  } else if (ghosting.riskLevel === 'MEDIUM') {
    approach = 'Light check-in — casual and low-pressure';
    suggestedMessage = `Hey ${contact.name}, just wanted to check in and see how things are going. No rush on a reply — just thinking of you!`;
  } else {
    approach = 'Maintain cadence — keep the rhythm going';
    suggestedMessage = `Hi ${contact.name}, hope all is well! Wanted to touch base and see if there's anything I can help with.`;
  }

  return {
    approach,
    suggestedMessage,
    bestChannel: preferredChannel,
    bestTime: '10:00 AM (recipient timezone)',
  };
}

/**
 * Get AI-powered insights for a contact relationship.
 */
export async function getRelationshipInsights(contactId: string): Promise<{
  healthScore: number;
  riskFactors: string[];
  opportunities: string[];
  suggestedActions: string[];
}> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      messages: { take: 20, orderBy: { createdAt: 'desc' } },
      calls: { take: 10, orderBy: { createdAt: 'desc' } },
    },
  });

  if (!contact) throw new Error(`Contact not found: ${contactId}`);

  const score = await calculateRelationshipScore(contactId);
  const ghosting = await detectGhosting(contactId);

  try {
    const result = await generateJSON<{
      riskFactors: string[];
      opportunities: string[];
      suggestedActions: string[];
    }>(`Analyze this contact relationship and provide insights.

Contact: ${contact.name}
Relationship score: ${score}/100
Days since last contact: ${ghosting.daysSinceLastContact}
Average communication cadence: ${ghosting.averageCadenceDays} days
Ghosting risk: ${ghosting.riskLevel}
Recent messages: ${(contact.messages as unknown[])?.length ?? 0}
Recent calls: ${(contact.calls as unknown[])?.length ?? 0}
Tags: ${contact.tags.join(', ')}
Commitments: ${JSON.stringify(contact.commitments).substring(0, 500)}

Return JSON with:
- riskFactors: array of risks to this relationship
- opportunities: array of opportunities to strengthen the relationship
- suggestedActions: array of specific next steps to take`, {
      maxTokens: 512,
      temperature: 0.5,
      system: 'You are a relationship management advisor. Provide practical, specific insights for maintaining professional relationships.',
    });

    return {
      healthScore: score,
      ...result,
    };
  } catch {
    return {
      healthScore: score,
      riskFactors: ghosting.riskLevel === 'HIGH' ? ['Contact has gone silent'] : [],
      opportunities: [],
      suggestedActions: [ghosting.suggestedAction],
    };
  }
}

/**
 * Get contacts that need attention based on low scores or no recent contact.
 */
export async function getContactsNeedingAttention(
  entityId: string,
  limit = 10
): Promise<Array<{ contactId: string; name: string; score: number; reason: string }>> {
  const contacts = await prisma.contact.findMany({
    where: { entityId },
    select: { id: true, name: true, relationshipScore: true, lastTouch: true },
    orderBy: { relationshipScore: 'asc' },
    take: limit * 2,
  });

  const now = new Date();
  const results: Array<{ contactId: string; name: string; score: number; reason: string }> = [];

  for (const contact of contacts) {
    if (results.length >= limit) break;

    const daysSinceTouch = contact.lastTouch
      ? differenceInDays(now, contact.lastTouch)
      : 999;

    let reason = '';
    if (daysSinceTouch > 30) {
      reason = `No contact in ${daysSinceTouch} days`;
    } else if (contact.relationshipScore < 30) {
      reason = `Low relationship score: ${contact.relationshipScore}/100`;
    } else {
      continue;
    }

    results.push({
      contactId: contact.id,
      name: contact.name,
      score: contact.relationshipScore,
      reason,
    });
  }

  return results;
}

function getConnectionStrength(score: number): 'STRONG' | 'MODERATE' | 'WEAK' | 'DORMANT' {
  if (score >= 70) return 'STRONG';
  if (score >= 40) return 'MODERATE';
  if (score >= 15) return 'WEAK';
  return 'DORMANT';
}
