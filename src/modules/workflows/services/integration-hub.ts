// ============================================================================
// Integration Hub — Pluggable External Service Integrations
// Registry of connectors, credential validation, response normalization,
// dry-run mode, and type-based routing to external services.
// ============================================================================

import type { IntegrationConfig, IntegrationType } from '@/modules/workflows/types';

// In-memory integration store
const integrationStore = new Map<string, IntegrationConfig>();

let integrationCounter = 0;

function generateIntegrationId(): string {
  integrationCounter++;
  return `integration-${Date.now()}-${integrationCounter}`;
}

// --- Normalized Response Shape ---

export interface IntegrationResponse {
  success: boolean;
  integration: string;
  type: IntegrationType;
  action: string;
  data: Record<string, unknown>;
  statusCode?: number;
  durationMs: number;
  dryRun: boolean;
  error?: string;
  timestamp: string;
}

// --- Credential Requirements per Integration Type ---

const CREDENTIAL_REQUIREMENTS: Record<IntegrationType, string[]> = {
  GOOGLE_WORKSPACE: ['clientId', 'clientSecret', 'refreshToken'],
  SLACK: ['botToken'],
  NOTION: ['apiKey'],
  QUICKBOOKS: ['clientId', 'clientSecret', 'realmId', 'refreshToken'],
  CUSTOM_REST: ['apiKey'],
  CUSTOM_WEBHOOK: ['secret'],
};

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

// --- Credential Validation ---

export interface CredentialValidationResult {
  valid: boolean;
  missingFields: string[];
  emptyFields: string[];
}

/**
 * Validate that an integration's credentials contain all required fields
 * for the given integration type. Returns details about what is missing or empty.
 */
export function validateCredentials(
  type: IntegrationType,
  credentials: Record<string, string>
): CredentialValidationResult {
  const requiredFields = CREDENTIAL_REQUIREMENTS[type] ?? [];
  const missingFields: string[] = [];
  const emptyFields: string[] = [];

  for (const field of requiredFields) {
    if (!(field in credentials)) {
      missingFields.push(field);
    } else if (!credentials[field] || credentials[field].trim() === '') {
      emptyFields.push(field);
    }
  }

  return {
    valid: missingFields.length === 0 && emptyFields.length === 0,
    missingFields,
    emptyFields,
  };
}

// --- Type-Based Integration Execution ---

/**
 * Execute an integration by type with an inline config and data payload.
 * Routes to the correct connector, normalizes the response shape,
 * validates credentials before execution, and supports dry-run mode.
 *
 * @param type - The integration type (SLACK, GOOGLE_WORKSPACE, etc.)
 * @param config - Integration configuration (credentials, baseUrl, headers)
 * @param data - The action and parameters to execute
 * @param options - Optional flags (dryRun)
 */
export async function executeIntegration(
  type: IntegrationType,
  config: {
    name?: string;
    credentials: Record<string, string>;
    baseUrl?: string;
    headers?: Record<string, string>;
  },
  data: {
    action: string;
    params: Record<string, unknown>;
  },
  options?: { dryRun?: boolean }
): Promise<IntegrationResponse> {
  const startTime = Date.now();
  const dryRun = options?.dryRun ?? false;
  const integrationName = config.name ?? type;
  const action = data.action;

  // Validate credentials before execution
  const credValidation = validateCredentials(type, config.credentials);
  if (!credValidation.valid) {
    const missing = credValidation.missingFields;
    const empty = credValidation.emptyFields;
    const details: string[] = [];
    if (missing.length > 0) details.push(`missing: ${missing.join(', ')}`);
    if (empty.length > 0) details.push(`empty: ${empty.join(', ')}`);

    return {
      success: false,
      integration: integrationName,
      type,
      action,
      data: {},
      durationMs: Date.now() - startTime,
      dryRun,
      error: `Credential validation failed — ${details.join('; ')}`,
      timestamp: new Date().toISOString(),
    };
  }

  // Dry-run mode: validate and describe what would happen, but do not execute
  if (dryRun) {
    return {
      success: true,
      integration: integrationName,
      type,
      action,
      data: {
        dryRun: true,
        wouldExecute: `${type}/${action}`,
        params: Object.keys(data.params),
        credentialsValid: true,
        description: describeDryRun(type, action, data.params),
      },
      durationMs: Date.now() - startTime,
      dryRun: true,
      timestamp: new Date().toISOString(),
    };
  }

  // Build a synthetic IntegrationConfig for internal dispatch
  const syntheticConfig: IntegrationConfig = {
    id: `inline-${Date.now()}`,
    type,
    name: integrationName,
    credentials: config.credentials,
    baseUrl: config.baseUrl,
    headers: config.headers,
    isActive: true,
  };

  try {
    const rawResult = await dispatchToConnector(syntheticConfig, action, data.params);

    return normalizeResponse({
      success: true,
      integration: integrationName,
      type,
      action,
      rawResult,
      durationMs: Date.now() - startTime,
      dryRun,
    });
  } catch (err) {
    return {
      success: false,
      integration: integrationName,
      type,
      action,
      data: {},
      durationMs: Date.now() - startTime,
      dryRun,
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Generate a human-readable description of what a dry run would do.
 */
function describeDryRun(
  type: IntegrationType,
  action: string,
  params: Record<string, unknown>
): string {
  const paramSummary = Object.keys(params).length > 0
    ? ` with params: ${Object.keys(params).join(', ')}`
    : '';

  const descriptions: Record<IntegrationType, string> = {
    GOOGLE_WORKSPACE: `Would execute Google Workspace action "${action}"${paramSummary}`,
    SLACK: `Would send Slack action "${action}"${paramSummary}`,
    NOTION: `Would execute Notion action "${action}"${paramSummary}`,
    QUICKBOOKS: `Would execute QuickBooks action "${action}"${paramSummary}`,
    CUSTOM_REST: `Would send REST request to "${action}" endpoint${paramSummary}`,
    CUSTOM_WEBHOOK: `Would fire webhook for "${action}"${paramSummary}`,
  };

  return descriptions[type] ?? `Would execute ${type}/${action}${paramSummary}`;
}

/**
 * Normalize raw connector output into a consistent IntegrationResponse shape.
 * Strips meta-fields (status, integration) from raw data and promotes them
 * to the top-level response fields.
 */
function normalizeResponse(input: {
  success: boolean;
  integration: string;
  type: IntegrationType;
  action: string;
  rawResult: Record<string, unknown>;
  durationMs: number;
  dryRun: boolean;
}): IntegrationResponse {
  const { rawResult } = input;

  // Extract statusCode from various connector output shapes
  const statusCode = (rawResult.status as number | undefined)
    ?? (rawResult.statusCode as number | undefined);

  // Extract data — strip meta-fields that we handle at the response level
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawResult)) {
    if (!['status', 'statusCode', 'integration'].includes(key)) {
      data[key] = value;
    }
  }

  return {
    success: input.success,
    integration: input.integration,
    type: input.type,
    action: input.action,
    data,
    statusCode,
    durationMs: input.durationMs,
    dryRun: input.dryRun,
    timestamp: new Date().toISOString(),
  };
}

// --- Action Execution (Registered Integration by ID) ---

/**
 * Execute an action on a registered integration by its stored ID.
 * Validates credentials, dispatches to the correct connector, and
 * normalizes the response.
 */
export async function executeIntegrationAction(
  integrationId: string,
  action: string,
  params: Record<string, unknown>
): Promise<IntegrationResponse> {
  const integration = integrationStore.get(integrationId);
  if (!integration) {
    throw new Error(`Integration ${integrationId} not found`);
  }

  if (!integration.isActive) {
    throw new Error(`Integration ${integrationId} is not active`);
  }

  // Validate credentials before execution
  const credValidation = validateCredentials(integration.type, integration.credentials);
  if (!credValidation.valid) {
    const details: string[] = [];
    if (credValidation.missingFields.length > 0) {
      details.push(`missing: ${credValidation.missingFields.join(', ')}`);
    }
    if (credValidation.emptyFields.length > 0) {
      details.push(`empty: ${credValidation.emptyFields.join(', ')}`);
    }

    return {
      success: false,
      integration: integration.name,
      type: integration.type,
      action,
      data: {},
      durationMs: 0,
      dryRun: false,
      error: `Credential validation failed — ${details.join('; ')}`,
      timestamp: new Date().toISOString(),
    };
  }

  const startTime = Date.now();

  try {
    const rawResult = await dispatchToConnector(integration, action, params);

    return normalizeResponse({
      success: true,
      integration: integration.name,
      type: integration.type,
      action,
      rawResult,
      durationMs: Date.now() - startTime,
      dryRun: false,
    });
  } catch (err) {
    return {
      success: false,
      integration: integration.name,
      type: integration.type,
      action,
      data: {},
      durationMs: Date.now() - startTime,
      dryRun: false,
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    };
  }
}

// --- Connector Dispatch ---

/**
 * Route to the correct connector based on integration type.
 */
async function dispatchToConnector(
  integration: IntegrationConfig,
  action: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
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

  // Validate credentials first
  const credValidation = validateCredentials(integration.type, integration.credentials);
  if (!credValidation.valid) {
    const details: string[] = [];
    if (credValidation.missingFields.length > 0) {
      details.push(`missing credentials: ${credValidation.missingFields.join(', ')}`);
    }
    if (credValidation.emptyFields.length > 0) {
      details.push(`empty credentials: ${credValidation.emptyFields.join(', ')}`);
    }
    return { connected: false, latencyMs: 0, error: details.join('; ') };
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
