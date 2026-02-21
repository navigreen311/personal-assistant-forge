import {
  createVersion,
  getVersions,
  getVersion,
  generateRedline,
  rollbackToVersion,
  versionStore,
} from '@/modules/documents/services/versioning-service';

describe('versioning-service', () => {
  beforeEach(() => {
    versionStore.clear();
  });

  describe('createVersion', () => {
    it('creates a first version with version number 1', async () => {
      const version = await createVersion('doc-1', 'Hello world', 'user-1', 'Initial draft');

      expect(version.id).toBeDefined();
      expect(version.documentId).toBe('doc-1');
      expect(version.version).toBe(1);
      expect(version.content).toBe('Hello world');
      expect(version.changedBy).toBe('user-1');
      expect(version.changeDescription).toBe('Initial draft');
      expect(version.createdAt).toBeInstanceOf(Date);
    });

    it('increments version number for subsequent versions of the same document', async () => {
      await createVersion('doc-1', 'v1 content', 'user-1', 'First');
      await createVersion('doc-1', 'v2 content', 'user-1', 'Second');
      const v3 = await createVersion('doc-1', 'v3 content', 'user-1', 'Third');

      expect(v3.version).toBe(3);
    });

    it('maintains independent version numbering per document', async () => {
      await createVersion('doc-1', 'doc1 v1', 'user-1', 'First');
      await createVersion('doc-1', 'doc1 v2', 'user-1', 'Second');
      const docBv1 = await createVersion('doc-2', 'doc2 v1', 'user-2', 'First');

      expect(docBv1.version).toBe(1);
    });

    it('stores version in the versionStore', async () => {
      await createVersion('doc-1', 'content', 'user-1', 'desc');

      const stored = versionStore.get('doc-1');
      expect(stored).toBeDefined();
      expect(stored).toHaveLength(1);
      expect(stored![0].content).toBe('content');
    });
  });

  describe('getVersions', () => {
    it('returns all versions for a document sorted by version descending', async () => {
      await createVersion('doc-1', 'v1', 'user-1', 'First');
      await createVersion('doc-1', 'v2', 'user-1', 'Second');
      await createVersion('doc-1', 'v3', 'user-1', 'Third');

      const versions = await getVersions('doc-1');

      expect(versions).toHaveLength(3);
      expect(versions[0].version).toBe(3);
      expect(versions[1].version).toBe(2);
      expect(versions[2].version).toBe(1);
    });

    it('returns empty array for document with no versions', async () => {
      const versions = await getVersions('nonexistent-doc');

      expect(versions).toEqual([]);
    });
  });

  describe('getVersion', () => {
    it('returns the specific version when it exists', async () => {
      await createVersion('doc-1', 'first content', 'user-1', 'First');
      await createVersion('doc-1', 'second content', 'user-1', 'Second');

      const v1 = await getVersion('doc-1', 1);

      expect(v1).not.toBeNull();
      expect(v1!.version).toBe(1);
      expect(v1!.content).toBe('first content');
    });

    it('returns null when the version does not exist', async () => {
      await createVersion('doc-1', 'content', 'user-1', 'First');

      const result = await getVersion('doc-1', 99);

      expect(result).toBeNull();
    });
  });

  describe('generateRedline', () => {
    it('detects modifications between two versions', async () => {
      await createVersion('doc-1', 'hello world', 'user-1', 'First');
      await createVersion('doc-1', 'hello earth', 'user-1', 'Changed world to earth');

      const redline = await generateRedline('doc-1', 1, 2);

      expect(redline.id).toBeDefined();
      expect(redline.documentId).toBe('doc-1');
      expect(redline.version1).toBe(1);
      expect(redline.version2).toBe(2);
      expect(redline.changes).toHaveLength(1);
      expect(redline.changes[0].type).toBe('MODIFICATION');
      expect(redline.changes[0].originalText).toBe('world');
      expect(redline.changes[0].newText).toBe('earth');
    });

    it('detects additions when version 2 has more words', async () => {
      await createVersion('doc-1', 'hello', 'user-1', 'First');
      await createVersion('doc-1', 'hello world', 'user-1', 'Added word');

      const redline = await generateRedline('doc-1', 1, 2);

      const additions = redline.changes.filter((c) => c.type === 'ADDITION');
      expect(additions.length).toBeGreaterThanOrEqual(1);
      expect(additions[0].newText).toBe('world');
    });

    it('detects deletions when version 2 has fewer words', async () => {
      await createVersion('doc-1', 'hello world', 'user-1', 'First');
      await createVersion('doc-1', 'hello', 'user-1', 'Removed word');

      const redline = await generateRedline('doc-1', 1, 2);

      const deletions = redline.changes.filter((c) => c.type === 'DELETION');
      expect(deletions.length).toBeGreaterThanOrEqual(1);
      expect(deletions[0].originalText).toBe('world');
    });

    it('returns no changes when versions are identical', async () => {
      await createVersion('doc-1', 'same content', 'user-1', 'First');
      await createVersion('doc-1', 'same content', 'user-1', 'Copy');

      const redline = await generateRedline('doc-1', 1, 2);

      expect(redline.changes).toHaveLength(0);
    });

    it('throws when one of the versions does not exist', async () => {
      await createVersion('doc-1', 'content', 'user-1', 'First');

      await expect(generateRedline('doc-1', 1, 99)).rejects.toThrow(
        'One or both versions not found'
      );
    });
  });

  describe('rollbackToVersion', () => {
    it('creates a new version with the content of the target version', async () => {
      await createVersion('doc-1', 'original content', 'user-1', 'First');
      await createVersion('doc-1', 'modified content', 'user-1', 'Second');

      await rollbackToVersion('doc-1', 1);

      const versions = await getVersions('doc-1');
      expect(versions).toHaveLength(3);
      // Latest version (v3) should have the original content
      expect(versions[0].version).toBe(3);
      expect(versions[0].content).toBe('original content');
      expect(versions[0].changeDescription).toBe('Rollback to version 1');
    });

    it('returns a Document object with content from the target version', async () => {
      await createVersion('doc-1', 'the original', 'user-1', 'First');
      await createVersion('doc-1', 'the updated', 'user-1', 'Second');

      const doc = await rollbackToVersion('doc-1', 1);

      expect(doc.id).toBe('doc-1');
      expect(doc.content).toBe('the original');
      expect(doc.status).toBe('DRAFT');
      expect(doc.version).toBe(1);
      expect(doc.createdAt).toBeInstanceOf(Date);
      expect(doc.updatedAt).toBeInstanceOf(Date);
    });

    it('throws when the target version does not exist', async () => {
      await createVersion('doc-1', 'content', 'user-1', 'First');

      await expect(rollbackToVersion('doc-1', 42)).rejects.toThrow(
        'Version 42 not found'
      );
    });
  });
});
