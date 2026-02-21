// ============================================================================
// Commitment Tracker Service
// Records, tracks, and manages commitments (promises) between contacts.
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
import type { Prisma } from '@prisma/client';
import type { Commitment } from '@/shared/types';

/**
 * Add a commitment to a contact's commitment list.
 */
export async function addCommitment(
  contactId: string,
  commitment: Omit<Commitment, 'id' | 'createdAt'>
): Promise<Commitment> {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new Error(`Contact not found: ${contactId}`);

  const existingCommitments = (contact.commitments as unknown as Commitment[]) ?? [];

  const newCommitment: Commitment = {
    id: uuidv4(),
    ...commitment,
    createdAt: new Date(),
  };

  await prisma.contact.update({
    where: { id: contactId },
    data: {
      commitments: [...existingCommitments, newCommitment] as unknown as Prisma.InputJsonValue,
    },
  });

  return newCommitment;
}

/**
 * Get all open commitments for an entity, optionally filtered by direction.
 */
export async function getOpenCommitments(
  entityId: string,
  direction?: 'TO' | 'FROM'
): Promise<Commitment[]> {
  const contacts = await prisma.contact.findMany({
    where: { entityId },
    select: { commitments: true },
  });

  const allCommitments: Commitment[] = [];

  for (const contact of contacts) {
    const commitments = (contact.commitments as unknown as Commitment[]) ?? [];
    for (const c of commitments) {
      if (c.status === 'OPEN') {
        if (!direction || c.direction === direction) {
          allCommitments.push(c);
        }
      }
    }
  }

  return allCommitments;
}

/**
 * Mark a commitment as fulfilled.
 */
export async function markFulfilled(commitmentId: string): Promise<void> {
  // Find the contact that has this commitment
  const contacts = await prisma.contact.findMany({
    select: { id: true, commitments: true },
  });

  for (const contact of contacts) {
    const commitments = (contact.commitments as unknown as Commitment[]) ?? [];
    const index = commitments.findIndex((c) => c.id === commitmentId);

    if (index >= 0) {
      commitments[index] = { ...commitments[index], status: 'FULFILLED' };

      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          commitments: commitments as unknown as Prisma.InputJsonValue,
        },
      });

      return;
    }
  }

  throw new Error(`Commitment not found: ${commitmentId}`);
}

/**
 * Get all overdue commitments for an entity.
 * A commitment is overdue if it is OPEN and its dueDate has passed.
 */
export async function getOverdueCommitments(entityId: string): Promise<Commitment[]> {
  const contacts = await prisma.contact.findMany({
    where: { entityId },
    select: { commitments: true },
  });

  const now = new Date();
  const overdue: Commitment[] = [];

  for (const contact of contacts) {
    const commitments = (contact.commitments as unknown as Commitment[]) ?? [];
    for (const c of commitments) {
      if (c.status === 'OPEN' && c.dueDate && new Date(c.dueDate) < now) {
        overdue.push(c);
      }
    }
  }

  return overdue;
}

/**
 * Extract commitments from message text using AI.
 */
export async function extractCommitmentsFromText(
  text: string,
  _contactId: string,
  _entityId: string
): Promise<Commitment[]> {
  const result = await generateJSON<{
    commitments: Array<{
      description: string;
      direction: 'TO' | 'FROM';
      dueDate?: string;
      priority: 'LOW' | 'MEDIUM' | 'HIGH';
    }>;
  }>(`Analyze this message text and extract any commitments or promises made.

Text: "${text}"

Return JSON with a "commitments" array. Each commitment should have:
- description: what was promised
- direction: "TO" if the sender promised something to us, "FROM" if we promised something to them
- dueDate: ISO date string if a deadline was mentioned, null otherwise
- priority: LOW, MEDIUM, or HIGH based on importance`, {
    maxTokens: 512,
    temperature: 0.3,
    system: 'You are an expert at identifying commitments and promises in business communications. Be precise and only extract clear commitments, not vague intentions.',
  });

  return result.commitments.map((c) => ({
    id: uuidv4(),
    description: c.description,
    direction: c.direction,
    dueDate: c.dueDate ? new Date(c.dueDate) : undefined,
    status: 'OPEN' as const,
    createdAt: new Date(),
  }));
}

/**
 * Extract commitments from text using AI and save them to the contact.
 */
export async function extractAndSaveCommitments(
  text: string,
  contactId: string,
  entityId: string
): Promise<Commitment[]> {
  const commitments = await extractCommitmentsFromText(text, contactId, entityId);

  for (const commitment of commitments) {
    await addCommitment(contactId, {
      description: commitment.description,
      direction: commitment.direction,
      dueDate: commitment.dueDate,
      status: commitment.status,
    });
  }

  return commitments;
}
