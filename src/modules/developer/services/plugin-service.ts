import { v4 as uuidv4 } from 'uuid';
import type { PluginDefinition } from '../types';

const pluginStore = new Map<string, PluginDefinition>();

export async function registerPlugin(
  plugin: Omit<PluginDefinition, 'id' | 'status' | 'createdAt' | 'updatedAt'>
): Promise<PluginDefinition> {
  const now = new Date();
  const newPlugin: PluginDefinition = {
    ...plugin,
    id: uuidv4(),
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
  };
  pluginStore.set(newPlugin.id, newPlugin);
  return newPlugin;
}

export async function getPlugins(status?: string): Promise<PluginDefinition[]> {
  const results: PluginDefinition[] = [];
  for (const plugin of pluginStore.values()) {
    if (!status || plugin.status === status) results.push(plugin);
  }
  return results;
}

export async function submitForReview(pluginId: string): Promise<PluginDefinition> {
  const plugin = pluginStore.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
  if (plugin.status !== 'DRAFT') throw new Error('Only DRAFT plugins can be submitted for review');
  plugin.status = 'REVIEW';
  plugin.updatedAt = new Date();
  pluginStore.set(pluginId, plugin);
  return plugin;
}

export async function approvePlugin(pluginId: string): Promise<PluginDefinition> {
  const plugin = pluginStore.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
  plugin.status = 'APPROVED';
  plugin.updatedAt = new Date();
  pluginStore.set(pluginId, plugin);
  return plugin;
}

export async function revokePlugin(pluginId: string, _reason: string): Promise<PluginDefinition> {
  const plugin = pluginStore.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
  plugin.status = 'REVOKED';
  plugin.updatedAt = new Date();
  pluginStore.set(pluginId, plugin);
  return plugin;
}

export function getPluginSDKStub(): Record<string, string> {
  return {
    'Plugin Interface': 'interface Plugin { id: string; name: string; version: string; init(): Promise<void>; destroy(): Promise<void>; }',
    'Hook System': 'interface PluginHook { event: string; handler: (payload: unknown) => Promise<void>; }',
    'Config Schema': 'interface PluginConfig { schema: Record<string, { type: string; required: boolean; default?: unknown }>; }',
    'Permission Model': 'type Permission = "tasks.read" | "tasks.write" | "documents.read" | "documents.write" | "contacts.read" | "messages.read" | "messages.write";',
    'Lifecycle': 'enum PluginLifecycle { DRAFT = "DRAFT", REVIEW = "REVIEW", APPROVED = "APPROVED", PUBLISHED = "PUBLISHED", REVOKED = "REVOKED" }',
  };
}

export { pluginStore };
