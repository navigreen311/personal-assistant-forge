// ============================================================================
// Commitment Tracker Service
// Records, tracks, and manages commitments (promises) between contacts.
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db';
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

  const existingCommitments = (contact.commitments as Commitment[]) ?? [];

  const newCommitment: Commitment = {
    id: uuidv4(),
    ...commitment,
    createdAt: new Date(),
  };

  await prisma.contact.update({
    where: { id: contactId },
    data: {
      commitments: [...existingCommitments, newCommitment] as unknown as Record<string, unknown>[],
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
    const commitments = (contact.commitments as Commitment[]) ?? [];
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
    const commitments = (contact.commitments as Commitment[]) ?? [];
    const index = commitments.findIndex((c) => c.id === commitmentId);

    if (index >= 0) {
      commitments[index] = { ...commitments[index], status: 'FULFILLED' };

      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          commitments: commitments as unknown as Record<string, unknown>[],
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
    const commitments = (contact.commitments as Commitment[]) ?? [];
    for (const c of commitments) {
      if (c.status === 'OPEN' && c.dueDate && new Date(c.dueDate) < now) {
        overdue.push(c);
      }
    }
  }

  return overdue;
}
