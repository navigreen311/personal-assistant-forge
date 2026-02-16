import { prisma } from '@/lib/db';
import type { DataMigrationSource } from '../types';

export const importStore = new Map<string, DataMigrationSource>();

const migrationState = new Map<
  string,
  {
    id: string;
    entityId: string;
    source: string;
    config: Record<string, unknown>;
    status: string;
    totalRecords: number;
    processed: number;
    succeeded: number;
    failed: number;
    errors: Array<{ row: number; field: string; error: string }>;
    createdRecordIds: string[];
  }
>();

export function getAvailableSources(): DataMigrationSource[] {
  return [
    { id: 'notion', name: 'Notion', icon: 'notion', category: 'NOTES', isConnected: false, status: 'NOT_STARTED' },
    { id: 'todoist', name: 'Todoist', icon: 'todoist', category: 'PRODUCTIVITY', isConnected: false, status: 'NOT_STARTED' },
    { id: 'asana', name: 'Asana', icon: 'asana', category: 'PRODUCTIVITY', isConnected: false, status: 'NOT_STARTED' },
    { id: 'google-calendar', name: 'Google Calendar', icon: 'google-calendar', category: 'CALENDAR', isConnected: false, status: 'NOT_STARTED' },
    { id: 'outlook-calendar', name: 'Outlook Calendar', icon: 'outlook', category: 'CALENDAR', isConnected: false, status: 'NOT_STARTED' },
    { id: 'gmail', name: 'Gmail', icon: 'gmail', category: 'EMAIL', isConnected: false, status: 'NOT_STARTED' },
    { id: 'outlook-mail', name: 'Outlook Mail', icon: 'outlook', category: 'EMAIL', isConnected: false, status: 'NOT_STARTED' },
    { id: 'hubspot', name: 'HubSpot', icon: 'hubspot', category: 'CRM', isConnected: false, status: 'NOT_STARTED' },
    { id: 'salesforce', name: 'Salesforce', icon: 'salesforce', category: 'CRM', isConnected: false, status: 'NOT_STARTED' },
  ];
}

export async function startMigration(
  entityId: string,
  source: 'csv' | 'json' | 'api',
  config: Record<string, unknown>
): Promise<{ migrationId: string; status: string }> {
  const migrationId = `migration-${Date.now()}`;

  migrationState.set(migrationId, {
    id: migrationId,
    entityId,
    source,
    config,
    status: 'IN_PROGRESS',
    totalRecords: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors: [],
    createdRecordIds: [],
  });

  await prisma.actionLog.create({
    data: {
      actor: 'MIGRATION_SERVICE',
      actionType: 'MIGRATION_START',
      target: entityId,
      reason: `Migration started from ${source}`,
      status: 'PENDING',
      rollbackPath: migrationId,
    },
  }).catch(() => {});

  return { migrationId, status: 'IN_PROGRESS' };
}

export async function importData(
  migrationId: string,
  data: Record<string, unknown>[],
  modelType: string
): Promise<{ processed: number; succeeded: number; failed: number }> {
  const migration = migrationState.get(migrationId);
  if (!migration) throw new Error(`Migration ${migrationId} not found`);

  migration.totalRecords += data.length;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    migration.processed++;

    try {
      const fieldMapping = migration.config.fieldMapping as Record<string, string> | undefined;
      const mapped: Record<string, unknown> = {};

      if (fieldMapping) {
        for (const [sourceField, targetField] of Object.entries(fieldMapping)) {
          if (row[sourceField] !== undefined) {
            mapped[targetField] = row[sourceField];
          }
        }
      } else {
        Object.assign(mapped, row);
      }

      if (modelType === 'contact') {
        const contact = await prisma.contact.create({
          data: {
            entityId: migration.entityId,
            name: (mapped.name as string) ?? 'Unknown',
            email: mapped.email as string | undefined,
            phone: mapped.phone as string | undefined,
          },
        });
        migration.createdRecordIds.push(contact.id);
      } else if (modelType === 'task') {
        const task = await prisma.task.create({
          data: {
            entityId: migration.entityId,
            title: (mapped.title as string) ?? 'Imported task',
            description: mapped.description as string | undefined,
          },
        });
        migration.createdRecordIds.push(task.id);
      } else if (modelType === 'document') {
        const doc = await prisma.document.create({
          data: {
            entityId: migration.entityId,
            title: (mapped.title as string) ?? 'Imported document',
            type: 'IMPORTED',
            content: mapped.content as string | undefined,
          },
        });
        migration.createdRecordIds.push(doc.id);
      }

      migration.succeeded++;
    } catch (err) {
      migration.failed++;
      migration.errors.push({
        row: i,
        field: '',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  if (migration.processed >= migration.totalRecords) {
    migration.status = migration.failed > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
  }

  migrationState.set(migrationId, migration);
  return { processed: migration.processed, succeeded: migration.succeeded, failed: migration.failed };
}

export async function getMigrationStatus(migrationId: string): Promise<{
  totalRecords: number;
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ row: number; field: string; error: string }>;
  status: string;
}> {
  const migration = migrationState.get(migrationId);
  if (!migration) throw new Error(`Migration ${migrationId} not found`);

  return {
    totalRecords: migration.totalRecords,
    processed: migration.processed,
    succeeded: migration.succeeded,
    failed: migration.failed,
    errors: migration.errors,
    status: migration.status,
  };
}

export function validateData(
  data: Record<string, unknown>[],
  schema: Record<string, { type: string; required?: boolean }>
): { valid: boolean; errors: Array<{ row: number; field: string; error: string }> } {
  const errors: Array<{ row: number; field: string; error: string }> = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    for (const [field, def] of Object.entries(schema)) {
      if (def.required && (row[field] === undefined || row[field] === null || row[field] === '')) {
        errors.push({ row: i, field, error: `Required field "${field}" is missing` });
      }
      if (row[field] !== undefined && row[field] !== null) {
        if (def.type === 'string' && typeof row[field] !== 'string') {
          errors.push({ row: i, field, error: `Field "${field}" must be a string` });
        } else if (def.type === 'number' && typeof row[field] !== 'number') {
          errors.push({ row: i, field, error: `Field "${field}" must be a number` });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function rollbackMigration(migrationId: string): Promise<{ rolledBack: number }> {
  const migration = migrationState.get(migrationId);
  if (!migration) throw new Error(`Migration ${migrationId} not found`);

  let rolledBack = 0;
  for (const recordId of migration.createdRecordIds) {
    try {
      await prisma.contact.delete({ where: { id: recordId } }).catch(() => {});
      await prisma.task.delete({ where: { id: recordId } }).catch(() => {});
      await prisma.document.delete({ where: { id: recordId } }).catch(() => {});
      rolledBack++;
    } catch {
      // Record may already be deleted
    }
  }

  migration.status = 'ROLLED_BACK';
  migrationState.set(migrationId, migration);

  await prisma.actionLog.create({
    data: {
      actor: 'MIGRATION_SERVICE',
      actionType: 'MIGRATION_ROLLBACK',
      target: migration.entityId,
      reason: `Rolled back migration ${migrationId}: ${rolledBack} records`,
      status: 'COMPLETED',
    },
  }).catch(() => {});

  return { rolledBack };
}

export async function initiateImport(userId: string, sourceId: string): Promise<DataMigrationSource> {
  const sources = getAvailableSources();
  const source = sources.find((s) => s.id === sourceId);
  if (!source) throw new Error(`Source ${sourceId} not found`);

  const importSource: DataMigrationSource = {
    ...source,
    isConnected: true,
    status: 'IMPORTING',
    importedCount: 0,
  };

  importStore.set(`${userId}:${sourceId}`, importSource);
  return importSource;
}

export async function getImportStatus(userId: string, sourceId: string): Promise<DataMigrationSource> {
  const stored = importStore.get(`${userId}:${sourceId}`);
  if (!stored) {
    const sources = getAvailableSources();
    const source = sources.find((s) => s.id === sourceId);
    if (!source) throw new Error(`Source ${sourceId} not found`);
    return source;
  }
  return stored;
}

export async function cancelImport(userId: string, sourceId: string): Promise<void> {
  const key = `${userId}:${sourceId}`;
  const stored = importStore.get(key);
  if (stored) {
    stored.status = 'NOT_STARTED';
    stored.isConnected = false;
    importStore.set(key, stored);
  }
}
