import {
  createDocument,
  addDocumentVersion,
  getDocument,
  listDocuments,
  deleteDocument,
  updateDocumentMetadata,
  _resetStore,
} from '@/lib/integrations/storage/documents';

// Mock the uploads module (for getAccessUrl)
jest.mock('@/lib/integrations/storage/uploads', () => ({
  getAccessUrl: jest.fn().mockResolvedValue('https://signed-url.example.com/file'),
}));

// Mock the storage client (transitive dependency)
jest.mock('@/lib/integrations/storage/client', () => ({
  uploadFile: jest.fn(),
  getSignedDownloadUrl: jest.fn(),
  deleteFile: jest.fn(),
}));

describe('Document Storage', () => {
  beforeEach(() => {
    _resetStore();
  });

  const sampleFile = {
    key: 'entity-1/documents/2026/02/uuid-test.pdf',
    sizeBytes: 4096,
    checksum: 'abc123def456',
    mimeType: 'application/pdf',
  };

  describe('createDocument', () => {
    it('should create document with version 1', async () => {
      const doc = await createDocument({
        entityId: 'entity-1',
        title: 'Test Doc',
        category: 'reports',
        file: sampleFile,
        userId: 'user-1',
      });

      expect(doc.currentVersion).toBe(1);
      expect(doc.versions).toHaveLength(1);
      expect(doc.versions[0].version).toBe(1);
    });

    it('should store metadata correctly', async () => {
      const doc = await createDocument({
        entityId: 'entity-1',
        title: 'My Document',
        description: 'A test document',
        category: 'contracts',
        tags: ['legal', 'important'],
        file: sampleFile,
        userId: 'user-1',
      });

      expect(doc.title).toBe('My Document');
      expect(doc.description).toBe('A test document');
      expect(doc.category).toBe('contracts');
      expect(doc.tags).toEqual(['legal', 'important']);
      expect(doc.entityId).toBe('entity-1');
      expect(doc.createdBy).toBe('user-1');
      expect(doc.mimeType).toBe('application/pdf');
    });
  });

  describe('addDocumentVersion', () => {
    it('should increment version number', async () => {
      const doc = await createDocument({
        entityId: 'entity-1',
        title: 'Versioned Doc',
        category: 'reports',
        file: sampleFile,
        userId: 'user-1',
      });

      const newVersion = await addDocumentVersion({
        documentId: doc.id,
        file: { key: 'new-key', sizeBytes: 8192, checksum: 'new-hash' },
        userId: 'user-2',
        changelog: 'Updated content',
      });

      expect(newVersion.version).toBe(2);
    });

    it('should preserve previous versions', async () => {
      const doc = await createDocument({
        entityId: 'entity-1',
        title: 'Versioned Doc',
        category: 'reports',
        file: sampleFile,
        userId: 'user-1',
      });

      await addDocumentVersion({
        documentId: doc.id,
        file: { key: 'v2-key', sizeBytes: 8192, checksum: 'v2-hash' },
        userId: 'user-2',
      });

      const updated = await getDocument(doc.id);
      expect(updated!.versions).toHaveLength(2);
      expect(updated!.versions[0].version).toBe(1);
      expect(updated!.versions[1].version).toBe(2);
    });

    it('should update currentVersion', async () => {
      const doc = await createDocument({
        entityId: 'entity-1',
        title: 'Test',
        category: 'reports',
        file: sampleFile,
        userId: 'user-1',
      });

      await addDocumentVersion({
        documentId: doc.id,
        file: { key: 'v2', sizeBytes: 100, checksum: 'h2' },
        userId: 'user-1',
      });

      await addDocumentVersion({
        documentId: doc.id,
        file: { key: 'v3', sizeBytes: 200, checksum: 'h3' },
        userId: 'user-1',
      });

      const updated = await getDocument(doc.id);
      expect(updated!.currentVersion).toBe(3);
    });
  });

  describe('getDocument', () => {
    it('should return document with version history', async () => {
      const doc = await createDocument({
        entityId: 'entity-1',
        title: 'Test',
        category: 'reports',
        file: sampleFile,
        userId: 'user-1',
      });

      const result = await getDocument(doc.id);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(doc.id);
      expect(result!.versions).toHaveLength(1);
    });

    it('should return null for non-existent document', async () => {
      const result = await getDocument('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('listDocuments', () => {
    beforeEach(async () => {
      await createDocument({
        entityId: 'entity-1',
        title: 'Report A',
        category: 'reports',
        tags: ['finance'],
        file: sampleFile,
        userId: 'user-1',
      });
      await createDocument({
        entityId: 'entity-1',
        title: 'Contract B',
        category: 'contracts',
        tags: ['legal'],
        file: sampleFile,
        userId: 'user-1',
      });
      await createDocument({
        entityId: 'entity-1',
        title: 'Report C',
        category: 'reports',
        tags: ['finance', 'quarterly'],
        file: sampleFile,
        userId: 'user-1',
      });
      await createDocument({
        entityId: 'entity-2',
        title: 'Other Entity Doc',
        category: 'reports',
        file: sampleFile,
        userId: 'user-2',
      });
    });

    it('should return paginated results', async () => {
      const result = await listDocuments({ entityId: 'entity-1', page: 1, pageSize: 2 });
      expect(result.documents).toHaveLength(2);
      expect(result.total).toBe(3);
    });

    it('should filter by category', async () => {
      const result = await listDocuments({ entityId: 'entity-1', category: 'reports' });
      expect(result.documents).toHaveLength(2);
      expect(result.documents.every((d) => d.category === 'reports')).toBe(true);
    });

    it('should filter by tags', async () => {
      const result = await listDocuments({ entityId: 'entity-1', tags: ['legal'] });
      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].title).toBe('Contract B');
    });
  });

  describe('deleteDocument', () => {
    it('should soft-delete (not remove files)', async () => {
      const doc = await createDocument({
        entityId: 'entity-1',
        title: 'To Delete',
        category: 'reports',
        file: sampleFile,
        userId: 'user-1',
      });

      const result = await deleteDocument(doc.id, 'user-1');
      expect(result).toBe(true);

      // Should not appear in getDocument
      const fetched = await getDocument(doc.id);
      expect(fetched).toBeNull();

      // Should not appear in listings
      const list = await listDocuments({ entityId: 'entity-1' });
      expect(list.documents).toHaveLength(0);
    });

    it('should return false for non-existent document', async () => {
      const result = await deleteDocument('non-existent', 'user-1');
      expect(result).toBe(false);
    });
  });

  describe('updateDocumentMetadata', () => {
    it('should update title and description', async () => {
      const doc = await createDocument({
        entityId: 'entity-1',
        title: 'Original',
        category: 'reports',
        file: sampleFile,
        userId: 'user-1',
      });

      const updated = await updateDocumentMetadata(doc.id, {
        title: 'Updated Title',
        description: 'New description',
      });

      expect(updated!.title).toBe('Updated Title');
      expect(updated!.description).toBe('New description');
    });

    it('should return null for non-existent document', async () => {
      const result = await updateDocumentMetadata('nope', { title: 'X' });
      expect(result).toBeNull();
    });
  });
});
