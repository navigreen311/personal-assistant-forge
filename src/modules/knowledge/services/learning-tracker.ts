import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { LearningItem, SpacedRepetitionSchedule, StoredLearningData } from '@/modules/knowledge/types';

function toLearningItem(entry: Record<string, unknown>): LearningItem {
  const data = JSON.parse(entry.content as string) as StoredLearningData;
  return {
    id: entry.id as string,
    entityId: entry.entityId as string,
    title: data.title,
    type: data.type,
    status: data.status,
    progress: data.progress,
    notes: data.notes,
    keyTakeaways: data.keyTakeaways,
    startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
    completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
    nextReviewDate: data.nextReviewDate ? new Date(data.nextReviewDate) : undefined,
    reviewCount: data.reviewCount,
    tags: (entry.tags as string[]) || [],
    url: data.url,
    createdAt: new Date(entry.createdAt as string),
    updatedAt: new Date(entry.updatedAt as string),
  };
}

function _toStoredData(item: Partial<LearningItem> & Pick<LearningItem, 'title' | 'type' | 'status' | 'progress' | 'notes' | 'keyTakeaways' | 'reviewCount' | 'tags'>, easeFactor: number = 2.5, interval: number = 0): string {
  const stored: StoredLearningData = {
    title: item.title,
    type: item.type,
    status: item.status,
    progress: item.progress,
    notes: item.notes,
    keyTakeaways: item.keyTakeaways,
    startedAt: item.startedAt?.toISOString(),
    completedAt: item.completedAt?.toISOString(),
    nextReviewDate: item.nextReviewDate?.toISOString(),
    reviewCount: item.reviewCount,
    easeFactor,
    interval,
    url: item.url,
  };
  return JSON.stringify(stored);
}

export async function addLearningItem(
  data: Omit<LearningItem, 'id' | 'entityId' | 'reviewCount' | 'createdAt' | 'updatedAt'>,
  entityId: VerifiedEntityId
): Promise<LearningItem> {
  const stored: StoredLearningData = {
    title: data.title,
    type: data.type,
    status: data.status,
    progress: data.progress,
    notes: data.notes,
    keyTakeaways: data.keyTakeaways,
    startedAt: data.startedAt?.toISOString(),
    completedAt: data.completedAt?.toISOString(),
    nextReviewDate: data.nextReviewDate?.toISOString(),
    reviewCount: 0,
    easeFactor: 2.5,
    interval: 0,
    url: data.url,
  };

  const entry = await prisma.knowledgeEntry.create({
    data: {
      content: JSON.stringify(stored),
      tags: data.tags,
      // From the verified scope, never from the caller's payload.
      entityId,
      source: `learning://${data.type.toLowerCase()}`,
      linkedEntities: [],
    },
  });

  return toLearningItem(entry as unknown as Record<string, unknown>);
}

export async function updateProgress(
  id: string,
  entityId: VerifiedEntityId,
  progress: number
): Promise<LearningItem> {
  // Scope in the WHERE: another tenant's item is simply not found.
  const entry = await prisma.knowledgeEntry.findFirst({ where: { id, entityId } });
  if (!entry) throw new Error(`Learning item ${id} not found`);

  const data = JSON.parse((entry as unknown as { content: string }).content) as StoredLearningData;
  data.progress = progress;

  if (progress >= 100) {
    data.status = 'COMPLETED';
    data.completedAt = new Date().toISOString();
  } else if (progress > 0 && data.status === 'QUEUED') {
    data.status = 'IN_PROGRESS';
    data.startedAt = data.startedAt || new Date().toISOString();
  }

  const result = await prisma.knowledgeEntry.updateMany({
    where: { id, entityId },
    data: { content: JSON.stringify(data) },
  });
  if (result.count === 0) throw new Error(`Learning item ${id} not found`);

  const updated = await prisma.knowledgeEntry.findFirst({ where: { id, entityId } });
  if (!updated) throw new Error(`Learning item ${id} not found`);

  return toLearningItem(updated as unknown as Record<string, unknown>);
}

export async function getDueForReview(entityId: VerifiedEntityId): Promise<LearningItem[]> {
  const entries = await prisma.knowledgeEntry.findMany({
    where: {
      entityId,
      source: { startsWith: 'learning://' },
    },
  });

  const now = new Date();
  return entries
    .map((e: unknown) => toLearningItem(e as unknown as Record<string, unknown>))
    .filter((item: LearningItem) => item.nextReviewDate && item.nextReviewDate <= now);
}

export function calculateNextReview(
  reviewCount: number,
  easeFactor: number,
  quality: number
): SpacedRepetitionSchedule {
  // SM-2 algorithm
  let newEF = easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  newEF = Math.max(1.3, newEF);

  let interval: number;

  if (quality < 3) {
    interval = 1;
  } else {
    if (reviewCount === 0) {
      interval = 1;
    } else if (reviewCount === 1) {
      interval = 6;
    } else {
      // For review 3+, use previous interval * EF
      // Since we don't have the previous interval here, we calculate it
      // Based on SM-2: interval(n) = interval(n-1) * EF
      // interval(1) = 1, interval(2) = 6, interval(3+) = prev * EF
      let prevInterval = 6;
      for (let i = 2; i < reviewCount; i++) {
        prevInterval = Math.round(prevInterval * easeFactor);
      }
      interval = Math.round(prevInterval * newEF);
    }
  }

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + interval);

  return {
    itemId: '',
    nextReviewDate,
    interval,
    easeFactor: newEF,
  };
}

export async function recordReview(
  id: string,
  entityId: VerifiedEntityId,
  quality: number
): Promise<SpacedRepetitionSchedule> {
  const entry = await prisma.knowledgeEntry.findFirst({ where: { id, entityId } });
  if (!entry) throw new Error(`Learning item ${id} not found`);

  const data = JSON.parse((entry as unknown as { content: string }).content) as StoredLearningData;
  const schedule = calculateNextReview(data.reviewCount, data.easeFactor, quality);
  schedule.itemId = id;

  data.reviewCount += 1;
  data.easeFactor = schedule.easeFactor;
  data.interval = schedule.interval;
  data.nextReviewDate = schedule.nextReviewDate.toISOString();

  const written = await prisma.knowledgeEntry.updateMany({
    where: { id, entityId },
    data: { content: JSON.stringify(data) },
  });
  if (written.count === 0) throw new Error(`Learning item ${id} not found`);

  return schedule;
}
