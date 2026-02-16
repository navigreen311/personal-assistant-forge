// ============================================================================
// Integration Hub — Pluggable External Service Integrations
// Manages integration configs and dispatches actions to external services
// ============================================================================

import type { IntegrationConfig, IntegrationType } from '@/modules/workflows/types';

// In-memory integration store
const integrationStore = new Map<string, IntegrationConfig>();

let integrationCounter = 0;

function generateIntegrationId(): string {
  integrationCounter++;
  return `integration-${Date.now()}-${integrationCounter}`;
}

// --- CRUD ---

export function registerIntegration(
  config: Omit<IntegrationConfig, 'id'>
): IntegrationConfig {
  const id = generateIntegrationId();
  const integration: IntegrationConfig = { ...config, id };
  integrationStore.set(id, integration);
  return integration;
}

export function getIntegration(id: string): IntegrationConfig | null {
  return integrationStore.get(id) ?? null;
}

export function listIntegrations(activeOnly = false): IntegrationConfig[] {
  const all = Array.from(integrationStore.values());
  if (activeOnly) {
    return all.filter((i) => i.isActive);
  }
  return all;
}

export function updateIntegration(
  id: string,
  updates: Partial<Omit<IntegrationConfig, 'id'>>
): IntegrationConfig | null {
  const existing = integrationStore.get(id);
  if (!existing) return null;

  const updated = { ...existing, ...updates };
  integrationStore.set(id, updated);
  return updated;
}

export function removeIntegration(id: string): boolean {
  return integrationStore.delete(id);
}

// --- Action Execution ---

export async function executeIntegrationAction(
  integrationId: string,
  action: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const integration = integrationStore.get(integrationId);
  if (!integration) {
    throw new Error(`Integration ${integrationId} not found`);
  }

  if (!integration.isActive) {
    throw new Error(`Integration ${integrationId} is not active`);
  }

  switch (integration.type) {
    case 'CUSTOM_REST':
      return executeRestAction(integration, action, params);

    case 'CUSTOM_WEBHOOK':
      return executeWebhookAction(integration, action, params);

    case 'GOOGLE_WORKSPACE':
      return executeMockAction(integration, 'Google Workspace', action, params);

    case 'SLACK':
      return executeMockAction(integration, 'Slack', action, params);

    case 'NOTION':
      return executeMockAction(integration, 'Notion', action, params);

    case 'QUICKBOOKS':
      return executeMockAction(integration, 'QuickBooks', action, params);

    default:
      throw new Error(`Unsupported integration type: ${integration.type}`);
  }
}

async function executeRestAction(
  integration: IntegrationConfig,
  action: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const baseUrl = integration.baseUrl ?? '';
  const url = `${baseUrl}/${action}`;
  const method = (params.method as string) ?? 'POST';

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...integration.headers,
    },
    body: method !== 'GET' ? JSON.stringify(params.body ?? params) : undefined,
  });

  const data = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    parsed = data;
  }

  return {
    status: response.status,
    data: parsed,
    integration: integration.name,
  };
}

async function executeWebhookAction(
  integration: IntegrationConfig,
  _action: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const baseUrl = integration.baseUrl ?? '';

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...integration.headers,
    },
    body: JSON.stringify(params),
  });

  return {
    status: response.status,
    delivered: response.ok,
    integration: integration.name,
  };
}

async function executeMockAction(
  integration: IntegrationConfig,
  serviceName: string,
  action: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // Placeholder: In production, implement OAuth flows and API calls for each service
  // Google Workspace: use googleapis npm package
  // Slack: use @slack/web-api
  // Notion: use @notionhq/client
  // QuickBooks: use node-quickbooks

  return {
    success: true,
    service: serviceName,
    action,
    integration: integration.name,
    message: `[Mock] ${serviceName} ${action} executed successfully`,
    params: Object.keys(params),
    timestamp: new Date().toISOString(),
  };
}

// --- Connection Testing ---

export async function testConnection(
  integrationId: string
): Promise<{ connected: boolean; latencyMs: number; error?: string }> {
  const integration = integrationStore.get(integrationId);
  if (!integration) {
    return { connected: false, latencyMs: 0, error: 'Integration not found' };
  }

  const start = Date.now();

  try {
    if (integration.type === 'CUSTOM_REST' || integration.type === 'CUSTOM_WEBHOOK') {
      const baseUrl = integration.baseUrl;
      if (!baseUrl) {
        return { connected: false, latencyMs: 0, error: 'No base URL configured' };
      }

      const response = await fetch(baseUrl, {
        method: 'HEAD',
        headers: integration.headers,
        signal: AbortSignal.timeout(10000),
      });

      const latencyMs = Date.now() - start;
      return {
        connected: response.ok,
        latencyMs,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    }

    // Mock test for managed integrations
    const latencyMs = Date.now() - start + 50;
    return {
      connected: integration.isActive,
      latencyMs,
      error: integration.isActive ? undefined : 'Integration is inactive',
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      connected: false,
      latencyMs,
      error: err instanceof Error ? err.message : 'Connection test failed',
    };
  }
}

// --- Testing Helpers ---

export function clearIntegrationStore(): void {
  integrationStore.clear();
  integrationCounter = 0;
}
