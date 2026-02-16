// ============================================================================
// Decision Journal Service (DB-Backed via Document table)
// ============================================================================

import { prisma } from '@/lib/db';
import { addDays } from 'date-fns';
import type {
  JournalEntry,
  JournalStatus,
  DecisionAccuracy,
} from '@/modules/decisions/types';

const JOURNAL_DOC_TYPE = 'REPORT'; // Use existing DocumentType for journal storage

interface JournalDocContent {
  entityId: string;
  decisionId?: string;
  context: string;
  optionsConsidered: string[];
  chosenOption: string;
  rationale: string;
  expectedOutcomes: string[];
  actualOutcomes?: string[];
  reviewDate: string;
  status: JournalStatus;
  lessonsLearned?: string;
}

/**
 * Create a new journal entry, stored in the Document table.
 */
export async function createEntry(
  entry: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'>
): Promise<JournalEntry> {
  const content: JournalDocContent = {
    entityId: entry.entityId,
    decisionId: entry.decisionId,
    context: entry.context,
    optionsConsidered: entry.optionsConsidered,
    chosenOption: entry.chosenOption,
    rationale: entry.rationale,
    expectedOutcomes: entry.expectedOutcomes,
    actualOutcomes: entry.actualOutcomes,
    reviewDate: entry.reviewDate.toISOString(),
    status: entry.status,
    lessonsLearned: entry.lessonsLearned,
  };

  const doc = await prisma.document.create({
    data: {
      title: entry.title,
      entityId: entry.entityId,
      type: JOURNAL_DOC_TYPE,
      content: JSON.stringify(content),
      citations: [],
      status: 'DRAFT',
    },
  });

  return docToJournalEntry(doc);
}

/**
 * Review a journal entry — update with actual outcomes, status, and lessons.
 */
export async function reviewEntry(
  id: string,
  actualOutcomes: string[],
  status: string,
  lessonsLearned: string
): Promise<JournalEntry> {
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc || !doc.content) {
    throw new Error(`Journal entry ${id} not found`);
  }

  const data: JournalDocContent = JSON.parse(doc.content);
  data.actualOutcomes = actualOutcomes;
  data.status = status as JournalStatus;
  data.lessonsLearned = lessonsLearned;

  const updated = await prisma.document.update({
    where: { id },
    data: {
      content: JSON.stringify(data),
      status: 'APPROVED',
    },
  });

  return docToJournalEntry(updated);
}

/**
 * Get journal entries with reviewDate within N days from now.
 */
export async function getUpcomingReviews(
  entityId: string,
  days: number
): Promise<JournalEntry[]> {
  const docs = await prisma.document.findMany({
    where: {
      entityId,
      type: JOURNAL_DOC_TYPE,
    },
    orderBy: { createdAt: 'desc' },
  });

  const now = new Date();
  const cutoff = addDays(now, days);

  return docs
    .map((doc: { id: string; title: string; content: string | null; createdAt: Date; updatedAt: Date }) => docToJournalEntry(doc))
    .filter((entry: JournalEntry) => {
      const reviewDate = new Date(entry.reviewDate);
      return (
        entry.status === 'PENDING_REVIEW' &&
        reviewDate >= now &&
        reviewDate <= cutoff
      );
    });
}

/**
 * Calculate decision accuracy stats for an entity.
 */
export async function getDecisionAccuracy(
  entityId: string
): Promise<DecisionAccuracy> {
  const docs = await prisma.document.findMany({
    where: {
      entityId,
      type: JOURNAL_DOC_TYPE,
    },
  });

  const entries = docs.map((doc: { id: string; title: string; content: string | null; createdAt: Date; updatedAt: Date }) => docToJournalEntry(doc));
  const reviewed = entries.filter((e: JournalEntry) => e.status !== 'PENDING_REVIEW');

  const correct = reviewed.filter((e: JournalEntry) => e.status === 'REVIEWED_CORRECT').length;
  const incorrect = reviewed.filter((e: JournalEntry) => e.status === 'REVIEWED_INCORRECT').length;
  const mixed = reviewed.filter((e: JournalEntry) => e.status === 'REVIEWED_MIXED').length;
  const total = reviewed.length;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) / 100 : 0;

  return { total, correct, incorrect, mixed, accuracy };
}

// --- Helpers ---

function docToJournalEntry(doc: {
  id: string;
  title: string;
  content: string | null;
  createdAt: Date;
  updatedAt: Date;
}): JournalEntry {
  const data: JournalDocContent = doc.content
    ? JSON.parse(doc.content)
    : {};

  return {
    id: doc.id,
    entityId: data.entityId ?? '',
    decisionId: data.decisionId,
    title: doc.title,
    context: data.context ?? '',
    optionsConsidered: data.optionsConsidered ?? [],
    chosenOption: data.chosenOption ?? '',
    rationale: data.rationale ?? '',
    expectedOutcomes: data.expectedOutcomes ?? [],
    actualOutcomes: data.actualOutcomes,
    reviewDate: data.reviewDate ? new Date(data.reviewDate) : new Date(),
    status: data.status ?? 'PENDING_REVIEW',
    lessonsLearned: data.lessonsLearned,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
