import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';

import { getAccessUrl } from './uploads';

// P-36 (ESC-2, migration window 01) — the metadata was a Map.
//
//   const documentStore = new Map<string, DocumentMetadata>();   // :34
//
// `POST /api/uploads` did two things: it put the bytes in S3, durably, and it
// put everything needed to FIND those bytes — the storage key, the owning
// entity, the checksum, the mime type — in that Map. Then it returned the
// `documentId` to the caller. After a restart the object was orphaned in the
// bucket with no row pointing at it, and the id the user had been handed 404'd
// forever. The blob outliving its own metadata is the worst version of this
// failure, because nothing errors and nothing is recoverable by hand.
//
// Worth recording because it misled a previous package: the route carries a
// P-23 comment saying an authenticated user "could write a `Document` row …
// into any tenant's entity". The tenancy fix is real and correct. The belief
// that `createDocument` wrote a `Document` row was not — it wrote to a Map.
// It now writes a `StoredDocument` row, and `entityId` is a real foreign key,
// so an upload aimed at an entity that does not exist is refused by Postgres
// as well as by `withEntityScope`.
//
// WHY NOT `Document`: it has `title`, `entityId`, `type`, `version`,
// `templateId`, `citations`, `content`, `status`, `deletedAt` — and no column
// for `mimeType`, `category`, `tags`, `createdBy`, `storageKey`, `sizeBytes` or
// `checksum`, and no generic `metadata Json`. Its only Json column is
// `citations`, which means something else. `Document.version` is a counter and
// `Document` stores only current content, which is the same wall
// modules/documents/services/versioning-service.ts hit; `StoredDocumentVersion`
// is the revision history both needed.

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

// --- Row mapping ---

/** The shape read back from `prisma.storedDocument` with `versions` included. */
interface StoredDocumentRow {
  id: string;
  entityId: string;
  title: string;
  description: string | null;
  mimeType: string;
  category: string;
  tags: string[];
  currentVersion: number;
  createdBy: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  versions: StoredDocumentVersionRow[];
}

interface StoredDocumentVersionRow {
  version: number;
  storageKey: string;
  sizeBytes: number;
  checksum: string;
  uploadedBy: string;
  uploadedAt: Date;
  changelog: string | null;
}

function versionToMetadata(row: StoredDocumentVersionRow): DocumentVersion {
  const version: DocumentVersion = {
    version: row.version,
    storageKey: row.storageKey,
    sizeBytes: row.sizeBytes,
    checksum: row.checksum,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt,
  };
  if (row.changelog !== null) version.changelog = row.changelog;
  return version;
}

function rowToMetadata(row: StoredDocumentRow): DocumentMetadata {
  const doc: DocumentMetadata = {
    id: row.id,
    entityId: row.entityId,
    title: row.title,
    mimeType: row.mimeType,
    category: row.category,
    tags: row.tags,
    currentVersion: row.currentVersion,
    versions: [...row.versions]
      .sort((a, b) => a.version - b.version)
      .map(versionToMetadata),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.description !== null) doc.description = row.description;
  if (row.deletedAt !== null) doc.deletedAt = row.deletedAt;
  return doc;
}

/** Include clause used everywhere a full `DocumentMetadata` is returned. */
const WITH_VERSIONS = { versions: { orderBy: { version: 'asc' as const } } };

/** Exposed for testing: removes every stored document (and, by cascade, its
 *  versions). A restart does NOT do this, and that difference is the point. */
export async function _resetStore(): Promise<void> {
  await prisma.storedDocument.deleteMany();
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
  const row = await prisma.storedDocument.create({
    data: {
      entityId: params.entityId,
      title: params.title,
      description: params.description ?? null,
      mimeType: params.file.mimeType,
      category: params.category,
      tags: params.tags ?? [],
      currentVersion: 1,
      createdBy: params.userId,
      versions: {
        create: [
          {
            version: 1,
            storageKey: params.file.key,
            sizeBytes: params.file.sizeBytes,
            checksum: params.file.checksum,
            uploadedBy: params.userId,
          },
        ],
      },
    },
    include: WITH_VERSIONS,
  });

  return rowToMetadata(row as StoredDocumentRow);
}

/**
 * Add a revision.
 *
 * `@@unique([documentId, version])` is load-bearing here rather than decorative:
 * two concurrent uploads against one document both compute
 * `currentVersion + 1`, and without the constraint both would insert version 3
 * and one storage key would become unreachable. With it, the second insert is
 * rejected by Postgres and the caller sees an error instead of silent loss.
 */
export async function addDocumentVersion(params: {
  documentId: string;
  file: { key: string; sizeBytes: number; checksum: string };
  userId: string;
  changelog?: string;
}): Promise<DocumentVersion> {
  const doc = await prisma.storedDocument.findUnique({
    where: { id: params.documentId },
    select: { id: true, currentVersion: true, deletedAt: true },
  });
  if (!doc) {
    throw new Error(`DOCUMENT_NOT_FOUND: No document with id '${params.documentId}'`);
  }
  if (doc.deletedAt) {
    throw new Error(`DOCUMENT_DELETED: Document '${params.documentId}' has been deleted`);
  }

  const nextVersion = doc.currentVersion + 1;

  const created = await prisma.storedDocumentVersion.create({
    data: {
      documentId: params.documentId,
      version: nextVersion,
      storageKey: params.file.key,
      sizeBytes: params.file.sizeBytes,
      checksum: params.file.checksum,
      uploadedBy: params.userId,
      changelog: params.changelog ?? null,
    },
  });

  await prisma.storedDocument.update({
    where: { id: params.documentId },
    data: { currentVersion: nextVersion },
  });

  return versionToMetadata(created as StoredDocumentVersionRow);
}

export async function getDocument(documentId: string): Promise<DocumentMetadata | null> {
  const row = await prisma.storedDocument.findFirst({
    where: { id: documentId, deletedAt: null },
    include: WITH_VERSIONS,
  });
  return row ? rowToMetadata(row as StoredDocumentRow) : null;
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

  const where: Prisma.StoredDocumentWhereInput = { entityId, deletedAt: null };
  if (category) where.category = category;
  if (tags && tags.length > 0) where.tags = { hasSome: tags };
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.storedDocument.findMany({
      where,
      include: WITH_VERSIONS,
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.storedDocument.count({ where }),
  ]);

  return { documents: rows.map((row) => rowToMetadata(row as StoredDocumentRow)), total };
}

export async function getDocumentDownloadUrl(
  documentId: string,
  version?: number
): Promise<string | null> {
  const doc = await getDocument(documentId);
  if (!doc) return null;

  const targetVersion = version
    ? doc.versions.find((v) => v.version === version)
    : doc.versions.find((v) => v.version === doc.currentVersion);

  if (!targetVersion) return null;

  return getAccessUrl(targetVersion.storageKey);
}

export async function deleteDocument(documentId: string, _userId: string): Promise<boolean> {
  // A conditional update, not a read-then-write: two concurrent deletes cannot
  // both report success.
  const deleted = await prisma.storedDocument.updateMany({
    where: { id: documentId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return deleted.count === 1;
}

export async function updateDocumentMetadata(
  documentId: string,
  updates: Partial<{ title: string; description: string; tags: string[]; category: string }>
): Promise<DocumentMetadata | null> {
  const existing = await prisma.storedDocument.findFirst({
    where: { id: documentId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Prisma.StoredDocumentUpdateInput = {};
  if (updates.title !== undefined) data.title = updates.title;
  if (updates.description !== undefined) data.description = updates.description;
  if (updates.tags !== undefined) data.tags = updates.tags;
  if (updates.category !== undefined) data.category = updates.category;

  const row = await prisma.storedDocument.update({
    where: { id: documentId },
    data,
    include: WITH_VERSIONS,
  });

  return rowToMetadata(row as StoredDocumentRow);
}
