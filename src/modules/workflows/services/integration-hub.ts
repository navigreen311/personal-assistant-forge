// ============================================================================
// Integration Hub — Pluggable External Service Integrations
// Manages integration configs and dispatches actions to external services
// Real OAuth flows and API calls for Google, Slack, Notion, QuickBooks
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

// --- OAuth Token Response ---

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
}

// --- OAuth Provider Configuration ---

interface OAuthProviderConfig {
  authUrl: string;
  tokenUrl: string;
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
  redirectUriEnvVar?: string;
  defaultScopes: string[];
}

const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  GOOGLE_WORKSPACE: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientIdEnvVar: 'GOOGLE_CLIENT_ID',
    clientSecretEnvVar: 'GOOGLE_CLIENT_SECRET',
    redirectUriEnvVar: 'GOOGLE_REDIRECT_URI',
    defaultScopes: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
  },
  SLACK: {
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    clientIdEnvVar: 'SLACK_CLIENT_ID',
    clientSecretEnvVar: 'SLACK_CLIENT_SECRET',
    defaultScopes: ['chat:write', 'channels:read'],
  },
  NOTION: {
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    clientIdEnvVar: 'NOTION_CLIENT_ID',
    clientSecretEnvVar: 'NOTION_CLIENT_SECRET',
    defaultScopes: [],
  },
  QUICKBOOKS: {
    authUrl: 'https://appcenter.intuit.com/connect/oauth2',
    tokenUrl: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    clientIdEnvVar: 'QUICKBOOKS_CLIENT_ID',
    clientSecretEnvVar: 'QUICKBOOKS_CLIENT_SECRET',
    defaultScopes: ['com.intuit.quickbooks.accounting'],
  },
};

// --- Credential Requirements per Integration Type ---

const CREDENTIAL_REQUIREMENTS: Record<IntegrationType, string[]> = {
  GOOGLE_WORKSPACE: ['clientId', 'clientSecret', 'refreshToken'],
  SLACK: ['botToken'],
  NOTION: ['apiKey'],
  QUICKBOOKS: ['clientId', 'clientSecret', 'realmId', 'refreshToken'],
  CUSTOM_REST: ['apiKey'],
  CUSTOM_WEBHOOK: ['secret'],
};

// --- Environment Variable Helpers ---

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// --- OAuth Functions ---

/**
 * Build an OAuth authorization URL for the given provider.
 * Redirects the user to the provider's consent screen.
 *
 * @param provider - The integration type (GOOGLE_WORKSPACE, SLACK, NOTION, QUICKBOOKS)
 * @param userId - A unique user/state identifier for CSRF protection
 * @param scopes - Optional list of scopes (defaults to provider defaults)
 * @returns The full authorization URL
 */
export function getAuthUrl(
  provider: IntegrationType,
  userId: string,
  scopes?: string[]
): string {
  const config = OAUTH_PROVIDERS[provider];
  if (!config) {
    throw new Error(`OAuth not supported for provider: ${provider}`);
  }

  const clientId = getRequiredEnvVar(config.clientIdEnvVar);
  const resolvedScopes = scopes ?? config.defaultScopes;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    state: userId,
    scope: resolvedScopes.join(' '),
  });

  // Google and QuickBooks require redirect_uri; Slack and Notion use it if available
  if (config.redirectUriEnvVar) {
    const redirectUri = getRequiredEnvVar(config.redirectUriEnvVar);
    params.set('redirect_uri', redirectUri);
  }

  // Google-specific: request offline access for refresh tokens
  if (provider === 'GOOGLE_WORKSPACE') {
    params.set('access_type', 'offline');
    params.set('prompt', 'consent');
  }

  // Notion-specific: uses owner=user parameter
  if (provider === 'NOTION') {
    params.set('owner', 'user');
  }

  return `${config.authUrl}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access and refresh tokens.
 *
 * @param provider - The integration type
 * @param code - The authorization code received from the OAuth callback
 * @returns Token response with access_token and optionally refresh_token
 */
export async function exchangeCode(
  provider: IntegrationType,
  code: string
): Promise<OAuthTokenResponse> {
  const config = OAUTH_PROVIDERS[provider];
  if (!config) {
    throw new Error(`OAuth not supported for provider: ${provider}`);
  }

  const clientId = getRequiredEnvVar(config.clientIdEnvVar);
  const clientSecret = getRequiredEnvVar(config.clientSecretEnvVar);

  // Notion uses Basic auth for token exchange
  if (provider === 'NOTION') {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Notion token exchange failed (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<OAuthTokenResponse>;
  }

  // Google, Slack, QuickBooks use form-encoded POST
  const body: Record<string, string> = {
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
  };

  if (config.redirectUriEnvVar) {
    body.redirect_uri = getRequiredEnvVar(config.redirectUriEnvVar);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  // QuickBooks uses Basic auth header
  if (provider === 'QUICKBOOKS') {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${basicAuth}`;
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers,
    body: new URLSearchParams(body).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${provider} token exchange failed (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<OAuthTokenResponse>;
}

/**
 * Refresh an expired access token using a refresh token.
 *
 * @param provider - The integration type
 * @param refreshToken - The refresh token stored from a previous authorization
 * @returns New token response with a fresh access_token
 */
export async function refreshAccessToken(
  provider: IntegrationType,
  refreshToken: string
): Promise<OAuthTokenResponse> {
  const config = OAUTH_PROVIDERS[provider];
  if (!config) {
    throw new Error(`OAuth not supported for provider: ${provider}`);
  }

  const clientId = getRequiredEnvVar(config.clientIdEnvVar);
  const clientSecret = getRequiredEnvVar(config.clientSecretEnvVar);

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  const body: Record<string, string> = {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  };

  // QuickBooks and Notion use Basic auth for token refresh
  if (provider === 'QUICKBOOKS' || provider === 'NOTION') {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${basicAuth}`;
  }

  // Notion uses JSON body for refresh
  if (provider === 'NOTION') {
    headers['Content-Type'] = 'application/json';
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${provider} token refresh failed (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<OAuthTokenResponse>;
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers,
    body: new URLSearchParams(body).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${provider} token refresh failed (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<OAuthTokenResponse>;
}

/**
 * Execute an authenticated API action against an external provider.
 * This is a high-level convenience function that routes to the correct provider connector.
 *
 * @param provider - The integration type
 * @param action - The action to perform (e.g., 'calendar.list', 'chat.postMessage')
 * @param credentials - Provider credentials including access/bot tokens
 * @param params - Action-specific parameters
 * @returns Raw result from the API call
 */
export async function executeAction(
  provider: IntegrationType,
  action: string,
  credentials: Record<string, string>,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  switch (provider) {
    case 'GOOGLE_WORKSPACE':
      return executeGoogleAction(credentials, action, params);
    case 'SLACK':
      return executeSlackAction(credentials, action, params);
    case 'NOTION':
      return executeNotionAction(credentials, action, params);
    case 'QUICKBOOKS':
      return executeQuickBooksAction(credentials, action, params);
    default:
      throw new Error(`executeAction not supported for provider: ${provider}`);
  }
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

// --- Credential Validation ---

export interface CredentialValidationResult {
  valid: boolean;
  missingFields: string[];
  emptyFields: string[];
}

/**
 * Validate that an integration config has all required credentials.
 * Returns details about what is missing or empty.
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

// --- Action Execution (Registered Integration) ---

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
      return executeGoogleAction(integration.credentials, action, params);

    case 'SLACK':
      return executeSlackAction(integration.credentials, action, params);

    case 'NOTION':
      return executeNotionAction(integration.credentials, action, params);

    case 'QUICKBOOKS':
      return executeQuickBooksAction(integration.credentials, action, params);

    default:
      throw new Error(`Unsupported integration type: ${integration.type}`);
  }
}

// --- CUSTOM_REST Connector ---

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

// --- CUSTOM_WEBHOOK Connector ---

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

// --- Google Workspace Connector ---

const GOOGLE_API_ENDPOINTS: Record<string, { url: string; method: string }> = {
  'calendar.list': { url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events', method: 'GET' },
  'calendar.get': { url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events', method: 'GET' },
  'gmail.send': { url: 'https://www.googleapis.com/gmail/v1/users/me/messages/send', method: 'POST' },
  'gmail.list': { url: 'https://www.googleapis.com/gmail/v1/users/me/messages', method: 'GET' },
  'drive.list': { url: 'https://www.googleapis.com/drive/v3/files', method: 'GET' },
  'drive.get': { url: 'https://www.googleapis.com/drive/v3/files', method: 'GET' },
};

async function executeGoogleAction(
  credentials: Record<string, string>,
  action: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const accessToken = credentials.accessToken ?? credentials.botToken;
  if (!accessToken) {
    throw new Error('Google API requires an accessToken credential');
  }

  const endpoint = GOOGLE_API_ENDPOINTS[action];
  if (!endpoint) {
    throw new Error(`Unsupported Google action: ${action}. Supported: ${Object.keys(GOOGLE_API_ENDPOINTS).join(', ')}`);
  }

  let url = endpoint.url;

  // Append query parameters for GET requests
  if (endpoint.method === 'GET' && Object.keys(params).length > 0) {
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        queryParams.set(key, String(value));
      }
    }
    const qs = queryParams.toString();
    if (qs) {
      url = `${url}?${qs}`;
    }
  }

  const fetchOptions: RequestInit = {
    method: endpoint.method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  };

  if (endpoint.method === 'POST') {
    fetchOptions.body = JSON.stringify(params);
  }

  const response = await fetch(url, fetchOptions);
  const responseText = await response.text();

  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = responseText;
  }

  if (!response.ok) {
    throw new Error(`Google API error (${response.status}): ${responseText}`);
  }

  return {
    status: response.status,
    data,
    service: 'Google Workspace',
    action,
  };
}

// --- Slack Connector ---

const SLACK_API_ENDPOINTS: Record<string, string> = {
  'chat.postMessage': 'https://slack.com/api/chat.postMessage',
  'chat.update': 'https://slack.com/api/chat.update',
  'chat.delete': 'https://slack.com/api/chat.delete',
  'channels.list': 'https://slack.com/api/conversations.list',
  'conversations.list': 'https://slack.com/api/conversations.list',
  'conversations.history': 'https://slack.com/api/conversations.history',
  'users.list': 'https://slack.com/api/users.list',
  'users.info': 'https://slack.com/api/users.info',
  'reactions.add': 'https://slack.com/api/reactions.add',
  'files.upload': 'https://slack.com/api/files.upload',
};

async function executeSlackAction(
  credentials: Record<string, string>,
  action: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const token = credentials.botToken ?? credentials.accessToken;
  if (!token) {
    throw new Error('Slack API requires a botToken or accessToken credential');
  }

  const apiUrl = SLACK_API_ENDPOINTS[action];
  if (!apiUrl) {
    throw new Error(`Unsupported Slack action: ${action}. Supported: ${Object.keys(SLACK_API_ENDPOINTS).join(', ')}`);
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(params),
  });

  const responseData = await response.json() as Record<string, unknown>;

  // Slack API returns 200 even on logical errors; check the 'ok' field
  if (!responseData.ok) {
    throw new Error(`Slack API error: ${responseData.error ?? 'unknown_error'}`);
  }

  return {
    status: response.status,
    data: responseData,
    service: 'Slack',
    action,
  };
}

// --- Notion Connector ---

const NOTION_API_VERSION = '2022-06-28';
const NOTION_BASE_URL = 'https://api.notion.com/v1';

const NOTION_ACTION_MAP: Record<string, { path: string; method: string }> = {
  'databases.query': { path: '/databases', method: 'POST' },
  'databases.list': { path: '/search', method: 'POST' },
  'pages.create': { path: '/pages', method: 'POST' },
  'pages.get': { path: '/pages', method: 'GET' },
  'pages.update': { path: '/pages', method: 'PATCH' },
  'blocks.children.list': { path: '/blocks', method: 'GET' },
  'blocks.children.append': { path: '/blocks', method: 'PATCH' },
  'search': { path: '/search', method: 'POST' },
  'users.list': { path: '/users', method: 'GET' },
  'users.me': { path: '/users/me', method: 'GET' },
};

async function executeNotionAction(
  credentials: Record<string, string>,
  action: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const token = credentials.apiKey ?? credentials.accessToken;
  if (!token) {
    throw new Error('Notion API requires an apiKey or accessToken credential');
  }

  const actionConfig = NOTION_ACTION_MAP[action];
  if (!actionConfig) {
    throw new Error(`Unsupported Notion action: ${action}. Supported: ${Object.keys(NOTION_ACTION_MAP).join(', ')}`);
  }

  // Build URL — some actions require an ID appended to the path
  let url = `${NOTION_BASE_URL}${actionConfig.path}`;
  const resourceId = params.id as string | undefined;

  if (resourceId && actionConfig.method === 'GET') {
    url = `${url}/${resourceId}`;
  } else if (resourceId && action === 'databases.query') {
    url = `${url}/${resourceId}/query`;
  } else if (resourceId && action === 'pages.update') {
    url = `${url}/${resourceId}`;
  } else if (resourceId && action === 'blocks.children.list') {
    url = `${url}/${resourceId}/children`;
  } else if (resourceId && action === 'blocks.children.append') {
    url = `${url}/${resourceId}/children`;
  }

  // Build query params for GET requests
  if (actionConfig.method === 'GET') {
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key !== 'id' && value !== undefined && value !== null) {
        queryParams.set(key, String(value));
      }
    }
    const qs = queryParams.toString();
    if (qs) {
      url = `${url}?${qs}`;
    }
  }

  const fetchOptions: RequestInit = {
    method: actionConfig.method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_API_VERSION,
    },
  };

  // Include body for POST and PATCH
  if (actionConfig.method === 'POST' || actionConfig.method === 'PATCH') {
    // Strip 'id' from body — it goes in the URL
    const bodyParams = { ...params };
    delete bodyParams.id;
    fetchOptions.body = JSON.stringify(bodyParams);
  }

  const response = await fetch(url, fetchOptions);
  const responseText = await response.text();

  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = responseText;
  }

  if (!response.ok) {
    throw new Error(`Notion API error (${response.status}): ${responseText}`);
  }

  return {
    status: response.status,
    data,
    service: 'Notion',
    action,
  };
}

// --- QuickBooks Connector ---

const QUICKBOOKS_BASE_URL = 'https://quickbooks.api.intuit.com/v3/company';

const QUICKBOOKS_ACTION_MAP: Record<string, { resource: string; method: string }> = {
  'invoice.create': { resource: 'invoice', method: 'POST' },
  'invoice.query': { resource: 'query', method: 'GET' },
  'invoice.get': { resource: 'invoice', method: 'GET' },
  'customer.create': { resource: 'customer', method: 'POST' },
  'customer.query': { resource: 'query', method: 'GET' },
  'customer.get': { resource: 'customer', method: 'GET' },
  'payment.create': { resource: 'payment', method: 'POST' },
  'payment.query': { resource: 'query', method: 'GET' },
  'account.query': { resource: 'query', method: 'GET' },
  'bill.create': { resource: 'bill', method: 'POST' },
  'bill.query': { resource: 'query', method: 'GET' },
  'vendor.create': { resource: 'vendor', method: 'POST' },
  'vendor.query': { resource: 'query', method: 'GET' },
  'companyinfo.get': { resource: 'companyinfo', method: 'GET' },
};

async function executeQuickBooksAction(
  credentials: Record<string, string>,
  action: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const accessToken = credentials.accessToken;
  if (!accessToken) {
    throw new Error('QuickBooks API requires an accessToken credential');
  }

  const realmId = credentials.realmId;
  if (!realmId) {
    throw new Error('QuickBooks API requires a realmId credential');
  }

  const actionConfig = QUICKBOOKS_ACTION_MAP[action];
  if (!actionConfig) {
    throw new Error(`Unsupported QuickBooks action: ${action}. Supported: ${Object.keys(QUICKBOOKS_ACTION_MAP).join(', ')}`);
  }

  let url: string;

  if (actionConfig.resource === 'query') {
    // Query actions use SQL-like queries
    const query = (params.query as string) ?? `SELECT * FROM ${action.split('.')[0]}`;
    url = `${QUICKBOOKS_BASE_URL}/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=65`;
  } else if (actionConfig.method === 'GET') {
    const resourceId = params.id as string | undefined;
    if (action === 'companyinfo.get') {
      url = `${QUICKBOOKS_BASE_URL}/${realmId}/companyinfo/${realmId}?minorversion=65`;
    } else if (resourceId) {
      url = `${QUICKBOOKS_BASE_URL}/${realmId}/${actionConfig.resource}/${resourceId}?minorversion=65`;
    } else {
      url = `${QUICKBOOKS_BASE_URL}/${realmId}/${actionConfig.resource}?minorversion=65`;
    }
  } else {
    url = `${QUICKBOOKS_BASE_URL}/${realmId}/${actionConfig.resource}?minorversion=65`;
  }

  const fetchOptions: RequestInit = {
    method: actionConfig.method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  };

  if (actionConfig.method === 'POST') {
    const bodyParams = { ...params };
    delete bodyParams.id;
    delete bodyParams.query;
    fetchOptions.body = JSON.stringify(bodyParams);
  }

  const response = await fetch(url, fetchOptions);
  const responseText = await response.text();

  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = responseText;
  }

  if (!response.ok) {
    throw new Error(`QuickBooks API error (${response.status}): ${responseText}`);
  }

  return {
    status: response.status,
    data,
    service: 'QuickBooks',
    action,
  };
}

// --- Connection Testing ---

const CONNECTION_TEST_ENDPOINTS: Record<string, { url: string; method: string; tokenField: string }> = {
  GOOGLE_WORKSPACE: {
    url: 'https://www.googleapis.com/oauth2/v1/tokeninfo',
    method: 'GET',
    tokenField: 'accessToken',
  },
  SLACK: {
    url: 'https://slack.com/api/auth.test',
    method: 'POST',
    tokenField: 'botToken',
  },
  NOTION: {
    url: 'https://api.notion.com/v1/users/me',
    method: 'GET',
    tokenField: 'apiKey',
  },
  QUICKBOOKS: {
    url: 'https://quickbooks.api.intuit.com/v3/company',
    method: 'GET',
    tokenField: 'accessToken',
  },
};

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

    // Real connection test for managed integrations
    const testConfig = CONNECTION_TEST_ENDPOINTS[integration.type];
    if (testConfig) {
      const token = integration.credentials[testConfig.tokenField]
        ?? integration.credentials.accessToken
        ?? integration.credentials.botToken
        ?? integration.credentials.apiKey;

      if (!token) {
        return { connected: false, latencyMs: 0, error: 'No token available for connection test' };
      }

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      // Notion requires version header
      if (integration.type === 'NOTION') {
        headers['Notion-Version'] = NOTION_API_VERSION;
      }

      let url = testConfig.url;

      // Google tokeninfo uses query param
      if (integration.type === 'GOOGLE_WORKSPACE') {
        url = `${testConfig.url}?access_token=${encodeURIComponent(token)}`;
      }

      // QuickBooks needs realmId in URL
      if (integration.type === 'QUICKBOOKS') {
        const realmId = integration.credentials.realmId;
        url = `${testConfig.url}/${realmId}/companyinfo/${realmId}?minorversion=65`;
      }

      const response = await fetch(url, {
        method: testConfig.method,
        headers,
        signal: AbortSignal.timeout(10000),
      });

      const latencyMs = Date.now() - start;

      // Slack returns 200 even on auth failures; check 'ok' field
      if (integration.type === 'SLACK') {
        const data = await response.json() as Record<string, unknown>;
        const isOk = data.ok === true;
        return {
          connected: isOk,
          latencyMs,
          error: isOk ? undefined : `Slack auth test failed: ${data.error ?? 'unknown'}`,
        };
      }

      return {
        connected: response.ok,
        latencyMs,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    }

    // Fallback for unknown managed types
    const latencyMs = Date.now() - start;
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

// --- Simplified OAuth Helpers (provider as lowercase string, redirectUri as parameter) ---

/**
 * Environment variable names for OAuth client IDs by lowercase provider name.
 */
const OAUTH_CLIENT_ID_ENV: Record<string, string> = {
  google: 'GOOGLE_CLIENT_ID',
  slack: 'SLACK_CLIENT_ID',
  notion: 'NOTION_CLIENT_ID',
  quickbooks: 'QB_CLIENT_ID',
};

/**
 * Environment variable names for OAuth client secrets by lowercase provider name.
 */
const OAUTH_CLIENT_SECRET_ENV: Record<string, string> = {
  google: 'GOOGLE_CLIENT_SECRET',
  slack: 'SLACK_CLIENT_SECRET',
  notion: 'NOTION_CLIENT_SECRET',
  quickbooks: 'QB_CLIENT_SECRET',
};

/**
 * Token endpoint URLs by lowercase provider name.
 */
const OAUTH_TOKEN_URLS: Record<string, string> = {
  google: 'https://oauth2.googleapis.com/token',
  slack: 'https://slack.com/api/oauth.v2.access',
  notion: 'https://api.notion.com/v1/oauth/token',
  quickbooks: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
};

/**
 * Build an OAuth authorization URL for the given provider.
 * Uses a simple lowercase provider name and accepts redirectUri as a parameter.
 *
 * @param provider - Provider name: 'google', 'slack', 'notion', or 'quickbooks'
 * @param userId - A unique user/state identifier for CSRF protection
 * @param redirectUri - The OAuth redirect URI
 * @returns The full authorization URL
 */
export function buildOAuthUrl(provider: string, userId: string, redirectUri: string): string {
  const clientIdEnv = OAUTH_CLIENT_ID_ENV[provider];
  if (!clientIdEnv) {
    throw new Error(`Unsupported OAuth provider: ${provider}`);
  }

  const clientId = process.env[clientIdEnv];
  if (!clientId) {
    throw new Error(`Missing required environment variable: ${clientIdEnv}`);
  }

  switch (provider) {
    case 'google':
      return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=calendar.readonly+gmail.send&state=${userId}`;
    case 'slack':
      return `https://slack.com/oauth/v2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=chat:write,channels:read&state=${userId}`;
    case 'notion':
      return `https://api.notion.com/v1/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&owner=user&state=${userId}`;
    case 'quickbooks':
      return `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=com.intuit.quickbooks.accounting&state=${userId}`;
    default:
      throw new Error(`Unsupported OAuth provider: ${provider}`);
  }
}

/**
 * Exchange an authorization code for access and refresh tokens.
 * Uses a simple lowercase provider name and accepts redirectUri as a parameter.
 *
 * @param provider - Provider name: 'google', 'slack', 'notion', or 'quickbooks'
 * @param code - The authorization code received from the OAuth callback
 * @param redirectUri - The OAuth redirect URI used during authorization
 * @returns Token response with accessToken, optional refreshToken, and expiresIn
 */
export async function exchangeOAuthCode(
  provider: string,
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
  const clientIdEnv = OAUTH_CLIENT_ID_ENV[provider];
  const clientSecretEnv = OAUTH_CLIENT_SECRET_ENV[provider];
  if (!clientIdEnv || !clientSecretEnv) {
    throw new Error(`Unsupported OAuth provider: ${provider}`);
  }

  const tokenUrl = OAUTH_TOKEN_URLS[provider];
  if (!tokenUrl) {
    throw new Error(`Unsupported OAuth provider: ${provider}`);
  }

  const clientId = process.env[clientIdEnv];
  if (!clientId) {
    throw new Error(`Missing required environment variable: ${clientIdEnv}`);
  }

  const clientSecret = process.env[clientSecretEnv];
  if (!clientSecret) {
    throw new Error(`Missing required environment variable: ${clientSecretEnv}`);
  }

  try {
    let response: Response;

    if (provider === 'notion') {
      // Notion uses Basic auth header and JSON body
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      });
    } else if (provider === 'quickbooks') {
      // QuickBooks uses Basic auth header and form-encoded body
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }).toString(),
      });
    } else {
      // Google and Slack use form-encoded POST with client_id and client_secret in body
      response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${provider} OAuth token exchange failed (${response.status}): ${errorText}`);
    }

    const data = await response.json() as Record<string, unknown>;

    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string | undefined,
      expiresIn: (data.expires_in as number) ?? 3600,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('OAuth token exchange failed')) {
      throw err;
    }
    throw new Error(`${provider} OAuth token exchange error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Refresh an expired access token using a refresh token.
 * Uses a simple lowercase provider name.
 *
 * @param provider - Provider name: 'google', 'slack', 'notion', or 'quickbooks'
 * @param refreshToken - The refresh token stored from a previous authorization
 * @returns New access token and expiration
 */
export async function refreshOAuthToken(
  provider: string,
  refreshToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const clientIdEnv = OAUTH_CLIENT_ID_ENV[provider];
  const clientSecretEnv = OAUTH_CLIENT_SECRET_ENV[provider];
  if (!clientIdEnv || !clientSecretEnv) {
    throw new Error(`Unsupported OAuth provider: ${provider}`);
  }

  const tokenUrl = OAUTH_TOKEN_URLS[provider];
  if (!tokenUrl) {
    throw new Error(`Unsupported OAuth provider: ${provider}`);
  }

  const clientId = process.env[clientIdEnv];
  if (!clientId) {
    throw new Error(`Missing required environment variable: ${clientIdEnv}`);
  }

  const clientSecret = process.env[clientSecretEnv];
  if (!clientSecret) {
    throw new Error(`Missing required environment variable: ${clientSecretEnv}`);
  }

  try {
    let response: Response;

    if (provider === 'notion') {
      // Notion uses Basic auth and JSON body for refresh
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });
    } else if (provider === 'quickbooks') {
      // QuickBooks uses Basic auth and form-encoded body
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }).toString(),
      });
    } else {
      // Google and Slack use form-encoded POST
      response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }).toString(),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${provider} OAuth token refresh failed (${response.status}): ${errorText}`);
    }

    const data = await response.json() as Record<string, unknown>;

    return {
      accessToken: data.access_token as string,
      expiresIn: (data.expires_in as number) ?? 3600,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('OAuth token refresh failed')) {
      throw err;
    }
    throw new Error(`${provider} OAuth token refresh error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Execute an authenticated API action against an external provider.
 * Uses a simple lowercase provider name and a Bearer access token.
 *
 * @param provider - Provider name: 'google', 'slack', 'notion', or 'quickbooks'
 * @param action - The action/endpoint to call (e.g. 'calendar/v3/calendars/primary/events', 'chat.postMessage')
 * @param accessToken - A valid Bearer access token
 * @param params - Action-specific parameters
 * @returns The raw API response data
 */
export async function executeProviderAction(
  provider: string,
  action: string,
  accessToken: string,
  params: Record<string, unknown>
): Promise<unknown> {
  try {
    switch (provider) {
      case 'google': {
        const method = (params.method as string) ?? 'GET';
        let url = `https://www.googleapis.com/${action}`;

        if (method === 'GET' && Object.keys(params).length > 0) {
          const queryParams = new URLSearchParams();
          for (const [key, value] of Object.entries(params)) {
            if (key !== 'method' && value !== undefined && value !== null) {
              queryParams.set(key, String(value));
            }
          }
          const qs = queryParams.toString();
          if (qs) {
            url = `${url}?${qs}`;
          }
        }

        const fetchOptions: RequestInit = {
          method,
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        };

        if (method === 'POST') {
          const bodyParams = { ...params };
          delete bodyParams.method;
          fetchOptions.body = JSON.stringify(bodyParams);
        }

        const response = await fetch(url, fetchOptions);
        const responseText = await response.text();

        if (!response.ok) {
          throw new Error(`Google API error (${response.status}): ${responseText}`);
        }

        try {
          return JSON.parse(responseText);
        } catch {
          return responseText;
        }
      }

      case 'slack': {
        const url = `https://slack.com/api/${action}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify(params),
        });

        const data = await response.json() as Record<string, unknown>;

        if (!data.ok) {
          throw new Error(`Slack API error: ${data.error ?? 'unknown_error'}`);
        }

        return data;
      }

      case 'notion': {
        const method = (params.method as string) ?? 'POST';
        const url = `https://api.notion.com/v1/${action}`;

        const fetchOptions: RequestInit = {
          method,
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28',
          },
        };

        if (method === 'POST' || method === 'PATCH') {
          const bodyParams = { ...params };
          delete bodyParams.method;
          fetchOptions.body = JSON.stringify(bodyParams);
        }

        const response = await fetch(url, fetchOptions);
        const responseText = await response.text();

        if (!response.ok) {
          throw new Error(`Notion API error (${response.status}): ${responseText}`);
        }

        try {
          return JSON.parse(responseText);
        } catch {
          return responseText;
        }
      }

      case 'quickbooks': {
        const method = (params.method as string) ?? 'GET';
        const realmId = params.realmId as string;
        const url = `https://quickbooks.api.intuit.com/v3/company/${realmId}/${action}`;

        const fetchOptions: RequestInit = {
          method,
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        };

        if (method === 'POST') {
          const bodyParams = { ...params };
          delete bodyParams.method;
          delete bodyParams.realmId;
          fetchOptions.body = JSON.stringify(bodyParams);
        }

        const response = await fetch(url, fetchOptions);
        const responseText = await response.text();

        if (!response.ok) {
          throw new Error(`QuickBooks API error (${response.status}): ${responseText}`);
        }

        try {
          return JSON.parse(responseText);
        } catch {
          return responseText;
        }
      }

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  } catch (err) {
    if (err instanceof Error && (
      err.message.includes('API error') ||
      err.message.includes('Unsupported provider')
    )) {
      throw err;
    }
    throw new Error(`${provider} API call failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// --- Testing Helpers ---

export function clearIntegrationStore(): void {
  integrationStore.clear();
  integrationCounter = 0;
}
