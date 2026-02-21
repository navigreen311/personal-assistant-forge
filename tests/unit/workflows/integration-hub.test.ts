// @ts-nocheck
// ============================================================================
// Integration Hub — Unit Tests
// Tests OAuth flows, API connectors, CRUD, credential validation, and
// connection testing for Google, Slack, Notion, QuickBooks integrations.
// ============================================================================

import {
  registerIntegration,
  getIntegration,
  listIntegrations,
  updateIntegration,
  removeIntegration,
  validateCredentials,
  executeIntegration,
  executeIntegrationAction,
  testConnection,
  clearIntegrationStore,
  getAuthUrl,
  exchangeCode,
  refreshAccessToken,
  executeAction,
  buildOAuthUrl,
  exchangeOAuthCode,
  refreshOAuthToken,
  executeProviderAction,
} from '@/modules/workflows/services/integration-hub';
import type { IntegrationType } from '@/modules/workflows/types';

// ============================================================================
// Global fetch mock
// ============================================================================

const mockFetch = jest.fn() as jest.MockedFunction<typeof global.fetch>;
global.fetch = mockFetch;

function createMockResponse(
  body: unknown,
  options: { status?: number; ok?: boolean; headers?: Record<string, string> } = {}
): Response {
  const { status = 200, ok = true } = options;
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: new Headers(options.headers ?? {}),
    text: jest.fn().mockResolvedValue(bodyStr),
    json: jest.fn().mockResolvedValue(typeof body === 'string' ? JSON.parse(body) : body),
    body: null,
    bodyUsed: false,
    arrayBuffer: jest.fn(),
    blob: jest.fn(),
    clone: jest.fn(),
    formData: jest.fn(),
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',
  } as unknown as Response;
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(() => {
  clearIntegrationStore();
  mockFetch.mockReset();
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_REDIRECT_URI;
  delete process.env.SLACK_CLIENT_ID;
  delete process.env.SLACK_CLIENT_SECRET;
  delete process.env.NOTION_CLIENT_ID;
  delete process.env.NOTION_CLIENT_SECRET;
  delete process.env.QUICKBOOKS_CLIENT_ID;
  delete process.env.QUICKBOOKS_CLIENT_SECRET;
  delete process.env.QB_CLIENT_ID;
  delete process.env.QB_CLIENT_SECRET;
});

// ============================================================================
// CRUD Operations
// ============================================================================

describe('Integration Hub — CRUD', () => {
  it('should register and retrieve an integration', () => {
    const integration = registerIntegration({
      type: 'SLACK', name: 'My Slack', credentials: { botToken: 'xoxb-test-token' }, isActive: true,
    });
    expect(integration.id).toBeDefined();
    expect(integration.name).toBe('My Slack');
    const retrieved = getIntegration(integration.id);
    expect(retrieved).toEqual(integration);
  });

  it('should return null for non-existent integration', () => {
    expect(getIntegration('non-existent')).toBeNull();
  });

  it('should list all integrations', () => {
    registerIntegration({ type: 'SLACK', name: 'Slack 1', credentials: { botToken: 't1' }, isActive: true });
    registerIntegration({ type: 'NOTION', name: 'Notion 1', credentials: { apiKey: 'k1' }, isActive: false });
    expect(listIntegrations()).toHaveLength(2);
  });

  it('should list only active integrations', () => {
    registerIntegration({ type: 'SLACK', name: 'Active', credentials: { botToken: 't' }, isActive: true });
    registerIntegration({ type: 'NOTION', name: 'Inactive', credentials: { apiKey: 'k' }, isActive: false });
    const active = listIntegrations(true);
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe('Active');
  });

  it('should update an integration', () => {
    const integration = registerIntegration({ type: 'SLACK', name: 'Original', credentials: { botToken: 't' }, isActive: true });
    const updated = updateIntegration(integration.id, { name: 'Updated' });
    expect(updated?.name).toBe('Updated');
    expect(updated?.type).toBe('SLACK');
  });

  it('should return null when updating non-existent integration', () => {
    expect(updateIntegration('fake-id', { name: 'X' })).toBeNull();
  });

  it('should remove an integration', () => {
    const integration = registerIntegration({ type: 'SLACK', name: 'ToRemove', credentials: { botToken: 't' }, isActive: true });
    expect(removeIntegration(integration.id)).toBe(true);
    expect(getIntegration(integration.id)).toBeNull();
  });

  it('should return false when removing non-existent integration', () => {
    expect(removeIntegration('fake')).toBe(false);
  });
});

// ============================================================================
// Credential Validation
// ============================================================================

describe('Integration Hub — Credential Validation', () => {
  it('should validate SLACK credentials (requires botToken)', () => {
    expect(validateCredentials('SLACK', { botToken: 'xoxb-123' }).valid).toBe(true);
  });

  it('should report missing SLACK credentials', () => {
    const result = validateCredentials('SLACK', {});
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('botToken');
  });

  it('should report empty credential fields', () => {
    const result = validateCredentials('SLACK', { botToken: '  ' });
    expect(result.valid).toBe(false);
    expect(result.emptyFields).toContain('botToken');
  });

  it('should validate GOOGLE_WORKSPACE credentials', () => {
    expect(validateCredentials('GOOGLE_WORKSPACE', { clientId: 'id', clientSecret: 'secret', refreshToken: 'token' }).valid).toBe(true);
  });

  it('should validate QUICKBOOKS credentials', () => {
    expect(validateCredentials('QUICKBOOKS', { clientId: 'id', clientSecret: 'secret', realmId: 'realm', refreshToken: 'token' }).valid).toBe(true);
  });

  it('should validate NOTION credentials', () => {
    expect(validateCredentials('NOTION', { apiKey: 'secret_abc' }).valid).toBe(true);
  });

  it('should validate CUSTOM_REST credentials', () => {
    expect(validateCredentials('CUSTOM_REST', { apiKey: 'key' }).valid).toBe(true);
  });

  it('should validate CUSTOM_WEBHOOK credentials', () => {
    expect(validateCredentials('CUSTOM_WEBHOOK', { secret: 's' }).valid).toBe(true);
  });
});

// ============================================================================
// OAuth — getAuthUrl
// ============================================================================

describe('Integration Hub — getAuthUrl', () => {
  it('should build a Google OAuth URL with default scopes', () => {
    process.env.GOOGLE_CLIENT_ID = 'google-client-id';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/callback';
    const url = getAuthUrl('GOOGLE_WORKSPACE', 'user-123');
    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url).toContain('client_id=google-client-id');
    expect(url).toContain('state=user-123');
    expect(url).toContain('redirect_uri=');
    expect(url).toContain('access_type=offline');
    expect(url).toContain('prompt=consent');
    expect(url).toContain('calendar.readonly');
    expect(url).toContain('gmail.send');
    expect(url).toContain('drive.readonly');
  });

  it('should build a Google OAuth URL with custom scopes', () => {
    process.env.GOOGLE_CLIENT_ID = 'gid';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost/cb';
    const url = getAuthUrl('GOOGLE_WORKSPACE', 'u1', ['https://www.googleapis.com/auth/calendar']);
    expect(url).toContain('calendar');
    expect(url).not.toContain('gmail.send');
  });

  it('should build a Slack OAuth URL', () => {
    process.env.SLACK_CLIENT_ID = 'slack-id';
    const url = getAuthUrl('SLACK', 'user-456');
    expect(url).toContain('https://slack.com/oauth/v2/authorize');
    expect(url).toContain('client_id=slack-id');
    expect(url).toContain('state=user-456');
    expect(url).toContain('chat%3Awrite');
    expect(url).toContain('channels%3Aread');
  });

  it('should build a Notion OAuth URL with owner=user', () => {
    process.env.NOTION_CLIENT_ID = 'notion-id';
    const url = getAuthUrl('NOTION', 'user-789');
    expect(url).toContain('https://api.notion.com/v1/oauth/authorize');
    expect(url).toContain('client_id=notion-id');
    expect(url).toContain('owner=user');
  });

  it('should build a QuickBooks OAuth URL', () => {
    process.env.QUICKBOOKS_CLIENT_ID = 'qb-id';
    const url = getAuthUrl('QUICKBOOKS', 'user-101');
    expect(url).toContain('https://appcenter.intuit.com/connect/oauth2');
    expect(url).toContain('client_id=qb-id');
    expect(url).toContain('com.intuit.quickbooks.accounting');
  });

  it('should throw for unsupported provider', () => {
    expect(() => getAuthUrl('CUSTOM_REST', 'user')).toThrow('OAuth not supported for provider');
  });

  it('should throw when required env var is missing', () => {
    expect(() => getAuthUrl('GOOGLE_WORKSPACE', 'user')).toThrow('Missing required environment variable: GOOGLE_CLIENT_ID');
  });

  it('should throw when redirect URI env var is missing for Google', () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    expect(() => getAuthUrl('GOOGLE_WORKSPACE', 'user')).toThrow('Missing required environment variable: GOOGLE_REDIRECT_URI');
  });
});

// ============================================================================
// OAuth — exchangeCode
// ============================================================================

describe('Integration Hub — exchangeCode', () => {
  it('should exchange code for Google tokens', async () => {
    process.env.GOOGLE_CLIENT_ID = 'g-id';
    process.env.GOOGLE_CLIENT_SECRET = 'g-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost/cb';
    mockFetch.mockResolvedValueOnce(createMockResponse({ access_token: 'ya29.access', refresh_token: '1//refresh', token_type: 'Bearer', expires_in: 3600 }));
    const result = await exchangeCode('GOOGLE_WORKSPACE', 'auth-code-123');
    expect(result.access_token).toBe('ya29.access');
    expect(result.refresh_token).toBe('1//refresh');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(options?.method).toBe('POST');
    expect(options?.headers).toHaveProperty('Content-Type', 'application/x-www-form-urlencoded');
    const body = options?.body as string;
    expect(body).toContain('code=auth-code-123');
    expect(body).toContain('grant_type=authorization_code');
    expect(body).toContain('client_id=g-id');
    expect(body).toContain('client_secret=g-secret');
  });

  it('should exchange code for Slack tokens', async () => {
    process.env.SLACK_CLIENT_ID = 's-id';
    process.env.SLACK_CLIENT_SECRET = 's-secret';
    mockFetch.mockResolvedValueOnce(createMockResponse({ access_token: 'xoxb-slack-token', token_type: 'bot' }));
    const result = await exchangeCode('SLACK', 'slack-code');
    expect(result.access_token).toBe('xoxb-slack-token');
  });

  it('should exchange code for Notion tokens using Basic auth', async () => {
    process.env.NOTION_CLIENT_ID = 'n-id';
    process.env.NOTION_CLIENT_SECRET = 'n-secret';
    mockFetch.mockResolvedValueOnce(createMockResponse({ access_token: 'secret_notion_token', token_type: 'bearer' }));
    const result = await exchangeCode('NOTION', 'notion-code');
    expect(result.access_token).toBe('secret_notion_token');
    const [, options] = mockFetch.mock.calls[0];
    const authHeader = (options?.headers as Record<string, string>)['Authorization'];
    expect(authHeader).toContain('Basic ');
    expect(options?.headers).toHaveProperty('Content-Type', 'application/json');
  });

  it('should exchange code for QuickBooks tokens with Basic auth', async () => {
    process.env.QUICKBOOKS_CLIENT_ID = 'qb-id';
    process.env.QUICKBOOKS_CLIENT_SECRET = 'qb-secret';
    mockFetch.mockResolvedValueOnce(createMockResponse({ access_token: 'qb-access-token', refresh_token: 'qb-refresh-token', token_type: 'bearer', expires_in: 3600 }));
    const result = await exchangeCode('QUICKBOOKS', 'qb-auth-code');
    expect(result.access_token).toBe('qb-access-token');
    expect(result.refresh_token).toBe('qb-refresh-token');
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer');
    const authHeader = (options?.headers as Record<string, string>)['Authorization'];
    expect(authHeader).toContain('Basic ');
  });

  it('should throw on failed token exchange', async () => {
    process.env.GOOGLE_CLIENT_ID = 'g-id';
    process.env.GOOGLE_CLIENT_SECRET = 'g-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost/cb';
    mockFetch.mockResolvedValueOnce(createMockResponse('{"error": "invalid_grant"}', { status: 400, ok: false }));
    await expect(exchangeCode('GOOGLE_WORKSPACE', 'expired-code')).rejects.toThrow('GOOGLE_WORKSPACE token exchange failed (400)');
  });

  it('should throw for unsupported provider', async () => {
    await expect(exchangeCode('CUSTOM_REST', 'code')).rejects.toThrow('OAuth not supported for provider');
  });

  it('should throw on missing env var during exchange', async () => {
    await expect(exchangeCode('GOOGLE_WORKSPACE', 'code')).rejects.toThrow('Missing required environment variable: GOOGLE_CLIENT_ID');
  });
});

// ============================================================================
// OAuth — refreshAccessToken
// ============================================================================

describe('Integration Hub — refreshAccessToken', () => {
  it('should refresh a Google access token', async () => {
    process.env.GOOGLE_CLIENT_ID = 'g-id';
    process.env.GOOGLE_CLIENT_SECRET = 'g-secret';
    mockFetch.mockResolvedValueOnce(createMockResponse({ access_token: 'new-access-token', token_type: 'Bearer', expires_in: 3600 }));
    const result = await refreshAccessToken('GOOGLE_WORKSPACE', 'old-refresh-token');
    expect(result.access_token).toBe('new-access-token');
    const body = mockFetch.mock.calls[0][1]?.body as string;
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain('refresh_token=old-refresh-token');
  });

  it('should refresh a Slack access token', async () => {
    process.env.SLACK_CLIENT_ID = 's-id';
    process.env.SLACK_CLIENT_SECRET = 's-secret';
    mockFetch.mockResolvedValueOnce(createMockResponse({ access_token: 'new-slack-token', token_type: 'bot' }));
    const result = await refreshAccessToken('SLACK', 'slack-refresh');
    expect(result.access_token).toBe('new-slack-token');
  });

  it('should refresh a QuickBooks token with Basic auth', async () => {
    process.env.QUICKBOOKS_CLIENT_ID = 'qb-id';
    process.env.QUICKBOOKS_CLIENT_SECRET = 'qb-secret';
    mockFetch.mockResolvedValueOnce(createMockResponse({ access_token: 'new-qb-token', refresh_token: 'new-qb-refresh', token_type: 'bearer' }));
    const result = await refreshAccessToken('QUICKBOOKS', 'qb-old-refresh');
    expect(result.access_token).toBe('new-qb-token');
    const authHeader = (mockFetch.mock.calls[0][1]?.headers as Record<string, string>)['Authorization'];
    expect(authHeader).toContain('Basic ');
  });

  it('should refresh a Notion token using JSON body', async () => {
    process.env.NOTION_CLIENT_ID = 'n-id';
    process.env.NOTION_CLIENT_SECRET = 'n-secret';
    mockFetch.mockResolvedValueOnce(createMockResponse({ access_token: 'new-notion-token', token_type: 'bearer' }));
    const result = await refreshAccessToken('NOTION', 'notion-refresh');
    expect(result.access_token).toBe('new-notion-token');
    const contentType = (mockFetch.mock.calls[0][1]?.headers as Record<string, string>)['Content-Type'];
    expect(contentType).toBe('application/json');
  });

  it('should throw on failed token refresh', async () => {
    process.env.GOOGLE_CLIENT_ID = 'g-id';
    process.env.GOOGLE_CLIENT_SECRET = 'g-secret';
    mockFetch.mockResolvedValueOnce(createMockResponse('{"error": "invalid_token"}', { status: 401, ok: false }));
    await expect(refreshAccessToken('GOOGLE_WORKSPACE', 'bad-refresh')).rejects.toThrow('GOOGLE_WORKSPACE token refresh failed (401)');
  });

  it('should throw for unsupported provider', async () => {
    await expect(refreshAccessToken('CUSTOM_WEBHOOK', 'token')).rejects.toThrow('OAuth not supported for provider');
  });
});

// ============================================================================
// executeAction — High-Level Provider API Calls
// ============================================================================

describe('Integration Hub — executeAction', () => {
  describe('Google Workspace', () => {
    it('should list calendar events', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ items: [{ id: 'event-1', summary: 'Meeting' }] }));
      const result = await executeAction('GOOGLE_WORKSPACE', 'calendar.list', { accessToken: 'ya29.test' }, { maxResults: '10' });
      expect(result.service).toBe('Google Workspace');
      expect(result.action).toBe('calendar.list');
      expect(result.status).toBe(200);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('googleapis.com/calendar/v3');
      expect(url).toContain('maxResults=10');
    });

    it('should send a Gmail message', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ id: 'msg-id', threadId: 'thread-id' }));
      const result = await executeAction('GOOGLE_WORKSPACE', 'gmail.send', { accessToken: 'ya29.test' }, { raw: 'base64-encoded-email' });
      expect(result.action).toBe('gmail.send');
      expect(mockFetch.mock.calls[0][1]?.method).toBe('POST');
    });

    it('should throw for missing accessToken', async () => {
      await expect(executeAction('GOOGLE_WORKSPACE', 'calendar.list', {}, {})).rejects.toThrow('Google API requires an accessToken credential');
    });

    it('should throw for unsupported Google action', async () => {
      await expect(executeAction('GOOGLE_WORKSPACE', 'unsupported.action', { accessToken: 'token' }, {})).rejects.toThrow('Unsupported Google action');
    });

    it('should throw on Google API error response', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse('{"error": {"message": "Not Found"}}', { status: 404, ok: false }));
      await expect(executeAction('GOOGLE_WORKSPACE', 'calendar.list', { accessToken: 'token' }, {})).rejects.toThrow('Google API error (404)');
    });
  });

  describe('Slack', () => {
    it('should send a message via chat.postMessage', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ ok: true, channel: 'C123', ts: '1234567890.123456', message: { text: 'Hello' } }));
      const result = await executeAction('SLACK', 'chat.postMessage', { botToken: 'xoxb-test' }, { channel: 'C123', text: 'Hello' });
      expect(result.service).toBe('Slack');
      expect(result.action).toBe('chat.postMessage');
      expect(result.status).toBe(200);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://slack.com/api/chat.postMessage');
      expect(options?.method).toBe('POST');
      expect((options?.headers as Record<string, string>)['Authorization']).toBe('Bearer xoxb-test');
    });

    it('should throw when Slack API returns ok:false', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ ok: false, error: 'channel_not_found' }));
      await expect(executeAction('SLACK', 'chat.postMessage', { botToken: 'xoxb-test' }, { channel: 'bad', text: 'hi' })).rejects.toThrow('Slack API error: channel_not_found');
    });

    it('should throw for missing botToken', async () => {
      await expect(executeAction('SLACK', 'chat.postMessage', {}, {})).rejects.toThrow('Slack API requires a botToken or accessToken credential');
    });

    it('should throw for unsupported Slack action', async () => {
      await expect(executeAction('SLACK', 'nonexistent.method', { botToken: 'xoxb-test' }, {})).rejects.toThrow('Unsupported Slack action');
    });
  });

  describe('Notion', () => {
    it('should query a database', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ results: [{ id: 'page-1', object: 'page' }], has_more: false }));
      const result = await executeAction('NOTION', 'databases.query', { apiKey: 'secret_notion' }, { id: 'db-id-123', filter: { property: 'Status', status: { equals: 'Done' } } });
      expect(result.service).toBe('Notion');
      expect(result.action).toBe('databases.query');
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('databases/db-id-123/query');
      expect((options?.headers as Record<string, string>)['Notion-Version']).toBe('2022-06-28');
    });

    it('should throw for missing apiKey', async () => {
      await expect(executeAction('NOTION', 'search', {}, {})).rejects.toThrow('Notion API requires an apiKey or accessToken credential');
    });

    it('should throw on Notion API error response', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse('{"object":"error","status":400,"code":"validation_error"}', { status: 400, ok: false }));
      await expect(executeAction('NOTION', 'databases.query', { apiKey: 'secret_notion' }, { id: 'bad-db' })).rejects.toThrow('Notion API error (400)');
    });
  });

  describe('QuickBooks', () => {
    it('should get company info', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ CompanyInfo: { CompanyName: 'Test Corp', Id: '123' } }));
      const result = await executeAction('QUICKBOOKS', 'companyinfo.get', { accessToken: 'qb-token', realmId: '123456' }, {});
      expect(result.service).toBe('QuickBooks');
      expect(result.action).toBe('companyinfo.get');
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('quickbooks.api.intuit.com/v3/company/123456/companyinfo/123456');
      expect((options?.headers as Record<string, string>)['Authorization']).toBe('Bearer qb-token');
    });

    it('should throw for missing accessToken', async () => {
      await expect(executeAction('QUICKBOOKS', 'invoice.query', { realmId: '123' }, {})).rejects.toThrow('QuickBooks API requires an accessToken credential');
    });

    it('should throw for missing realmId', async () => {
      await expect(executeAction('QUICKBOOKS', 'invoice.query', { accessToken: 'token' }, {})).rejects.toThrow('QuickBooks API requires a realmId credential');
    });

    it('should throw on QuickBooks API error response', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse('{"Fault":{"Error":[{"Message":"Auth failure"}]}}', { status: 401, ok: false }));
      await expect(executeAction('QUICKBOOKS', 'companyinfo.get', { accessToken: 'bad-token', realmId: '123' }, {})).rejects.toThrow('QuickBooks API error (401)');
    });
  });

  it('should throw for unsupported provider in executeAction', async () => {
    await expect(executeAction('CUSTOM_REST' as IntegrationType, 'action', {}, {})).rejects.toThrow('executeAction not supported for provider');
  });
});

// ============================================================================
// executeIntegration — Type-Based Execution
// ============================================================================

describe('Integration Hub — executeIntegration', () => {
  it('should fail with missing credentials', async () => {
    const result = await executeIntegration('SLACK', { name: 'Bad Slack', credentials: {} }, { action: 'chat.postMessage', params: {} });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Credential validation failed');
    expect(result.error).toContain('botToken');
  });

  it('should support dry-run mode', async () => {
    const result = await executeIntegration('SLACK', { name: 'Slack Dry', credentials: { botToken: 'xoxb-test' } }, { action: 'chat.postMessage', params: { channel: 'C1', text: 'Hello' } }, { dryRun: true });
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.data.wouldExecute).toBe('SLACK/chat.postMessage');
    expect(result.data.description).toContain('Slack');
  });

  it('should execute a real Slack action through the connector', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse({ ok: true, channel: 'C123', ts: '123.456', message: { text: 'Hi' } }));
    const result = await executeIntegration('SLACK', { name: 'My Slack', credentials: { botToken: 'xoxb-real' } }, { action: 'chat.postMessage', params: { channel: 'C123', text: 'Hi' } });
    expect(result.success).toBe(true);
    expect(result.type).toBe('SLACK');
    expect(result.action).toBe('chat.postMessage');
    expect(result.dryRun).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should handle connector errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse({ ok: false, error: 'not_authed' }));
    const result = await executeIntegration('SLACK', { credentials: { botToken: 'xoxb-bad' } }, { action: 'chat.postMessage', params: { channel: 'C1', text: 'Hi' } });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Slack API error');
  });
});

// ============================================================================
// executeIntegrationAction — Registered Integration Execution
// ============================================================================

describe('Integration Hub — executeIntegrationAction', () => {
  it('should throw for non-existent integration', async () => {
    await expect(executeIntegrationAction('fake-id', 'action', {})).rejects.toThrow('Integration fake-id not found');
  });

  it('should throw for inactive integration', async () => {
    const integration = registerIntegration({ type: 'SLACK', name: 'Inactive Slack', credentials: { botToken: 'token' }, isActive: false });
    await expect(executeIntegrationAction(integration.id, 'chat.postMessage', {})).rejects.toThrow('is not active');
  });

  it('should return credential error for invalid credentials', async () => {
    const integration = registerIntegration({ type: 'SLACK', name: 'Bad Creds', credentials: {}, isActive: true });
    const result = await executeIntegrationAction(integration.id, 'chat.postMessage', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Credential validation failed');
  });

  it('should execute a registered Slack integration action', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse({ ok: true, channel: 'C123', ts: '123', message: { text: 'Hello' } }));
    const integration = registerIntegration({ type: 'SLACK', name: 'My Slack', credentials: { botToken: 'xoxb-valid' }, isActive: true });
    const result = await executeIntegrationAction(integration.id, 'chat.postMessage', { channel: 'C123', text: 'Hello' });
    expect(result.success).toBe(true);
    expect(result.integration).toBe('My Slack');
    expect(result.type).toBe('SLACK');
    expect(result.action).toBe('chat.postMessage');
  });
});

// ============================================================================
// Connection Testing
// ============================================================================

describe('Integration Hub — testConnection', () => {
  it('should return error for non-existent integration', async () => {
    const result = await testConnection('fake-id');
    expect(result.connected).toBe(false);
    expect(result.error).toBe('Integration not found');
  });

  it('should return error for invalid credentials', async () => {
    const integration = registerIntegration({ type: 'SLACK', name: 'Bad Slack', credentials: {}, isActive: true });
    const result = await testConnection(integration.id);
    expect(result.connected).toBe(false);
    expect(result.error).toContain('missing credentials');
  });

  it('should test Slack connection via auth.test', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse({ ok: true, url: 'https://team.slack.com', team: 'Test Team', user: 'bot' }));
    const integration = registerIntegration({ type: 'SLACK', name: 'Slack Test', credentials: { botToken: 'xoxb-valid' }, isActive: true });
    const result = await testConnection(integration.id);
    expect(result.connected).toBe(true);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://slack.com/api/auth.test');
  });

  it('should handle network errors during connection test', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const integration = registerIntegration({ type: 'SLACK', name: 'Unreachable Slack', credentials: { botToken: 'xoxb-valid' }, isActive: true });
    const result = await testConnection(integration.id);
    expect(result.connected).toBe(false);
    expect(result.error).toBe('ECONNREFUSED');
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Integration Hub — Edge Cases', () => {
  it('should handle unsupported integration type in executeIntegration', async () => {
    const result = await executeIntegration('UNKNOWN_TYPE' as IntegrationType, { credentials: {} }, { action: 'test', params: {} });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported integration type');
  });

  it('should include timestamp in all responses', async () => {
    const result = await executeIntegration('SLACK', { credentials: {} }, { action: 'test', params: {} });
    expect(result.timestamp).toBeDefined();
    expect(new Date(result.timestamp).getTime()).not.toBeNaN();
  });

  it('should clear integration store', () => {
    registerIntegration({ type: 'SLACK', name: 'A', credentials: { botToken: 't' }, isActive: true });
    registerIntegration({ type: 'NOTION', name: 'B', credentials: { apiKey: 'k' }, isActive: true });
    expect(listIntegrations()).toHaveLength(2);
    clearIntegrationStore();
    expect(listIntegrations()).toHaveLength(0);
  });
});

// ============================================================================
// buildOAuthUrl — Simplified OAuth URL Builder
// ============================================================================

describe('Integration Hub — buildOAuthUrl', () => {
  it('should build a Google OAuth URL with correct scopes and state', () => {
    process.env.GOOGLE_CLIENT_ID = 'my-google-id';
    const url = buildOAuthUrl('google', 'user-abc', 'http://localhost:3000/callback');
    expect(url).toBe('https://accounts.google.com/o/oauth2/v2/auth?client_id=my-google-id&redirect_uri=http://localhost:3000/callback&response_type=code&scope=calendar.readonly+gmail.send&state=user-abc');
  });

  it('should build a Slack OAuth URL with comma-separated scopes', () => {
    process.env.SLACK_CLIENT_ID = 'my-slack-id';
    const url = buildOAuthUrl('slack', 'user-456', 'http://localhost:3000/slack/callback');
    expect(url).toBe('https://slack.com/oauth/v2/authorize?client_id=my-slack-id&redirect_uri=http://localhost:3000/slack/callback&scope=chat:write,channels:read&state=user-456');
  });

  it('should build a Notion OAuth URL with owner=user', () => {
    process.env.NOTION_CLIENT_ID = 'my-notion-id';
    const url = buildOAuthUrl('notion', 'user-789', 'http://localhost:3000/notion/callback');
    expect(url).toBe('https://api.notion.com/v1/oauth/authorize?client_id=my-notion-id&redirect_uri=http://localhost:3000/notion/callback&response_type=code&owner=user&state=user-789');
  });

  it('should build a QuickBooks OAuth URL with accounting scope', () => {
    process.env.QB_CLIENT_ID = 'my-qb-id';
    const url = buildOAuthUrl('quickbooks', 'user-101', 'http://localhost:3000/qb/callback');
    expect(url).toBe('https://appcenter.intuit.com/connect/oauth2?client_id=my-qb-id&redirect_uri=http://localhost:3000/qb/callback&response_type=code&scope=com.intuit.quickbooks.accounting&state=user-101');
  });

  it('should throw for unsupported provider', () => {
    expect(() => buildOAuthUrl('twitter', 'user', 'http://localhost/cb')).toThrow('Unsupported OAuth provider: twitter');
  });

  it('should throw when client ID env var is missing', () => {
    expect(() => buildOAuthUrl('google', 'user', 'http://localhost/cb')).toThrow('Missing required environment variable: GOOGLE_CLIENT_ID');
  });

  it('should throw when Slack client ID env var is missing', () => {
    expect(() => buildOAuthUrl('slack', 'user', 'http://localhost/cb')).toThrow('Missing required environment variable: SLACK_CLIENT_ID');
  });

  it('should throw when QB client ID env var is missing', () => {
    expect(() => buildOAuthUrl('quickbooks', 'user', 'http://localhost/cb')).toThrow('Missing required environment variable: QB_CLIENT_ID');
  });
});

// ============================================================================
// exchangeOAuthCode — Simplified Token Exchange
// ============================================================================

describe('Integration Hub — exchangeOAuthCode', () => {
  it('should exchange code for Google tokens with form-encoded body', async () => {
    process.env.GOOGLE_CLIENT_ID = 'g-id';
    process.env.GOOGLE_CLIENT_SECRET = 'g-secret';
    mockFetch.mockResolvedValueOnce(createMockResponse({ access_token: 'ya29.google-access', refresh_token: '1//google-refresh', expires_in: 3600 }));
    const result = await exchangeOAuthCode('google', 'auth-code-123', 'http://localhost/cb');
    expect(result.accessToken).toBe('ya29.google-access');
    expect(result.refreshToken).toBe('1//google-refresh');
    expect(result.expiresIn).toBe(3600);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(options?.method).toBe('POST');
    expect(options?.headers).toHaveProperty('Content-Type', 'application/x-www-form-urlencoded');
    const body = options?.body as string;
    expect(body).toContain('client_id=g-id');
    expect(body).toContain('client_secret=g-secret');
    expect(body).toContain('code=auth-code-123');
    expect(body).toContain('redirect_uri=http');
    expect(body).toContain('grant_type=authorization_code');
  });

  it('should exchange code for Slack tokens', async () => {
    process.env.SLACK_CLIENT_ID = 's-id';
    process.env.SLACK_CLIENT_SECRET = 's-secret';
    mockFetch.mockResolvedValueOnce(createMockResponse({ access_token: 'xoxb-slack-token', expires_in: 7200 }));
    const result = await exchangeOAuthCode('slack', 'slack-code', 'http://localhost/slack/cb');
    expect(result.accessToken).toBe('xoxb-slack-token');
    expect(result.expiresIn).toBe(7200);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://slack.com/api/oauth.v2.access');
  });

  it('should exchange code for Notion tokens with Basic auth and JSON body', async () => {
    process.env.NOTION_CLIENT_ID = 'n-id';
    process.env.NOTION_CLIENT_SECRET = 'n-secret';
    mockFetch.mockResolvedValueOnce(createMockResponse({ access_token: 'secret_notion_token', expires_in: 3600 }));
    const result = await exchangeOAuthCode('notion', 'notion-code', 'http://localhost/notion/cb');
    expect(result.accessToken).toBe('secret_notion_token');
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.notion.com/v1/oauth/token');
    const authHeader = (options?.headers as Record<string, string>)['Authorization'];
    expect(authHeader).toContain('Basic ');
    expect(options?.headers).toHaveProperty('Content-Type', 'application/json');
    const body = JSON.parse(options?.body as string);
    expect(body.grant_type).toBe('authorization_code');
    expect(body.code).toBe('notion-code');
    expect(body.redirect_uri).toBe('http://localhost/notion/cb');
  });

  it('should exchange code for QuickBooks tokens with Basic auth', async () => {
    process.env.QB_CLIENT_ID = 'qb-id';
    process.env.QB_CLIENT_SECRET = 'qb-secret';
    mockFetch.mockResolvedValueOnce(createMockResponse({ access_token: 'qb-access-token', refresh_token: 'qb-refresh-token', expires_in: 3600 }));
    const result = await exchangeOAuthCode('quickbooks', 'qb-code', 'http://localhost/qb/cb');
    expect(result.accessToken).toBe('qb-access-token');
    expect(result.refreshToken).toBe('qb-refresh-token');
    expect(result.expiresIn).toBe(3600);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer');
    const authHeader = (options?.headers as Record<string, string>)['Authorization'];
    expect(authHeader).toContain('Basic ');
    expect(options?.headers).toHaveProperty('Content-Type', 'application/x-www-form-urlencoded');
  });

  it('should throw on failed token exchange', async () => {
    process.env.GOOGLE_CLIENT_ID = 'g-id';
    process.env.GOOGLE_CLIENT_SECRET = 'g-secret';
    mockFetch.mockResolvedValueOnce(createMockResponse('{"error": "invalid_grant"}', { status: 400, ok: false }));
    await expect(exchangeOAuthCode('google', 'bad-code', 'http://localhost/cb')).rejects.toThrow('google OAuth token exchange failed (400)');
  });

  it('should throw for unsupported provider', async () => {
    await expect(exchangeOAuthCode('twitter', 'code', 'http://localhost/cb')).rejects.toThrow('Unsupported OAuth provider: twitter');
  });

  it('should throw when client ID env var is missing', async () => {
    await expect(exchangeOAuthCode('google', 'code', 'http://localhost/cb')).rejects.toThrow('Missing required environment variable: GOOGLE_CLIENT_ID');
  });

  it('should throw when client secret env var is missing', async () => {
    process.env.GOOGLE_CLIENT_ID = 'g-id';
    await expect(exchangeOAuthCode('google', 'code', 'http://localhost/cb')).rejects.toThrow('Missing required environment variable: GOOGLE_CLIENT_SECRET');
  });

  it('should default expiresIn to 3600 when not in response', async () => {
    process.env.SLACK_CLIENT_ID = 's-id';
    process.env.SLACK_CLIENT_SECRET = 's-secret';
    mockFetch.mockResolvedValueOnce(createMockResponse({ access_token: 'xoxb-token' }));
    const result = await exchangeOAuthCode('slack', 'code', 'http://localhost/cb');
    expect(result.expiresIn).toBe(3600);
  });
});

// ============================================================================
// refreshOAuthToken — Simplified Token Refresh
// ============================================================================

describe('Integration Hub — refreshOAuthToken', () => {
  it('should refresh a Google access token', async () => {
    process.env.GOOGLE_CLIENT_ID = 'g-id';
    process.env.GOOGLE_CLIENT_SECRET = 'g-secret';
    mockFetch.mockResolvedValueOnce(createMockResponse({ access_token: 'new-google-token', expires_in: 3600 }));
    const result = await refreshOAuthToken('google', 'old-refresh-token');
    expect(result.accessToken).toBe('new-google-token');
    expect(result.expiresIn).toBe(3600);
    const body = mockFetch.mock.calls[0][1]?.body as string;
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain('refresh_token=old-refresh-token');
    expect(body).toContain('client_id=g-id');
    expect(body).toContain('client_secret=g-secret');
  });

  it('should refresh a Slack access token', async () => {
    process.env.SLACK_CLIENT_ID = 's-id';
    process.env.SLACK_CLIENT_SECRET = 's-secret';
    mockFetch.mockResolvedValueOnce(createMockResponse({ access_token: 'new-slack-token', expires_in: 7200 }));
    const result = await refreshOAuthToken('slack', 'slack-refresh');
    expect(result.accessToken).toBe('new-slack-token');
    expect(result.expiresIn).toBe(7200);
  });

  it('should refresh a Notion token with Basic auth and JSON body', async () => {
    process.env.NOTION_CLIENT_ID = 'n-id';
    process.env.NOTION_CLIENT_SECRET = 'n-secret';
    mockFetch.mockResolvedValueOnce(createMockResponse({ access_token: 'new-notion-token', expires_in: 3600 }));
    const result = await refreshOAuthToken('notion', 'notion-refresh');
    expect(result.accessToken).toBe('new-notion-token');
    const [, options] = mockFetch.mock.calls[0];
    const authHeader = (options?.headers as Record<string, string>)['Authorization'];
    expect(authHeader).toContain('Basic ');
    expect(options?.headers).toHaveProperty('Content-Type', 'application/json');
    const body = JSON.parse(options?.body as string);
    expect(body.grant_type).toBe('refresh_token');
    expect(body.refresh_token).toBe('notion-refresh');
  });

  it('should refresh a QuickBooks token with Basic auth', async () => {
    process.env.QB_CLIENT_ID = 'qb-id';
    process.env.QB_CLIENT_SECRET = 'qb-secret';
    mockFetch.mockResolvedValueOnce(createMockResponse({ access_token: 'new-qb-token', expires_in: 3600 }));
    const result = await refreshOAuthToken('quickbooks', 'qb-refresh');
    expect(result.accessToken).toBe('new-qb-token');
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer');
    const authHeader = (options?.headers as Record<string, string>)['Authorization'];
    expect(authHeader).toContain('Basic ');
  });

  it('should throw on failed token refresh', async () => {
    process.env.GOOGLE_CLIENT_ID = 'g-id';
    process.env.GOOGLE_CLIENT_SECRET = 'g-secret';
    mockFetch.mockResolvedValueOnce(createMockResponse('{"error": "invalid_token"}', { status: 401, ok: false }));
    await expect(refreshOAuthToken('google', 'bad-refresh')).rejects.toThrow('google OAuth token refresh failed (401)');
  });

  it('should throw for unsupported provider', async () => {
    await expect(refreshOAuthToken('twitter', 'token')).rejects.toThrow('Unsupported OAuth provider: twitter');
  });

  it('should throw when client ID env var is missing', async () => {
    await expect(refreshOAuthToken('google', 'token')).rejects.toThrow('Missing required environment variable: GOOGLE_CLIENT_ID');
  });

  it('should default expiresIn to 3600 when not in response', async () => {
    process.env.GOOGLE_CLIENT_ID = 'g-id';
    process.env.GOOGLE_CLIENT_SECRET = 'g-secret';
    mockFetch.mockResolvedValueOnce(createMockResponse({ access_token: 'token' }));
    const result = await refreshOAuthToken('google', 'refresh');
    expect(result.expiresIn).toBe(3600);
  });
});

// ============================================================================
// executeProviderAction — Simplified Authenticated API Calls
// ============================================================================

describe('Integration Hub — executeProviderAction', () => {
  describe('Google', () => {
    it('should make a GET request to Google Calendar API', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ items: [{ id: 'event-1', summary: 'Meeting' }] }));
      const result = await executeProviderAction('google', 'calendar/v3/calendars/primary/events', 'ya29.test-token', { maxResults: '10' });
      expect(result).toEqual({ items: [{ id: 'event-1', summary: 'Meeting' }] });
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('googleapis.com/calendar/v3/calendars/primary/events');
      expect(url).toContain('maxResults=10');
      expect(options?.method).toBe('GET');
      expect((options?.headers as Record<string, string>)['Authorization']).toBe('Bearer ya29.test-token');
    });

    it('should make a POST request to Gmail API', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ id: 'msg-id', threadId: 'thread-id' }));
      const result = await executeProviderAction('google', 'gmail/v1/users/me/messages/send', 'ya29.test-token', { method: 'POST', raw: 'base64-email' });
      expect(result).toHaveProperty('id', 'msg-id');
      expect(mockFetch.mock.calls[0][1]?.method).toBe('POST');
    });

    it('should throw on Google API error response', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse('{"error": {"message": "Not Found"}}', { status: 404, ok: false }));
      await expect(executeProviderAction('google', 'calendar/v3/bad', 'token', {})).rejects.toThrow('Google API error (404)');
    });
  });

  describe('Slack', () => {
    it('should POST to Slack API with Bearer token', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ ok: true, channel: 'C123', ts: '123.456', message: { text: 'Hello' } }));
      const result = await executeProviderAction('slack', 'chat.postMessage', 'xoxb-test-token', { channel: 'C123', text: 'Hello' });
      expect(result).toHaveProperty('ok', true);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://slack.com/api/chat.postMessage');
      expect(options?.method).toBe('POST');
      expect((options?.headers as Record<string, string>)['Authorization']).toBe('Bearer xoxb-test-token');
    });

    it('should throw when Slack API returns ok:false', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ ok: false, error: 'channel_not_found' }));
      await expect(executeProviderAction('slack', 'chat.postMessage', 'token', { channel: 'bad' })).rejects.toThrow('Slack API error: channel_not_found');
    });
  });

  describe('Notion', () => {
    it('should POST to Notion API with Bearer token and Notion-Version header', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ results: [{ id: 'page-1', object: 'page' }], has_more: false }));
      const result = await executeProviderAction('notion', 'databases/db-123/query', 'secret_notion_token', { filter: { property: 'Status', status: { equals: 'Done' } } });
      expect(result).toHaveProperty('results');
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.notion.com/v1/databases/db-123/query');
      expect(options?.method).toBe('POST');
      expect((options?.headers as Record<string, string>)['Authorization']).toBe('Bearer secret_notion_token');
      expect((options?.headers as Record<string, string>)['Notion-Version']).toBe('2022-06-28');
    });

    it('should support GET requests to Notion API', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ object: 'user', id: 'user-id' }));
      const result = await executeProviderAction('notion', 'users/me', 'secret_token', { method: 'GET' });
      expect(result).toHaveProperty('object', 'user');
      expect(mockFetch.mock.calls[0][1]?.method).toBe('GET');
    });

    it('should throw on Notion API error response', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse('{"object":"error","status":400}', { status: 400, ok: false }));
      await expect(executeProviderAction('notion', 'search', 'token', {})).rejects.toThrow('Notion API error (400)');
    });
  });

  describe('QuickBooks', () => {
    it('should make a GET request with realmId in URL', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ CompanyInfo: { CompanyName: 'Test Corp' } }));
      const result = await executeProviderAction('quickbooks', 'companyinfo/123456', 'qb-access-token', { realmId: '123456' });
      expect(result).toHaveProperty('CompanyInfo');
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('quickbooks.api.intuit.com/v3/company/123456/companyinfo/123456');
      expect((options?.headers as Record<string, string>)['Authorization']).toBe('Bearer qb-access-token');
    });

    it('should make a POST request to create an invoice', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ Invoice: { Id: 'inv-1', TotalAmt: 100 } }));
      const result = await executeProviderAction('quickbooks', 'invoice', 'qb-token', { method: 'POST', realmId: '123456', Line: [{ Amount: 100 }], CustomerRef: { value: 'cust-1' } });
      expect(result).toHaveProperty('Invoice');
      expect(mockFetch.mock.calls[0][1]?.method).toBe('POST');
    });

    it('should throw on QuickBooks API error response', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse('{"Fault":{"Error":[{"Message":"Auth failure"}]}}', { status: 401, ok: false }));
      await expect(executeProviderAction('quickbooks', 'companyinfo/123', 'bad-token', { realmId: '123' })).rejects.toThrow('QuickBooks API error (401)');
    });
  });

  it('should throw for unsupported provider', async () => {
    await expect(executeProviderAction('twitter', 'action', 'token', {})).rejects.toThrow('Unsupported provider: twitter');
  });
});
