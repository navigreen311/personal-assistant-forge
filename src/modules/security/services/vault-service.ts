// ============================================================================
// Vault Service — AES-256-GCM Encrypted Secret Storage
// Worker 15: Security, Privacy & Compliance
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
// VaultService
// ---------------------------------------------------------------------------

export class VaultService {
  private readonly vault: Map<string, VaultEntry> = new Map();
  private readonly accessCounts: Map<string, number> = new Map();
  private readonly config: VaultConfig;
  private encryptionKey: Buffer;

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
  }

  // -------------------------------------------------------------------------
  // Public API
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

    const { encrypted, iv, authTag } = this.encrypt(value);

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

    const value = this.decrypt(entry.encryptedValue, entry.iv, entry.authTag);

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
  private encrypt(plaintext: string): {
    encrypted: string;
    iv: string;
    authTag: string;
  } {
    return this.encryptWithKey(plaintext, this.encryptionKey);
  }

  /**
   * Decrypt ciphertext using AES-256-GCM with the instance encryption key.
   */
  private decrypt(encrypted: string, iv: string, authTag: string): string {
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
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

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
      'aes-256-gcm',
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
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const vaultService = new VaultService();
