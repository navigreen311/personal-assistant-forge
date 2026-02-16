import { v4 as uuidv4 } from 'uuid';
import type { EDiscoveryExport } from '../types';

const exportStore = new Map<string, EDiscoveryExport>();

export async function requestExport(
  entityId: string,
  requestedBy: string,
  dateRange: { start: Date; end: Date },
  dataTypes: string[]
): Promise<EDiscoveryExport> {
  const exportRequest: EDiscoveryExport = {
    id: uuidv4(),
    entityId,
    requestedBy,
    dateRange,
    dataTypes,
    status: 'PENDING',
    requestedAt: new Date(),
  };
  exportStore.set(exportRequest.id, exportRequest);
  return exportRequest;
}

export async function getExportStatus(exportId: string): Promise<EDiscoveryExport> {
  const exp = exportStore.get(exportId);
  if (!exp) throw new Error(`Export ${exportId} not found`);
  return exp;
}

export async function listExports(entityId: string): Promise<EDiscoveryExport[]> {
  const results: EDiscoveryExport[] = [];
  for (const exp of exportStore.values()) {
    if (exp.entityId === entityId) results.push(exp);
  }
  return results.sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
}

export { exportStore };
