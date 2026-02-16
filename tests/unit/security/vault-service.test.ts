// ============================================================================
// VaultService — Unit Tests
// ============================================================================

import { VaultService } from '@/modules/security/services/vault-service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORE_DEFAULTS = {
  entityId: 'entity-1',
  category: 'PASSWORD' as const,
  label: 'My Secret',
  value: 'super-secret-password',
  createdBy: 'user-1',
};

// ---------------------------------------------------------------------------
// storeInVault
// ---------------------------------------------------------------------------

describe('VaultService — storeInVault', () => {
  const vault = new VaultService();

  it('encrypts value with AES-256-GCM (store then retrieve returns same value)', async () => {
    const stored = await vault.storeInVault({ ...STORE_DEFAULTS });
    const { value } = await vault.retrieveFromVault(stored.id, 'user-1', 'test');

    expect(value).toBe(STORE_DEFAULTS.value);
  });

  it('returns entry without encrypted value (encryptedValue, iv, authTag are absent)', async () => {
    const stored = await vault.storeInVault({ ...STORE_DEFAULTS });

    expect(stored).not.toHaveProperty('encryptedValue');
    expect(stored).not.toHaveProperty('iv');
    expect(stored).not.toHaveProperty('authTag');

    // Verify other metadata IS present
    expect(stored).toHaveProperty('id');
    expect(stored).toHaveProperty('entityId', STORE_DEFAULTS.entityId);
    expect(stored).toHaveProperty('label', STORE_DEFAULTS.label);
    expect(stored).toHaveProperty('category', STORE_DEFAULTS.category);
  });

  it('generates unique IV for each entry', async () => {
    const stored1 = await vault.storeInVault({
      ...STORE_DEFAULTS,
      label: 'Secret A',
      value: 'value-a',
    });
    const stored2 = await vault.storeInVault({
      ...STORE_DEFAULTS,
      label: 'Secret B',
      value: 'value-b',
    });

    // Retrieve both entries to get their full VaultEntry (which includes iv)
    const { entry: entry1 } = await vault.retrieveFromVault(stored1.id, 'user-1', 'test');
    const { entry: entry2 } = await vault.retrieveFromVault(stored2.id, 'user-1', 'test');

    expect(entry1.iv).not.toBe(entry2.iv);
  });
});

// ---------------------------------------------------------------------------
// retrieveFromVault
// ---------------------------------------------------------------------------

describe('VaultService — retrieveFromVault', () => {
  const vault = new VaultService();

  it('decrypts and returns original value', async () => {
    const stored = await vault.storeInVault({
      ...STORE_DEFAULTS,
      value: 'my-api-key-12345',
    });

    const { value } = await vault.retrieveFromVault(stored.id, 'user-1', 'routine check');
    expect(value).toBe('my-api-key-12345');
  });

  it('logs access with userId and reason', async () => {
    const stored = await vault.storeInVault({ ...STORE_DEFAULTS });

    const { entry } = await vault.retrieveFromVault(stored.id, 'auditor-99', 'compliance audit');

    expect(entry.accessLog).toHaveLength(1);
    expect(entry.accessLog[0]).toMatchObject({
      userId: 'auditor-99',
      accessType: 'READ',
      reason: 'compliance audit',
    });
    expect(entry.accessLog[0].timestamp).toBeInstanceOf(Date);
  });

  it('throws for non-existent entry', async () => {
    await expect(
      vault.retrieveFromVault('non-existent-id', 'user-1', 'test'),
    ).rejects.toThrow('Vault entry not found: non-existent-id');
  });

  it('flags re-authentication needed after max accesses (default 5)', async () => {
    const stored = await vault.storeInVault({
      ...STORE_DEFAULTS,
      label: 'reauth-test',
    });

    // First 4 accesses should NOT require re-auth
    for (let i = 0; i < 4; i++) {
      const { reauthRequired } = await vault.retrieveFromVault(
        stored.id,
        'user-1',
        `access ${i + 1}`,
      );
      expect(reauthRequired).toBe(false);
    }

    // 5th access should flag re-auth
    const { reauthRequired } = await vault.retrieveFromVault(
      stored.id,
      'user-1',
      'access 5',
    );
    expect(reauthRequired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// listVaultEntries
// ---------------------------------------------------------------------------

describe('VaultService — listVaultEntries', () => {
  const vault = new VaultService();

  it('returns entries without encrypted values', async () => {
    await vault.storeInVault({ ...STORE_DEFAULTS, entityId: 'list-entity' });
    await vault.storeInVault({
      ...STORE_DEFAULTS,
      entityId: 'list-entity',
      label: 'Another',
      category: 'API_KEY',
    });

    const entries = await vault.listVaultEntries('list-entity');

    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry).not.toHaveProperty('encryptedValue');
      expect(entry).not.toHaveProperty('iv');
      expect(entry).not.toHaveProperty('authTag');
    }
  });

  it('filters by category', async () => {
    await vault.storeInVault({
      ...STORE_DEFAULTS,
      entityId: 'filter-entity',
      category: 'PASSWORD',
      label: 'pw-1',
    });
    await vault.storeInVault({
      ...STORE_DEFAULTS,
      entityId: 'filter-entity',
      category: 'FINANCIAL',
      label: 'fin-1',
    });
    await vault.storeInVault({
      ...STORE_DEFAULTS,
      entityId: 'filter-entity',
      category: 'PASSWORD',
      label: 'pw-2',
    });

    const passwords = await vault.listVaultEntries('filter-entity', 'PASSWORD');
    const financial = await vault.listVaultEntries('filter-entity', 'FINANCIAL');

    expect(passwords).toHaveLength(2);
    expect(financial).toHaveLength(1);
    expect(passwords.every((e) => e.category === 'PASSWORD')).toBe(true);
    expect(financial[0].category).toBe('FINANCIAL');
  });
});

// ---------------------------------------------------------------------------
// deleteVaultEntry
// ---------------------------------------------------------------------------

describe('VaultService — deleteVaultEntry', () => {
  const vault = new VaultService();

  it('removes entry and subsequent retrieval throws', async () => {
    const stored = await vault.storeInVault({
      ...STORE_DEFAULTS,
      label: 'to-delete',
    });

    await vault.deleteVaultEntry(stored.id, 'admin-1', 'no longer needed');

    await expect(
      vault.retrieveFromVault(stored.id, 'user-1', 'test'),
    ).rejects.toThrow(`Vault entry not found: ${stored.id}`);
  });

  it('logs deletion via console.log', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const stored = await vault.storeInVault({
      ...STORE_DEFAULTS,
      label: 'audit-delete',
    });

    await vault.deleteVaultEntry(stored.id, 'admin-2', 'expired secret');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Entry ${stored.id}`),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('admin-2'),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('expired secret'),
    );

    consoleSpy.mockRestore();
  });
});
