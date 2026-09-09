// ============================================================================
// E-signature request service
//
// T-018: this was an in-memory Map. Every pending signature request vanished
// on restart -- the one store in this module with a real-world consequence.
// P-00 landed the `ESignRequest` table for exactly this, so it is now backed
// by Prisma. No migration.
//
// TENANCY: ESignRequest has no entityId column (frozen schema) -- it hangs off
// documentId. Per tenancy-pattern.md sec.3, the scope is therefore proven on the
// PARENT: every function here takes a VerifiedEntityId and joins through
// Document, so a request belonging to another tenant is simply not found.
// ============================================================================

import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { ESignRequest } from '../types';

type StoredSigner = ESignRequest['signers'][number];

interface ESignRow {
  id: string;
  documentId: string;
  signers: Prisma.JsonValue;
  status: string;
  provider: string;
  createdAt: Date;
}

function toRequest(row: ESignRow): ESignRequest {
  return {
    id: row.id,
    documentId: row.documentId,
    signers: (row.signers as unknown as StoredSigner[]) ?? [],
    status: row.status as ESignRequest['status'],
    provider: row.provider,
    createdAt: row.createdAt,
  };
}

/**
 * Resolve a document id, but only within the caller's entity.
 *
 * Returns null when the document does not exist OR belongs to another tenant --
 * deliberately indistinguishable, so an id probe learns nothing.
 */
async function documentInScope(
  documentId: string,
  entityId: VerifiedEntityId
): Promise<string | null> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, entityId },
    select: { id: true },
  });
  return doc?.id ?? null;
}

export async function createSignRequest(
  documentId: string,
  signers: { name: string; email: string; order: number }[],
  entityId: VerifiedEntityId,
  provider = 'docusign'
): Promise<ESignRequest> {
  const doc = await documentInScope(documentId, entityId);
  if (!doc) throw new Error(`Document ${documentId} not found`);

  const row = await prisma.eSignRequest.create({
    data: {
      documentId,
      signers: signers.map((s) => ({ ...s, status: 'PENDING' as const })) as unknown as Prisma.InputJsonValue,
      status: 'DRAFT',
      provider,
    },
  });

  return toRequest(row);
}

export async function getSignStatus(
  requestId: string,
  entityId: VerifiedEntityId
): Promise<ESignRequest> {
  const row = await prisma.eSignRequest.findUnique({ where: { id: requestId } });
  if (!row) throw new Error(`Sign request ${requestId} not found`);

  // Scope proven on the parent document.
  const doc = await documentInScope(row.documentId, entityId);
  if (!doc) throw new Error(`Sign request ${requestId} not found`);

  return toRequest(row);
}

export async function cancelSignRequest(
  requestId: string,
  entityId: VerifiedEntityId
): Promise<void> {
  // getSignStatus performs the parent-scope check and throws if out of scope,
  // so a foreign request is never reached by the update below.
  await getSignStatus(requestId, entityId);

  await prisma.eSignRequest.updateMany({
    where: { id: requestId },
    data: { status: 'CANCELLED' },
  });
}

/** All sign requests for a document, within the caller's entity. */
export async function listSignRequests(
  documentId: string,
  entityId: VerifiedEntityId
): Promise<ESignRequest[]> {
  const doc = await documentInScope(documentId, entityId);
  if (!doc) return [];

  const rows = await prisma.eSignRequest.findMany({
    where: { documentId },
    orderBy: { createdAt: 'desc' },
  });

  return rows.map(toRequest);
}
