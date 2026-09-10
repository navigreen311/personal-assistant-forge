// ============================================================================
// Document versioning service
//
// T-018: one of four in-memory stores. Versions have NO table in the frozen
// schema, so this remains a Map; the persistence gap is ESCALATED in the PR
// body rather than worked around.
//
// TENANCY -- READ BEFORE ADDING A CALLER.
//
// Every function here is keyed by documentId and knows nothing about entities.
// That is deliberate and matches tenancy-pattern.md sec.3: a child record with no
// entityId column has its scope proven on the PARENT. The routes
// (documents/[id]/versions, documents/[id]/redline) resolve the Document with
// `findFirst({ where: { id, entityId } })` first and return 404 before they
// reach this file, so a foreign documentId never gets here.
//
// The signatures are unbranded because tests/unit/platform/document-versioning.test.ts
// -- outside this package's file list -- pins them. Do NOT call these from a
// route without proving the parent document first.
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import type { Document } from '@/shared/types';
import type { DocumentVersion, Redline, RedlineChange } from '../types';

const versionStore = new Map<string, DocumentVersion[]>();

export async function createVersion(
  documentId: string,
  content: string,
  changedBy: string,
  description: string
): Promise<DocumentVersion> {
  const versions = versionStore.get(documentId) || [];
  const nextVersion = versions.length > 0 ? Math.max(...versions.map((v) => v.version)) + 1 : 1;

  const version: DocumentVersion = {
    id: uuidv4(),
    documentId,
    version: nextVersion,
    content,
    changedBy,
    changeDescription: description,
    createdAt: new Date(),
  };

  versions.push(version);
  versionStore.set(documentId, versions);
  return version;
}

export async function getVersions(documentId: string): Promise<DocumentVersion[]> {
  return (versionStore.get(documentId) || []).sort((a, b) => b.version - a.version);
}

export async function getVersion(documentId: string, version: number): Promise<DocumentVersion | null> {
  const versions = versionStore.get(documentId) || [];
  return versions.find((v) => v.version === version) || null;
}

export async function generateRedline(
  documentId: string,
  version1: number,
  version2: number
): Promise<Redline> {
  const v1 = await getVersion(documentId, version1);
  const v2 = await getVersion(documentId, version2);

  if (!v1 || !v2) throw new Error('One or both versions not found');

  const changes: RedlineChange[] = [];
  const words1 = v1.content.split(/\s+/);
  const words2 = v2.content.split(/\s+/);

  let pos = 0;
  const maxLen = Math.max(words1.length, words2.length);

  for (let i = 0; i < maxLen; i++) {
    const w1 = words1[i];
    const w2 = words2[i];

    if (w1 === undefined && w2 !== undefined) {
      changes.push({
        type: 'ADDITION',
        position: { start: pos, end: pos + w2.length },
        newText: w2,
      });
    } else if (w1 !== undefined && w2 === undefined) {
      changes.push({
        type: 'DELETION',
        position: { start: pos, end: pos + w1.length },
        originalText: w1,
      });
    } else if (w1 !== w2) {
      changes.push({
        type: 'MODIFICATION',
        position: { start: pos, end: pos + (w1?.length || 0) },
        originalText: w1,
        newText: w2,
      });
    }

    pos += (w2 || w1 || '').length + 1;
  }

  return {
    id: uuidv4(),
    documentId,
    version1,
    version2,
    changes,
  };
}

export async function rollbackToVersion(documentId: string, version: number): Promise<Document> {
  const targetVersion = await getVersion(documentId, version);
  if (!targetVersion) throw new Error(`Version ${version} not found`);

  // Create a new version with the rollback content
  await createVersion(
    documentId,
    targetVersion.content,
    'system',
    `Rollback to version ${version}`
  );

  const doc: Document = {
    id: documentId,
    title: `Document ${documentId}`,
    entityId: '',
    type: 'BRIEF',
    version: version,
    citations: [],
    content: targetVersion.content,
    status: 'DRAFT',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return doc;
}

export { versionStore };
