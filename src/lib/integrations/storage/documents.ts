import { v4 as uuidv4 } from 'uuid';
import { getAccessUrl } from './uploads';

// --- Types ---

export interface DocumentVersion {
  version: number;
  storageKey: string;
  sizeBytes: number;
  checksum: string;
  uploadedBy: string;
  uploadedAt: Date;
  changelog?: string;
}

export interface DocumentMetadata {
  id: string;
  entityId: string;
  title: string;
  description?: string;
  mimeType: string;
  category: string;
  tags: string[];
  currentVersion: number;
  versions: DocumentVersion[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

// --- In-Memory Store ---

const documentStore = new Map<string, DocumentMetadata>();

/** Exposed for testing: clears all documents from the in-memory store. */
export function _resetStore(): void {
  documentStore.clear();
}

// --- Document CRUD ---

export async function createDocument(params: {
  entityId: string;
  title: string;
  description?: string;
  category: string;
  tags?: string[];
  file: { key: string; sizeBytes: number; checksum: string; mimeType: string };
  userId: string;
}): Promise<DocumentMetadata> {
  const id = uuidv4();
  const now = new Date();

  const version: DocumentVersion = {
    version: 1,
    storageKey: params.file.key,
    sizeBytes: params.file.sizeBytes,
    checksum: params.file.checksum,
    uploadedBy: params.userId,
    uploadedAt: now,
  };

  const doc: DocumentMetadata = {
    id,
    entityId: params.entityId,
    title: params.title,
    description: params.description,
    mimeType: params.file.mimeType,
    category: params.category,
    tags: params.tags ?? [],
    currentVersion: 1,
    versions: [version],
    createdBy: params.userId,
    createdAt: now,
    updatedAt: now,
  };

  documentStore.set(id, doc);
  return doc;
}

export async function addDocumentVersion(params: {
  documentId: string;
  file: { key: string; sizeBytes: number; checksum: string };
  userId: string;
  changelog?: string;
}): Promise<DocumentVersion> {
  const doc = documentStore.get(params.documentId);
  if (!doc) {
    throw new Error(`DOCUMENT_NOT_FOUND: No document with id '${params.documentId}'`);
  }
  if (doc.deletedAt) {
    throw new Error(`DOCUMENT_DELETED: Document '${params.documentId}' has been deleted`);
  }

  const newVersion: DocumentVersion = {
    version: doc.currentVersion + 1,
    storageKey: params.file.key,
    sizeBytes: params.file.sizeBytes,
    checksum: params.file.checksum,
    uploadedBy: params.userId,
    uploadedAt: new Date(),
    changelog: params.changelog,
  };

  doc.versions.push(newVersion);
  doc.currentVersion = newVersion.version;
  doc.updatedAt = new Date();

  return newVersion;
}

export async function getDocument(documentId: string): Promise<DocumentMetadata | null> {
  const doc = documentStore.get(documentId);
  if (!doc || doc.deletedAt) return null;
  return doc;
}

export async function listDocuments(params: {
  entityId: string;
  category?: string;
  tags?: string[];
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ documents: DocumentMetadata[]; total: number }> {
  const { entityId, category, tags, search, page = 1, pageSize = 20 } = params;

  let results = Array.from(documentStore.values()).filter(
    (doc) => doc.entityId === entityId && !doc.deletedAt
  );

  if (category) {
    results = results.filter((doc) => doc.category === category);
  }

  if (tags && tags.length > 0) {
    results = results.filter((doc) =>
      tags.some((tag) => doc.tags.includes(tag))
    );
  }

  if (search) {
    const lower = search.toLowerCase();
    results = results.filter(
      (doc) =>
        doc.title.toLowerCase().includes(lower) ||
        (doc.description?.toLowerCase().includes(lower) ?? false)
    );
  }

  const total = results.length;
  const start = (page - 1) * pageSize;
  const paged = results.slice(start, start + pageSize);

  return { documents: paged, total };
}

export async function getDocumentDownloadUrl(
  documentId: string,
  version?: number
): Promise<string | null> {
  const doc = documentStore.get(documentId);
  if (!doc || doc.deletedAt) return null;

  const targetVersion = version
    ? doc.versions.find((v) => v.version === version)
    : doc.versions.find((v) => v.version === doc.currentVersion);

  if (!targetVersion) return null;

  return getAccessUrl(targetVersion.storageKey);
}

export async function deleteDocument(documentId: string, _userId: string): Promise<boolean> {
  const doc = documentStore.get(documentId);
  if (!doc || doc.deletedAt) return false;

  doc.deletedAt = new Date();
  doc.updatedAt = new Date();
  return true;
}

export async function updateDocumentMetadata(
  documentId: string,
  updates: Partial<{ title: string; description: string; tags: string[]; category: string }>
): Promise<DocumentMetadata | null> {
  const doc = documentStore.get(documentId);
  if (!doc || doc.deletedAt) return null;

  if (updates.title !== undefined) doc.title = updates.title;
  if (updates.description !== undefined) doc.description = updates.description;
  if (updates.tags !== undefined) doc.tags = updates.tags;
  if (updates.category !== undefined) doc.category = updates.category;
  doc.updatedAt = new Date();

  return doc;
}
