import { prisma } from '@/lib/db';
import type { EDiscoveryExport } from '../types';

export const exportStore = new Map<string, EDiscoveryExport>();

export async function search(
  entityId: string,
  query: {
    keywords: string[];
    dateFrom?: Date;
    dateTo?: Date;
    contentTypes: ('message' | 'document' | 'knowledge')[];
    custodians?: string[];
  }
): Promise<{
  results: Array<{ type: string; id: string; content: string; createdAt: Date }>;
  totalResults: number;
  searchTerms: string[];
}> {
  const results: Array<{ type: string; id: string; content: string; createdAt: Date }> = [];

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (query.dateFrom) dateFilter.gte = query.dateFrom;
  if (query.dateTo) dateFilter.lte = query.dateTo;
  const dateWhere = Object.keys(dateFilter).length > 0 ? dateFilter : undefined;

  const promises: Promise<void>[] = [];

  if (query.contentTypes.includes('message')) {
    promises.push(
      prisma.message
        .findMany({
          where: {
            entityId,
            ...(dateWhere ? { createdAt: dateWhere } : {}),
            OR: query.keywords.map((kw) => ({ body: { contains: kw } })),
          },
          take: 100,
        })
        .then((messages) => {
          for (const msg of messages) {
            results.push({ type: 'message', id: msg.id, content: msg.body, createdAt: msg.createdAt });
          }
        })
    );
  }

  if (query.contentTypes.includes('document')) {
    promises.push(
      prisma.document
        .findMany({
          where: {
            entityId,
            deletedAt: null,
            ...(dateWhere ? { createdAt: dateWhere } : {}),
            OR: query.keywords.map((kw) => ({ title: { contains: kw } })),
          },
          take: 100,
        })
        .then((docs) => {
          for (const doc of docs) {
            results.push({ type: 'document', id: doc.id, content: doc.content ?? doc.title, createdAt: doc.createdAt });
          }
        })
    );
  }

  if (query.contentTypes.includes('knowledge')) {
    promises.push(
      prisma.knowledgeEntry
        .findMany({
          where: {
            entityId,
            ...(dateWhere ? { createdAt: dateWhere } : {}),
            OR: query.keywords.map((kw) => ({ content: { contains: kw } })),
          },
          take: 100,
        })
        .then((entries) => {
          for (const entry of entries) {
            results.push({ type: 'knowledge', id: entry.id, content: entry.content, createdAt: entry.createdAt });
          }
        })
    );
  }

  await Promise.all(promises);

  await prisma.actionLog.create({
    data: {
      actor: 'EDISCOVERY',
      actionType: 'EDISCOVERY_SEARCH',
      target: entityId,
      reason: `Searched for: ${query.keywords.join(', ')}`,
      status: 'COMPLETED',
    },
  }).catch(() => {});

  return {
    results: results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    totalResults: results.length,
    searchTerms: query.keywords,
  };
}

export async function createHold(
  entityId: string,
  holdConfig: {
    name: string;
    keywords?: string[];
    dateFrom?: Date;
    dateTo?: Date;
    contentTypes: string[];
    custodians?: string[];
  }
): Promise<{ id: string; name: string; entityId: string; status: string; createdAt: Date }> {
  const rule = await prisma.rule.create({
    data: {
      name: holdConfig.name,
      scope: 'LEGAL_HOLD',
      entityId,
      condition: {
        keywords: holdConfig.keywords ?? [],
        dateFrom: holdConfig.dateFrom?.toISOString(),
        dateTo: holdConfig.dateTo?.toISOString(),
        contentTypes: holdConfig.contentTypes,
        custodians: holdConfig.custodians ?? [],
      },
      action: { action: 'PREVENT_DELETION' },
      isActive: true,
    },
  });

  return { id: rule.id, name: rule.name, entityId, status: 'ACTIVE', createdAt: rule.createdAt };
}

export async function requestExport(
  entityId: string,
  requestedBy: string,
  dateRange: { start: Date; end: Date },
  dataTypes: string[]
): Promise<EDiscoveryExport> {
  const exportRequest: EDiscoveryExport = {
    id: `export-${Date.now()}`,
    entityId,
    requestedBy,
    dateRange,
    dataTypes,
    status: 'PENDING',
    requestedAt: new Date(),
  };

  exportStore.set(exportRequest.id, exportRequest);

  await prisma.actionLog.create({
    data: {
      actor: requestedBy,
      actionType: 'EDISCOVERY_EXPORT',
      target: entityId,
      reason: `Export requested for types: ${dataTypes.join(', ')}`,
      status: 'PENDING',
    },
  }).catch(() => {});

  return exportRequest;
}

export async function exportResults(
  searchId: string,
  format: 'json' | 'csv' = 'json'
): Promise<{
  exportId: string;
  format: string;
  data: unknown;
  metadata: { totalResults: number; exportTimestamp: string; searchId: string };
}> {
  return {
    exportId: `export-${Date.now()}`,
    format,
    data: [],
    metadata: { totalResults: 0, exportTimestamp: new Date().toISOString(), searchId },
  };
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

export async function getSearchHistory(
  entityId: string
): Promise<Array<{ id: string; searchTerms: string; timestamp: Date }>> {
  const logs = await prisma.actionLog.findMany({
    where: { actionType: 'EDISCOVERY_SEARCH', target: entityId },
    orderBy: { timestamp: 'desc' },
    take: 50,
  });

  return logs.map((l) => ({ id: l.id, searchTerms: l.reason, timestamp: l.timestamp }));
}
