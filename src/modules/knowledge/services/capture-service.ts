import { prisma } from '@/lib/db';
import type { KnowledgeEntry } from '@/shared/types';
import type { CaptureRequest, CapturedEntry, CaptureType, StoredKnowledgeData } from '@/modules/knowledge/types';

const STOP_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
  'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
  'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
  'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see',
  'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over',
  'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work',
  'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these',
  'give', 'day', 'most', 'us', 'is', 'are', 'was', 'were', 'been', 'has',
  'had', 'did', 'does', 'doing', 'being', 'having', 'each', 'every', 'both',
  'few', 'more', 'much', 'many', 'such', 'very', 'own', 'same', 'should',
]);

const MAX_AUTO_TAGS = 8;

export function generateAutoTags(content: string): string[] {
  if (!content || !content.trim()) return [];

  const words = content
    .toLowerCase()
    .split(/[\s,.;:!?()\[\]{}"'`\-_/\\|@#$%^&*+=<>~]+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) || 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_AUTO_TAGS)
    .map(([word]) => word);
}

export function generateTitle(content: string, type: CaptureType): string {
  if (!content || !content.trim()) return `Untitled ${type}`;

  const firstLine = content.split(/[.\n]/)[0]?.trim() || content.trim();
  const title = firstLine.length > 60 ? firstLine.substring(0, 57) + '...' : firstLine;

  return title || `Untitled ${type}`;
}

function knowledgeEntryToCaptured(entry: KnowledgeEntry): CapturedEntry {
  const stored = parseStoredData(entry.content);
  return {
    id: entry.id,
    entityId: entry.entityId,
    type: stored.type,
    title: stored.title,
    content: stored.body,
    source: entry.source,
    tags: entry.tags,
    autoTags: stored.autoTags,
    linkedEntries: entry.linkedEntities,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function parseStoredData(content: string): StoredKnowledgeData {
  try {
    return JSON.parse(content) as StoredKnowledgeData;
  } catch {
    return { type: 'NOTE', title: 'Untitled', body: content, autoTags: [] };
  }
}

export async function capture(request: CaptureRequest): Promise<CapturedEntry> {
  const autoTags = generateAutoTags(request.content);
  const title = request.title || generateTitle(request.content, request.type);
  const allTags = Array.from(new Set([...(request.tags || []), ...autoTags]));

  const stored: StoredKnowledgeData = {
    type: request.type,
    title,
    body: request.content,
    autoTags,
    metadata: request.metadata,
  };

  const entry = await prisma.knowledgeEntry.create({
    data: {
      content: JSON.stringify(stored),
      tags: allTags,
      entityId: request.entityId,
      source: request.source,
      linkedEntities: [],
    },
  });

  return knowledgeEntryToCaptured(entry as unknown as KnowledgeEntry);
}

export async function batchCapture(requests: CaptureRequest[]): Promise<CapturedEntry[]> {
  const results: CapturedEntry[] = [];
  for (const request of requests) {
    results.push(await capture(request));
  }
  return results;
}

export { knowledgeEntryToCaptured, parseStoredData };
