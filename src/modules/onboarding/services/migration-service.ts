import type { DataMigrationSource } from '../types';

const importStore = new Map<string, DataMigrationSource>();

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

export { importStore };
