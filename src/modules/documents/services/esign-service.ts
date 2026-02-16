import { v4 as uuidv4 } from 'uuid';
import type { ESignRequest } from '../types';

const esignStore = new Map<string, ESignRequest>();

export async function createSignRequest(
  documentId: string,
  signers: { name: string; email: string; order: number }[],
  provider = 'docusign'
): Promise<ESignRequest> {
  const request: ESignRequest = {
    id: uuidv4(),
    documentId,
    signers: signers.map((s) => ({ ...s, status: 'PENDING' as const })),
    status: 'DRAFT',
    provider,
    createdAt: new Date(),
  };
  esignStore.set(request.id, request);
  return request;
}

export async function getSignStatus(requestId: string): Promise<ESignRequest> {
  const request = esignStore.get(requestId);
  if (!request) throw new Error(`Sign request ${requestId} not found`);
  return request;
}

export async function cancelSignRequest(requestId: string): Promise<void> {
  const request = esignStore.get(requestId);
  if (!request) throw new Error(`Sign request ${requestId} not found`);
  request.status = 'CANCELLED';
  esignStore.set(requestId, request);
}

export { esignStore };
