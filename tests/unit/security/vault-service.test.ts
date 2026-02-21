// ============================================================================
// VaultService — Unit Tests (Prisma-backed)
// ============================================================================

const mockPrisma = {
  vaultEntry: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  vaultSecret: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  vaultKey: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

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

/**
 * Helper: configure upsert to capture what was written and also set up
 * findUnique to return the stored row (simulating DB round-trip).
 */
function setupVaultEntryRoundTrip() {
  // Track upserted rows by id
  const storedRows = new Map<string, Record<string, unknown>>();

  (mockPrisma.vaultEntry.upsert as jest.Mock).mockImplementation(
    async (args: { create: Record<string, unknown> }) => {
      const row = {
        id: args.create.id,
        userId: args.create.userId,
        label: args.create.label,
        encryptedData: args.create.encryptedData,
        iv: args.create.iv,
        tag: args.create.tag,
        algorithm: args.create.algorithm,
        keyVersion: args.create.keyVersion,
        createdAt: args.create.createdAt,
        updatedAt: args.create.updatedAt,
      };
      storedRows.set(row.id as string, row);
      return row;
    },
  );

  (mockPrisma.vaultEntry.findUnique as jest.Mock).mockImplementation(
    async (args: { where: { id?: string; userId_label?: { userId: string; label: string } } }) => {
      if (args.where.id) {
        return storedRows.get(args.where.id) ?? null;
      }
      return null;
    },
  );

  (mockPrisma.vaultEntry.update as jest.Mock).mockImplementation(
    async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      const existing = storedRows.get(args.where.id);
      if (existing) {
        Object.assign(existing, args.data);
      }
      return existing ?? null;
    },
  );

  (mockPrisma.vaultEntry.delete as jest.Mock).mockImplementation(
    async (args: { where: { id: string } }) => {
      const existing = storedRows.get(args.where.id);
      storedRows.delete(args.where.id);
      return existing ?? null;
    },
  );

  (mockPrisma.vaultEntry.findMany as jest.Mock).mockImplementation(
    async () => Array.from(storedRows.values()),
  );

  return storedRows;
}

// ---------------------------------------------------------------------------
// storeInVault
// ---------------------------------------------------------------------------

describe('VaultService — storeInVault', () => {
  let vault: VaultService;

  beforeEach(() => {
    jest.clearAllMocks();
    setupVaultEntryRoundTrip();
    vault = new VaultService();
  });

  it('encrypts value with AES-256-GCM (store then retrieve returns same value)', async () => {
    const stored = await vault.storeInVault({ ...STORE_DEFAULTS });
    const { value } = await vault.retrieveFromVault(stored.id, 'user-1', 'test');

    expect(value).toBe(STORE_DEFAULTS.value);
  });

  it('calls prisma.vaultEntry.upsert on store', async () => {
    await vault.storeInVault({ ...STORE_DEFAULTS });

    expect(mockPrisma.vaultEntry.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.vaultEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_label: { userId: 'entity-1', label: 'My Secret' } },
        create: expect.objectContaining({
          userId: 'entity-1',
          label: 'My Secret',
        }),
      }),
    );
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
  let vault: VaultService;

  beforeEach(() => {
    jest.clearAllMocks();
    setupVaultEntryRoundTrip();
    vault = new VaultService();
  });

  it('decrypts and returns original value', async () => {
    const stored = await vault.storeInVault({
      ...STORE_DEFAULTS,
      value: 'my-api-key-12345',
    });

    const { value } = await vault.retrieveFromVault(stored.id, 'user-1', 'routine check');
    expect(value).toBe('my-api-key-12345');
  });

  it('calls prisma.vaultEntry.findUnique on retrieve', async () => {
    const stored = await vault.storeInVault({ ...STORE_DEFAULTS });
    await vault.retrieveFromVault(stored.id, 'user-1', 'test');

    expect(mockPrisma.vaultEntry.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: stored.id },
      }),
    );
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
    (mockPrisma.vaultEntry.findUnique as jest.Mock).mockResolvedValueOnce(null);

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
  let vault: VaultService;

  beforeEach(() => {
    jest.clearAllMocks();
    setupVaultEntryRoundTrip();
    vault = new VaultService();
  });

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
  let vault: VaultService;

  beforeEach(() => {
    jest.clearAllMocks();
    setupVaultEntryRoundTrip();
    vault = new VaultService();
  });

  it('removes entry via prisma and subsequent retrieval throws', async () => {
    const stored = await vault.storeInVault({
      ...STORE_DEFAULTS,
      label: 'to-delete',
    });

    await vault.deleteVaultEntry(stored.id, 'admin-1', 'no longer needed');

    // findUnique should return null after deletion
    await expect(
      vault.retrieveFromVault(stored.id, 'user-1', 'test'),
    ).rejects.toThrow(`Vault entry not found: ${stored.id}`);
  });

  it('calls prisma.vaultEntry.delete', async () => {
    const stored = await vault.storeInVault({
      ...STORE_DEFAULTS,
      label: 'to-delete-2',
    });

    await vault.deleteVaultEntry(stored.id, 'admin-1', 'cleanup');

    expect(mockPrisma.vaultEntry.delete).toHaveBeenCalledWith({
      where: { id: stored.id },
    });
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

// ---------------------------------------------------------------------------
// Named Secrets (storeSecret, retrieveSecret, listSecrets, deleteSecret)
// ---------------------------------------------------------------------------

describe('VaultService — Named Secrets (Prisma-backed)', () => {
  let vault: VaultService;

  // Track stored secrets by composite key
  const storedSecrets = new Map<string, Record<string, unknown>>();

  beforeEach(() => {
    jest.clearAllMocks();
    storedSecrets.clear();
    setupVaultEntryRoundTrip();

    (mockPrisma.vaultSecret.findUnique as jest.Mock).mockImplementation(
      async (args: { where: { userId_name?: { userId: string; name: string }; id?: string } }) => {
        if (args.where.userId_name) {
          const key = `${args.where.userId_name.userId}:${args.where.userId_name.name}`;
          return storedSecrets.get(key) ?? null;
        }
        return null;
      },
    );

    (mockPrisma.vaultSecret.upsert as jest.Mock).mockImplementation(
      async (args: { where: { userId_name: { userId: string; name: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const key = `${args.where.userId_name.userId}:${args.where.userId_name.name}`;
        const existing = storedSecrets.get(key);
        if (existing) {
          Object.assign(existing, args.update);
          return existing;
        }
        const row = { ...args.create };
        storedSecrets.set(key, row);
        return row;
      },
    );

    (mockPrisma.vaultSecret.findMany as jest.Mock).mockImplementation(
      async (args?: { where?: { userId?: string }; orderBy?: Record<string, string> }) => {
        const rows = Array.from(storedSecrets.values());
        if (args?.where?.userId) {
          return rows
            .filter((r) => r.userId === args.where!.userId)
            .sort((a, b) => String(a.name).localeCompare(String(b.name)));
        }
        return rows;
      },
    );

    (mockPrisma.vaultSecret.delete as jest.Mock).mockImplementation(
      async (args: { where: { userId_name: { userId: string; name: string } } }) => {
        const key = `${args.where.userId_name.userId}:${args.where.userId_name.name}`;
        const existing = storedSecrets.get(key);
        storedSecrets.delete(key);
        return existing ?? null;
      },
    );

    // Mock vaultKey operations for key management
    (mockPrisma.vaultKey.upsert as jest.Mock).mockResolvedValue({});

    vault = new VaultService();
  });

  it('stores and retrieves a secret via Prisma', async () => {
    const result = await vault.storeSecret('API_KEY', 'sk-test-123', 'entity-1');

    expect(result.name).toBe('API_KEY');
    expect(result.entityId).toBe('entity-1');
    expect(mockPrisma.vaultSecret.upsert).toHaveBeenCalledTimes(1);

    const retrieved = await vault.retrieveSecret('API_KEY', 'entity-1');
    expect(retrieved).toBe('sk-test-123');
  });

  it('overwrites existing secret with same name', async () => {
    await vault.storeSecret('DB_PASS', 'old-pass', 'entity-1');
    await vault.storeSecret('DB_PASS', 'new-pass', 'entity-1');

    const retrieved = await vault.retrieveSecret('DB_PASS', 'entity-1');
    expect(retrieved).toBe('new-pass');
  });

  it('throws when retrieving non-existent secret', async () => {
    await expect(
      vault.retrieveSecret('MISSING', 'entity-1'),
    ).rejects.toThrow('Secret not found: name="MISSING", entityId="entity-1"');
  });

  it('lists secrets without exposing values', async () => {
    await vault.storeSecret('SECRET_A', 'val-a', 'entity-2');
    await vault.storeSecret('SECRET_B', 'val-b', 'entity-2');

    const list = await vault.listSecrets('entity-2');

    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('SECRET_A');
    expect(list[1].name).toBe('SECRET_B');

    // Values should not be exposed
    for (const item of list) {
      expect(item).not.toHaveProperty('encryptedValue');
      expect(item).not.toHaveProperty('iv');
      expect(item).not.toHaveProperty('authTag');
    }
  });

  it('deletes a secret via Prisma', async () => {
    await vault.storeSecret('TO_DELETE', 'temp-value', 'entity-1');

    await vault.deleteSecret('TO_DELETE', 'entity-1');

    expect(mockPrisma.vaultSecret.delete).toHaveBeenCalledWith({
      where: { userId_name: { userId: 'entity-1', name: 'TO_DELETE' } },
    });

    // Subsequent retrieval should fail
    await expect(
      vault.retrieveSecret('TO_DELETE', 'entity-1'),
    ).rejects.toThrow('Secret not found');
  });

  it('throws when deleting non-existent secret', async () => {
    await expect(
      vault.deleteSecret('NONEXISTENT', 'entity-1'),
    ).rejects.toThrow('Secret not found: name="NONEXISTENT", entityId="entity-1"');
  });
});

// ---------------------------------------------------------------------------
// Master Key Validation
// ---------------------------------------------------------------------------

describe('VaultService — Master Key Validation', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalKey = process.env.VAULT_MASTER_KEY;

  afterEach(() => {
    (process.env as any).NODE_ENV = originalEnv;
    if (originalKey !== undefined) {
      process.env.VAULT_MASTER_KEY = originalKey;
    } else {
      delete process.env.VAULT_MASTER_KEY;
    }
  });

  it('throws in production if VAULT_MASTER_KEY is not set', () => {
    delete process.env.VAULT_MASTER_KEY;
    (process.env as any).NODE_ENV = 'production';

    expect(() => new VaultService()).toThrow(
      'VAULT_MASTER_KEY environment variable is required in production',
    );
  });

  it('allows construction in development without VAULT_MASTER_KEY (with warning)', () => {
    delete process.env.VAULT_MASTER_KEY;
    (process.env as any).NODE_ENV = 'development';

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const service = new VaultService();
    expect(service).toBeDefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('VAULT_MASTER_KEY not set'),
    );

    warnSpy.mockRestore();
  });

  it('allows construction in test without VAULT_MASTER_KEY', () => {
    delete process.env.VAULT_MASTER_KEY;
    (process.env as any).NODE_ENV = 'test';

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const service = new VaultService();
    expect(service).toBeDefined();
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Key Management (createKey)
// ---------------------------------------------------------------------------

describe('VaultService — Key Management', () => {
  let vault: VaultService;

  beforeEach(() => {
    jest.clearAllMocks();
    setupVaultEntryRoundTrip();
    (mockPrisma.vaultKey.upsert as jest.Mock).mockResolvedValue({});
    vault = new VaultService();
  });

  it('creates a new managed key and persists metadata via Prisma', async () => {
    const keyId = await vault.createKey('custom-key-1');

    expect(keyId).toBe('custom-key-1');
    expect(mockPrisma.vaultKey.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { keyId: 'custom-key-1' },
        create: expect.objectContaining({
          keyId: 'custom-key-1',
          status: 'ACTIVE',
        }),
      }),
    );
  });

  it('throws when creating a key with duplicate ID', async () => {
    await vault.createKey('dup-key');

    await expect(vault.createKey('dup-key')).rejects.toThrow(
      'Key already exists: dup-key',
    );
  });

  it('encrypts and decrypts with a custom key', async () => {
    const keyId = await vault.createKey('my-key');

    const { ciphertext, iv, authTag } = await vault.encrypt('hello world', keyId);
    const decrypted = await vault.decrypt(ciphertext, keyId, iv, authTag);

    expect(decrypted).toBe('hello world');
  });
});
