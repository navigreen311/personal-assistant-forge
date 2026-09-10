import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { KnowledgeEntry } from '@/shared/types';
import type { LinkSuggestion } from '@/modules/knowledge/types';
import { parseStoredData } from './capture-service';

const TAG_WEIGHT = 0.3;
const KEYWORD_WEIGHT = 0.5;
const ENTITY_WEIGHT = 0.2;

function extractKeywords(content: string): string[] {
  return content
    .toLowerCase()
    .split(/[\s,.;:!?()\[\]{}"'`\-_/\\|@#$%^&*+=<>~]+/)
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w));
}

export function calculateLinkConfidence(source: KnowledgeEntry, target: KnowledgeEntry): number {
  // Shared tags component (0.3 weight)
  const sourceTags = new Set(source.tags.map((t) => t.toLowerCase()));
  const targetTags = new Set(target.tags.map((t) => t.toLowerCase()));
  const sharedTagCount = [...sourceTags].filter((t) => targetTags.has(t)).length;
  const totalTags = new Set([...sourceTags, ...targetTags]).size;
  const tagScore = totalTags > 0 ? sharedTagCount / totalTags : 0;

  // Keyword overlap component (0.5 weight)
  const sourceData = parseStoredData(source.content);
  const targetData = parseStoredData(target.content);
  const sourceKeywords = new Set(extractKeywords(sourceData.body));
  const targetKeywords = new Set(extractKeywords(targetData.body));
  const sharedKeywordCount = [...sourceKeywords].filter((k) => targetKeywords.has(k)).length;
  const totalKeywords = new Set([...sourceKeywords, ...targetKeywords]).size;
  const keywordScore = totalKeywords > 0 ? sharedKeywordCount / totalKeywords : 0;

  // Same entity component (0.2 weight)
  const entityScore = source.entityId === target.entityId ? 1 : 0;

  return Math.min(1, tagScore * TAG_WEIGHT + keywordScore * KEYWORD_WEIGHT + entityScore * ENTITY_WEIGHT);
}

function getSharedTags(source: KnowledgeEntry, target: KnowledgeEntry): string[] {
  const targetTags = new Set(target.tags.map((t) => t.toLowerCase()));
  return source.tags.filter((t) => targetTags.has(t.toLowerCase()));
}

function getSharedKeywords(source: KnowledgeEntry, target: KnowledgeEntry): string[] {
  const sourceData = parseStoredData(source.content);
  const targetData = parseStoredData(target.content);
  const sourceKw = new Set(extractKeywords(sourceData.body));
  const targetKw = new Set(extractKeywords(targetData.body));
  return [...sourceKw].filter((k) => targetKw.has(k)).slice(0, 10);
}

export async function suggestLinks(
  entryId: string,
  entityId: VerifiedEntityId
): Promise<LinkSuggestion[]> {
  const sourceEntry = await prisma.knowledgeEntry.findFirst({
    where: { id: entryId, entityId },
  });
  if (!sourceEntry) return [];

  const source = sourceEntry as unknown as KnowledgeEntry;

  const candidates = await prisma.knowledgeEntry.findMany({
    where: {
      // The verified scope, not the source row's own column: a graph walk must
      // be scoped at EVERY hop (tenancy-pattern.md sec.3).
      entityId,
      id: { not: entryId },
    },
  });

  const suggestions: LinkSuggestion[] = [];

  for (const candidate of candidates) {
    const target = candidate as unknown as KnowledgeEntry;
    if (source.linkedEntities.includes(target.id)) continue;

    const confidence = calculateLinkConfidence(source, target);
    if (confidence > 0.05) {
      const shared = getSharedTags(source, target);
      const sharedKw = getSharedKeywords(source, target);
      const reasons: string[] = [];
      if (shared.length > 0) reasons.push(`shared tags: ${shared.join(', ')}`);
      if (sharedKw.length > 0) reasons.push(`shared keywords: ${sharedKw.slice(0, 3).join(', ')}`);
      if (source.entityId === target.entityId) reasons.push('same entity');

      suggestions.push({
        sourceId: entryId,
        targetId: target.id,
        targetType: 'KNOWLEDGE',
        reason: reasons.join('; ') || 'potential relation',
        confidence,
        sharedTags: shared,
        sharedKeywords: sharedKw,
      });
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Link two entries, bidirectionally.
 *
 * BOTH hops are scoped. The link is bidirectional, so before this an
 * authenticated caller could name another tenant's entry as `targetId` and the
 * WRITE-BACK half would edit that tenant's row -- a cross-tenant write reached
 * through a graph edge rather than through a request field.
 */
export async function applyLink(
  sourceId: string,
  targetId: string,
  entityId: VerifiedEntityId
): Promise<void> {
  const source = await prisma.knowledgeEntry.findFirst({
    where: { id: sourceId, entityId },
  });
  if (!source) throw new Error(`Entry ${sourceId} not found`);

  const target = await prisma.knowledgeEntry.findFirst({
    where: { id: targetId, entityId },
  });
  if (!target) throw new Error(`Entry ${targetId} not found`);

  const linked = (source as unknown as KnowledgeEntry).linkedEntities;
  if (!linked.includes(targetId)) {
    await prisma.knowledgeEntry.updateMany({
      where: { id: sourceId, entityId },
      data: { linkedEntities: [...linked, targetId] },
    });
  }

  // Bidirectional link -- the target was proven in scope above.
  const targetLinked = (target as unknown as KnowledgeEntry).linkedEntities;
  if (!targetLinked.includes(sourceId)) {
    await prisma.knowledgeEntry.updateMany({
      where: { id: targetId, entityId },
      data: { linkedEntities: [...targetLinked, sourceId] },
    });
  }
}

export async function removeLink(
  sourceId: string,
  targetId: string,
  entityId: VerifiedEntityId
): Promise<void> {
  const source = await prisma.knowledgeEntry.findFirst({
    where: { id: sourceId, entityId },
  });
  if (!source) throw new Error(`Entry ${sourceId} not found`);

  const linked = (source as unknown as KnowledgeEntry).linkedEntities;
  await prisma.knowledgeEntry.updateMany({
    where: { id: sourceId, entityId },
    data: { linkedEntities: linked.filter((id) => id !== targetId) },
  });

  const target = await prisma.knowledgeEntry.findFirst({
    where: { id: targetId, entityId },
  });
  if (target) {
    const targetLinked = (target as unknown as KnowledgeEntry).linkedEntities;
    await prisma.knowledgeEntry.updateMany({
      where: { id: targetId, entityId },
      data: { linkedEntities: targetLinked.filter((id) => id !== sourceId) },
    });
  }
}
