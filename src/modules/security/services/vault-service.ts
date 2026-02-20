// ============================================================================
// Vault Service — AES-256-GCM Encrypted Secret Storage
// Worker 15: Security, Privacy & Compliance
//
// Two layers of functionality:
// 1. Vault Entries — encrypted records with categories, metadata, access logs
// 2. Named Secrets — simple key/value secret storage per entity with
//    multi-key support, key rotation, and secure deletion
// ============================================================================

import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import type {
  VaultEntry,
  VaultAccessEntry,
  VaultConfig,
  DataClassification,
} from '@/modules/security/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_LENGTH = 32; // 256 bits
const PBKDF2_DIGEST = 'sha256';
const GCM_IV_LENGTH = 12; // 96 bits — recommended for AES-GCM
const PBKDF2_SALT = Buffer.from('paf-vault-salt-v1');
const AES_ALGORITHM = 'aes-256-gcm';

const DEFAULT_CONFIG: VaultConfig = {
  encryptionAlgorithm: 'aes-256-gcm',
  keyDerivation: 'pbkdf2',
  keyRotationDays: 90,
  maxAccessWithoutReauth: 5,
  allowedCategories: [
    'PASSWORD',
    'FINANCIAL',
    'MEDICAL',
    'LEGAL',
    'PERSONAL',
    'API_KEY',
  ],
};

// ---------------------------------------------------------------------------
// Helpers — Type for stripped vault entry
// ---------------------------------------------------------------------------

type SafeVaultEntry = Omit<VaultEntry, 'encryptedValue' | 'iv' | 'authTag'>;

// ---------------------------------------------------------------------------
// Named Secret Types
// ---------------------------------------------------------------------------

interface StoredSecret {
  id: string;
  name: string;
  entityId: string;
  encryptedValue: string;
  iv: string;
  authTag: string;
  keyId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ManagedKey {
  id: string;
  key: Buffer;
  createdAt: Date;
  rotatedAt?: Date;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// VaultService
// ---------------------------------------------------------------------------

export class VaultService {
  private readonly vault: Map<string, VaultEntry> = new Map();
  private readonly accessCounts: Map<string, number> = new Map();
  private readonly config: VaultConfig;
  private encryptionKey: Buffer;

  /** Named secrets store: composite key "entityId:name" -> StoredSecret */
  private readonly secrets: Map<string, StoredSecret> = new Map();

  /** Managed encryption keys: keyId -> ManagedKey */
  private readonly managedKeys: Map<string, ManagedKey> = new Map();

  /** The default key ID used when no keyId is specified */
  private defaultKeyId: string;

  constructor(config?: Partial<VaultConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    const masterKey =
      process.env.VAULT_MASTER_KEY || 'INSECURE_DEFAULT_KEY_CHANGE_ME';

    if (!process.env.VAULT_MASTER_KEY) {
      console.warn(
        '[VaultService] WARNING: VAULT_MASTER_KEY not set. Using insecure default key.',
      );
    }

    this.encryptionKey = this.deriveKey(masterKey);

    // Initialize a default managed key from the master key
    this.defaultKeyId = 'default';
    this.managedKeys.set(this.defaultKeyId, {
      id: this.defaultKeyId,
      key: this.encryptionKey,
      createdAt: new Date(),
      isActive: true,
    });
  }

  // -------------------------------------------------------------------------
  // Vault Entries — Public API (original interface preserved)
  // -------------------------------------------------------------------------

  /**
   * Encrypt and store a value in the vault.
   * Returns the entry metadata without the encrypted payload.
   */
  async storeInVault(params: {
    entityId: string;
    category: VaultEntry['category'];
    label: string;
    value: string;
    metadata?: Record<string, string>;
    expiresAt?: Date;
    createdBy: string;
  }): Promise<SafeVaultEntry> {
    const { entityId, category, label, value, metadata, expiresAt, createdBy } =
      params;

    const { encrypted, iv, authTag } = this.encryptRaw(value);

    const now = new Date();
    const entry: VaultEntry = {
      id: uuidv4(),
      entityId,
      category,
      label,
      encryptedValue: encrypted,
      iv,
      authTag,
      metadata: metadata ?? {},
      classification: 'RESTRICTED' as DataClassification,
      accessLog: [],
      createdBy,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    };

    this.vault.set(entry.id, entry);
    this.accessCounts.set(entry.id, 0);

    return this.stripSensitiveFields(entry);
  }

  /**
   * Decrypt and retrieve a value from the vault.
   * Logs access and flags re-authentication when the threshold is exceeded.
   */
  async retrieveFromVault(
    entryId: string,
    userId: string,
    reason: string,
  ): Promise<{ value: string; entry: VaultEntry; reauthRequired: boolean }> {
    const entry = this.vault.get(entryId);
    if (!entry) {
      throw new Error(`Vault entry not found: ${entryId}`);
    }

    // Log access
    const accessEntry: VaultAccessEntry = {
      userId,
      accessType: 'READ',
      timestamp: new Date(),
      reason,
    };
    entry.accessLog.push(accessEntry);

    // Track access count for re-auth
    const currentCount = (this.accessCounts.get(entryId) ?? 0) + 1;
    this.accessCounts.set(entryId, currentCount);

    const reauthRequired = currentCount >= this.config.maxAccessWithoutReauth;

    // Reset counter when re-auth is flagged so it triggers again on the next cycle
    if (reauthRequired) {
      this.accessCounts.set(entryId, 0);
    }

    const value = this.decryptRaw(entry.encryptedValue, entry.iv, entry.authTag);

    return { value, entry, reauthRequired };
  }

  /**
   * List vault entries for an entity, optionally filtered by category.
   * Sensitive encryption fields are stripped.
   */
  async listVaultEntries(
    entityId: string,
    category?: VaultEntry['category'],
  ): Promise<SafeVaultEntry[]> {
    const results: SafeVaultEntry[] = [];

    for (const entry of this.vault.values()) {
      if (entry.entityId !== entityId) continue;
      if (category && entry.category !== category) continue;

      results.push(this.stripSensitiveFields(entry));
    }

    return results;
  }

  /**
   * Delete a vault entry and log the deletion.
   */
  async deleteVaultEntry(
    entryId: string,
    userId: string,
    reason: string,
  ): Promise<void> {
    const entry = this.vault.get(entryId);
    if (!entry) {
      throw new Error(`Vault entry not found: ${entryId}`);
    }

    // Audit trail
    console.log(
      `[VaultService] AUDIT: Entry ${entryId} (${entry.label}) deleted by ${userId}. Reason: ${reason}`,
    );

    this.vault.delete(entryId);
    this.accessCounts.delete(entryId);
  }

  /**
   * Return the access history for a vault entry.
   */
  async getVaultAccessLog(entryId: string): Promise<VaultAccessEntry[]> {
    const entry = this.vault.get(entryId);
    if (!entry) {
      throw new Error(`Vault entry not found: ${entryId}`);
    }

    return [...entry.accessLog];
  }

  /**
   * Rotate the encryption key and re-encrypt all vault entries.
   */
  async rotateEncryptionKey(): Promise<{ reEncrypted: number }> {
    // Derive a new key by appending a rotation timestamp to the master secret
    const masterKey =
      process.env.VAULT_MASTER_KEY || 'INSECURE_DEFAULT_KEY_CHANGE_ME';
    const rotationSuffix = `-rotated-${Date.now()}`;
    const newKey = this.deriveKey(masterKey + rotationSuffix);

    const oldKey = this.encryptionKey;
    let reEncrypted = 0;

    for (const entry of this.vault.values()) {
      // Decrypt with the old key
      const plaintext = this.decryptWithKey(
        entry.encryptedValue,
        entry.iv,
        entry.authTag,
        oldKey,
      );

      // Re-encrypt with the new key
      const { encrypted, iv, authTag } = this.encryptWithKey(
        plaintext,
        newKey,
      );

      entry.encryptedValue = encrypted;
      entry.iv = iv;
      entry.authTag = authTag;
      entry.updatedAt = new Date();

      reEncrypted++;
    }

    this.encryptionKey = newKey;

    console.log(
      `[VaultService] Key rotation complete. Re-encrypted ${reEncrypted} entries.`,
    );

    return { reEncrypted };
  }

  // -------------------------------------------------------------------------
  // Encrypt / Decrypt — Public API (multi-key support)
  // -------------------------------------------------------------------------

  /**
   * Encrypt plaintext using AES-256-GCM with a specified key.
   * If no keyId is provided, the default key is used.
   *
   * @param plaintext - The data to encrypt
   * @param keyId - Optional managed key ID (defaults to 'default')
   * @returns Object containing ciphertext, IV, auth tag, and the keyId used
   */
  async encrypt(
    plaintext: string,
    keyId?: string,
  ): Promise<{
    ciphertext: string;
    iv: string;
    authTag: string;
    keyId: string;
  }> {
    const resolvedKeyId = keyId ?? this.defaultKeyId;
    const managedKey = this.managedKeys.get(resolvedKeyId);

    if (!managedKey) {
      throw new Error(`Encryption key not found: ${resolvedKeyId}`);
    }

    if (!managedKey.isActive) {
      throw new Error(`Encryption key is inactive: ${resolvedKeyId}. Use an active key or rotate.`);
    }

    const { encrypted, iv, authTag } = this.encryptWithKey(
      plaintext,
      managedKey.key,
    );

    return {
      ciphertext: encrypted,
      iv,
      authTag,
      keyId: resolvedKeyId,
    };
  }

  /**
   * Decrypt ciphertext using AES-256-GCM with a specified key.
   * If no keyId is provided, the default key is used.
   *
   * @param ciphertext - The encrypted data (hex-encoded)
   * @param keyId - Optional managed key ID (defaults to 'default')
   * @param iv - The initialization vector (hex-encoded)
   * @param authTag - The GCM authentication tag (hex-encoded)
   * @returns The decrypted plaintext
   */
  async decrypt(
    ciphertext: string,
    keyId?: string,
    iv?: string,
    authTag?: string,
  ): Promise<string> {
    const resolvedKeyId = keyId ?? this.defaultKeyId;
    const managedKey = this.managedKeys.get(resolvedKeyId);

    if (!managedKey) {
      throw new Error(`Encryption key not found: ${resolvedKeyId}`);
    }

    if (!iv || !authTag) {
      throw new Error('IV and authTag are required for decryption.');
    }

    return this.decryptWithKey(ciphertext, iv, authTag, managedKey.key);
  }

  // -------------------------------------------------------------------------
  // Key Management — Public API
  // -------------------------------------------------------------------------

  /**
   * Rotate a specific managed key. Generates a new key, re-encrypts all
   * secrets that were encrypted with the old key, and marks the old key
   * as inactive.
   *
   * @param keyId - The key to rotate (defaults to 'default')
   * @returns The number of secrets re-encrypted and the new key ID
   */
  async rotateKey(
    keyId?: string,
  ): Promise<{ newKeyId: string; reEncryptedSecrets: number; reEncryptedVaultEntries: number }> {
    const resolvedKeyId = keyId ?? this.defaultKeyId;
    const oldManagedKey = this.managedKeys.get(resolvedKeyId);

    if (!oldManagedKey) {
      throw new Error(`Encryption key not found: ${resolvedKeyId}`);
    }

    // Generate a new key
    const newKeyId = `${resolvedKeyId}-${Date.now()}`;
    const newKeyBuffer = crypto.randomBytes(PBKDF2_KEY_LENGTH);

    const newManagedKey: ManagedKey = {
      id: newKeyId,
      key: newKeyBuffer,
      createdAt: new Date(),
      isActive: true,
    };

    // Mark old key as rotated (keep it around for decryption of unreferenced data)
    oldManagedKey.rotatedAt = new Date();
    oldManagedKey.isActive = false;

    this.managedKeys.set(newKeyId, newManagedKey);

    // Re-encrypt all secrets that used the old key
    let reEncryptedSecrets = 0;
    for (const secret of this.secrets.values()) {
      if (secret.keyId === resolvedKeyId) {
        // Decrypt with old key
        const plaintext = this.decryptWithKey(
          secret.encryptedValue,
          secret.iv,
          secret.authTag,
          oldManagedKey.key,
        );

        // Re-encrypt with new key
        const { encrypted, iv, authTag } = this.encryptWithKey(
          plaintext,
          newKeyBuffer,
        );

        secret.encryptedValue = encrypted;
        secret.iv = iv;
        secret.authTag = authTag;
        secret.keyId = newKeyId;
        secret.updatedAt = new Date();

        reEncryptedSecrets++;
      }
    }

    // If rotating the default key, also re-encrypt vault entries and update default
    let reEncryptedVaultEntries = 0;
    if (resolvedKeyId === this.defaultKeyId) {
      for (const entry of this.vault.values()) {
        const plaintext = this.decryptWithKey(
          entry.encryptedValue,
          entry.iv,
          entry.authTag,
          oldManagedKey.key,
        );

        const { encrypted, iv, authTag } = this.encryptWithKey(
          plaintext,
          newKeyBuffer,
        );

        entry.encryptedValue = encrypted;
        entry.iv = iv;
        entry.authTag = authTag;
        entry.updatedAt = new Date();

        reEncryptedVaultEntries++;
      }

      this.encryptionKey = newKeyBuffer;
      this.defaultKeyId = newKeyId;
    }

    console.log(
      `[VaultService] Key rotation for "${resolvedKeyId}" complete. New key: "${newKeyId}". ` +
        `Re-encrypted ${reEncryptedSecrets} secrets, ${reEncryptedVaultEntries} vault entries.`,
    );

    return { newKeyId, reEncryptedSecrets, reEncryptedVaultEntries };
  }

  /**
   * Create a new managed encryption key for use with encrypt/decrypt
   * and named secrets.
   *
   * @param keyId - Optional custom key ID (auto-generated if omitted)
   * @returns The new key's ID
   */
  async createKey(keyId?: string): Promise<string> {
    const id = keyId ?? `key-${uuidv4()}`;

    if (this.managedKeys.has(id)) {
      throw new Error(`Key already exists: ${id}`);
    }

    const keyBuffer = crypto.randomBytes(PBKDF2_KEY_LENGTH);

    this.managedKeys.set(id, {
      id,
      key: keyBuffer,
      createdAt: new Date(),
      isActive: true,
    });

    return id;
  }

  // -------------------------------------------------------------------------
  // Named Secrets — Public API
  // -------------------------------------------------------------------------

  /**
   * Store a named secret for an entity. The value is encrypted using
   * AES-256-GCM before storage. If a secret with the same name already
   * exists for this entity, it is overwritten.
   *
   * @param name - The secret name (e.g., 'STRIPE_API_KEY')
   * @param value - The plaintext secret value
   * @param entityId - The owning entity
   * @param keyId - Optional managed key ID (defaults to 'default')
   */
  async storeSecret(
    name: string,
    value: string,
    entityId: string,
    keyId?: string,
  ): Promise<{ id: string; name: string; entityId: string; createdAt: Date }> {
    const resolvedKeyId = keyId ?? this.defaultKeyId;
    const managedKey = this.managedKeys.get(resolvedKeyId);

    if (!managedKey) {
      throw new Error(`Encryption key not found: ${resolvedKeyId}`);
    }

    if (!managedKey.isActive) {
      throw new Error(`Encryption key is inactive: ${resolvedKeyId}`);
    }

    const { encrypted, iv, authTag } = this.encryptWithKey(
      value,
      managedKey.key,
    );

    const compositeKey = this.secretCompositeKey(entityId, name);
    const now = new Date();

    const existing = this.secrets.get(compositeKey);

    const secret: StoredSecret = {
      id: existing?.id ?? uuidv4(),
      name,
      entityId,
      encryptedValue: encrypted,
      iv,
      authTag,
      keyId: resolvedKeyId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.secrets.set(compositeKey, secret);

    return {
      id: secret.id,
      name: secret.name,
      entityId: secret.entityId,
      createdAt: secret.createdAt,
    };
  }

  /**
   * Retrieve and decrypt a named secret for an entity.
   *
   * @param name - The secret name
   * @param entityId - The owning entity
   * @returns The decrypted secret value
   * @throws Error if the secret does not exist or the key is unavailable
   */
  async retrieveSecret(name: string, entityId: string): Promise<string> {
    const compositeKey = this.secretCompositeKey(entityId, name);
    const secret = this.secrets.get(compositeKey);

    if (!secret) {
      throw new Error(
        `Secret not found: name="${name}", entityId="${entityId}"`,
      );
    }

    const managedKey = this.managedKeys.get(secret.keyId);
    if (!managedKey) {
      throw new Error(
        `Encryption key not found for secret "${name}": keyId="${secret.keyId}"`,
      );
    }

    return this.decryptWithKey(
      secret.encryptedValue,
      secret.iv,
      secret.authTag,
      managedKey.key,
    );
  }

  /**
   * List the names of all secrets stored for an entity.
   * Secret values are never returned by this method.
   *
   * @param entityId - The owning entity
   * @returns Array of secret metadata (name, id, timestamps)
   */
  async listSecrets(
    entityId: string,
  ): Promise<
    Array<{
      id: string;
      name: string;
      entityId: string;
      keyId: string;
      createdAt: Date;
      updatedAt: Date;
    }>
  > {
    const results: Array<{
      id: string;
      name: string;
      entityId: string;
      keyId: string;
      createdAt: Date;
      updatedAt: Date;
    }> = [];

    for (const secret of this.secrets.values()) {
      if (secret.entityId === entityId) {
        results.push({
          id: secret.id,
          name: secret.name,
          entityId: secret.entityId,
          keyId: secret.keyId,
          createdAt: secret.createdAt,
          updatedAt: secret.updatedAt,
        });
      }
    }

    // Sort by name for consistent ordering
    results.sort((a, b) => a.name.localeCompare(b.name));

    return results;
  }

  /**
   * Securely delete a named secret. The encrypted data is removed from
   * the store. The secret cannot be recovered after deletion.
   *
   * @param name - The secret name
   * @param entityId - The owning entity
   * @throws Error if the secret does not exist
   */
  async deleteSecret(name: string, entityId: string): Promise<void> {
    const compositeKey = this.secretCompositeKey(entityId, name);
    const secret = this.secrets.get(compositeKey);

    if (!secret) {
      throw new Error(
        `Secret not found: name="${name}", entityId="${entityId}"`,
      );
    }

    // Overwrite the encrypted data in memory before deletion (defense in depth)
    secret.encryptedValue = '';
    secret.iv = '';
    secret.authTag = '';

    this.secrets.delete(compositeKey);

    console.log(
      `[VaultService] AUDIT: Secret "${name}" for entity "${entityId}" securely deleted.`,
    );
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Derive an AES-256 key from a master password using PBKDF2.
   */
  private deriveKey(masterKey: string): Buffer {
    return crypto.pbkdf2Sync(
      masterKey,
      PBKDF2_SALT,
      PBKDF2_ITERATIONS,
      PBKDF2_KEY_LENGTH,
      PBKDF2_DIGEST,
    );
  }

  /**
   * Encrypt plaintext using AES-256-GCM with the instance encryption key.
   */
  private encryptRaw(plaintext: string): {
    encrypted: string;
    iv: string;
    authTag: string;
  } {
    return this.encryptWithKey(plaintext, this.encryptionKey);
  }

  /**
   * Decrypt ciphertext using AES-256-GCM with the instance encryption key.
   */
  private decryptRaw(encrypted: string, iv: string, authTag: string): string {
    return this.decryptWithKey(encrypted, iv, authTag, this.encryptionKey);
  }

  /**
   * Encrypt plaintext with a specific key (used during key rotation).
   */
  private encryptWithKey(
    plaintext: string,
    key: Buffer,
  ): { encrypted: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(GCM_IV_LENGTH);
    const cipher = crypto.createCipheriv(AES_ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag,
    };
  }

  /**
   * Decrypt ciphertext with a specific key (used during key rotation).
   */
  private decryptWithKey(
    encrypted: string,
    iv: string,
    authTag: string,
    key: Buffer,
  ): string {
    const decipher = crypto.createDecipheriv(
      AES_ALGORITHM,
      key,
      Buffer.from(iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Strip sensitive encryption fields from a vault entry for safe external use.
   */
  private stripSensitiveFields(entry: VaultEntry): SafeVaultEntry {
    const {
      encryptedValue: _enc,
      iv: _iv,
      authTag: _tag,
      ...safe
    } = entry;

    return safe;
  }

  /**
   * Build a composite key for the secrets store from entityId and name.
   */
  private secretCompositeKey(entityId: string, name: string): string {
    return `${entityId}:${name}`;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const vaultService = new VaultService();
