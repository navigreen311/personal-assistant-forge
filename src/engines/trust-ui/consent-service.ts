import { prisma } from '@/lib/db';
import type { ConsentReceipt } from '@/shared/types';

export async function createConsentReceipt(
  actionId: string,
  description: string,
  reason: string,
  impacted: string[],
  reversible: boolean,
  rollbackLink?: string,
  confidence = 0.5
): Promise<ConsentReceipt> {
  const receipt = await prisma.consentReceipt.create({
    data: {
      actionId,
      description,
      reason,
      impacted,
      reversible,
      rollbackLink,
      confidence,
    },
  });

  return mapPrismaReceipt(receipt);
}

export async function getReceiptsForAction(actionId: string): Promise<ConsentReceipt[]> {
  const receipts = await prisma.consentReceipt.findMany({
    where: { actionId },
    orderBy: { timestamp: 'desc' },
  });

  return receipts.map(mapPrismaReceipt);
}

export async function getRecentReceipts(
  userId: string,
  limit = 20
): Promise<ConsentReceipt[]> {
  // Find action logs for this user, then get their consent receipts
  const actionLogs = await prisma.actionLog.findMany({
    where: { actorId: userId },
    select: { id: true },
    orderBy: { timestamp: 'desc' },
    take: limit * 2, // fetch extra to account for actions without receipts
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actionIds = actionLogs.map((a: any) => a.id as string);

  const receipts = await prisma.consentReceipt.findMany({
    where: { actionId: { in: actionIds } },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });

  return receipts.map(mapPrismaReceipt);
}

export function formatReceiptSummary(receipt: ConsentReceipt): string {
  const impactedStr = receipt.impacted.length > 0
    ? receipt.impacted.join(', ')
    : 'none';
  const reversibleStr = receipt.reversible ? 'yes' : 'no';
  const rollbackStr = receipt.rollbackLink
    ? `; rollback: ${receipt.rollbackLink}`
    : '';

  return `Executed [${receipt.description}] because [${receipt.reason}]; impacted [${impactedStr}]; reversible: [${reversibleStr}]${rollbackStr}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPrismaReceipt(raw: any): ConsentReceipt {
  return {
    id: raw.id,
    actionId: raw.actionId,
    description: raw.description,
    reason: raw.reason,
    impacted: raw.impacted,
    reversible: raw.reversible,
    rollbackLink: raw.rollbackLink ?? undefined,
    confidence: raw.confidence,
    timestamp: raw.timestamp,
  };
}
