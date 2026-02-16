import { createVersion, getVersions, getVersion, generateRedline, versionStore } from '@/modules/documents/services/versioning-service';

beforeEach(() => {
  versionStore.clear();
});

describe('createVersion', () => {
  it('should increment version number', async () => {
    const v1 = await createVersion('doc-1', 'Hello world', 'user-1', 'Initial');
    const v2 = await createVersion('doc-1', 'Hello updated', 'user-1', 'Update');
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
  });

  it('should store content snapshot', async () => {
    const v1 = await createVersion('doc-1', 'Original content', 'user-1', 'Initial');
    expect(v1.content).toBe('Original content');
  });

  it('should record change description', async () => {
    const v1 = await createVersion('doc-1', 'Content', 'user-1', 'First version');
    expect(v1.changeDescription).toBe('First version');
    expect(v1.changedBy).toBe('user-1');
  });
});

describe('generateRedline', () => {
  it('should detect additions', async () => {
    await createVersion('doc-1', 'Hello', 'user-1', 'v1');
    await createVersion('doc-1', 'Hello world', 'user-1', 'v2');

    const redline = await generateRedline('doc-1', 1, 2);
    const additions = redline.changes.filter((c) => c.type === 'ADDITION');
    expect(additions.length).toBeGreaterThan(0);
  });

  it('should detect deletions', async () => {
    await createVersion('doc-1', 'Hello world goodbye', 'user-1', 'v1');
    await createVersion('doc-1', 'Hello world', 'user-1', 'v2');

    const redline = await generateRedline('doc-1', 1, 2);
    const deletions = redline.changes.filter((c) => c.type === 'DELETION');
    expect(deletions.length).toBeGreaterThan(0);
  });

  it('should detect modifications', async () => {
    await createVersion('doc-1', 'Hello world', 'user-1', 'v1');
    await createVersion('doc-1', 'Greetings world', 'user-1', 'v2');

    const redline = await generateRedline('doc-1', 1, 2);
    const modifications = redline.changes.filter((c) => c.type === 'MODIFICATION');
    expect(modifications.length).toBeGreaterThan(0);
  });

  it('should handle identical versions (no changes)', async () => {
    await createVersion('doc-1', 'Same content', 'user-1', 'v1');
    await createVersion('doc-1', 'Same content', 'user-1', 'v2');

    const redline = await generateRedline('doc-1', 1, 2);
    expect(redline.changes.length).toBe(0);
  });

  it('should return correct position offsets', async () => {
    await createVersion('doc-1', 'alpha beta', 'user-1', 'v1');
    await createVersion('doc-1', 'alpha gamma', 'user-1', 'v2');

    const redline = await generateRedline('doc-1', 1, 2);
    for (const change of redline.changes) {
      expect(change.position.start).toBeDefined();
      expect(change.position.end).toBeDefined();
      expect(change.position.end).toBeGreaterThanOrEqual(change.position.start);
    }
  });
});
