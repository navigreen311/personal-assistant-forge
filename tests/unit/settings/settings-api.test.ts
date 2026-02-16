import type { NextRequest } from 'next/server';

// Mock prisma
const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

// Mock next-auth
jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}));

import { getToken } from 'next-auth/jwt';
import { GET, PATCH } from '@/app/api/settings/route';

const mockedGetToken = getToken as jest.MockedFunction<typeof getToken>;

function createMockRequest(options: { method?: string; body?: unknown } = {}): NextRequest {
  const { method = 'GET', body } = options;
  return {
    method,
    headers: new Headers({ 'content-type': 'application/json' }),
    url: 'http://localhost:3000/api/settings',
    json: body ? jest.fn().mockResolvedValue(body) : jest.fn(),
  } as unknown as NextRequest;
}

function mockAuthenticated(userId = 'user-123') {
  mockedGetToken.mockResolvedValue({
    userId,
    email: 'test@example.com',
    name: 'Test User',
    role: 'owner',
    activeEntityId: 'entity-1',
  } as any);
}

function mockUnauthenticated() {
  mockedGetToken.mockResolvedValue(null);
}

describe('GET /api/settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 for unauthenticated requests', async () => {
    mockUnauthenticated();
    const req = createMockRequest();
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('UNAUTHORIZED');
  });

  it('should return default settings for new users', async () => {
    mockAuthenticated();
    mockFindUnique.mockResolvedValue({ preferences: {} });

    const req = createMockRequest();
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.theme).toBe('system');
    expect(data.data.language).toBe('en');
    expect(data.data.timezone).toBe('America/New_York');
    expect(data.data.notifications.email).toBe(true);
    expect(data.data.accessibility.fontSize).toBe('medium');
  });

  it('should return stored settings for existing users', async () => {
    mockAuthenticated();
    mockFindUnique.mockResolvedValue({
      preferences: {
        settings: {
          theme: 'dark',
          language: 'fr',
          timezone: 'Europe/Paris',
          dateFormat: 'DD/MM/YYYY',
          timeFormat: '24h',
          notifications: { email: false, push: true, sms: true, digest: 'weekly' },
          accessibility: { reduceMotion: true, highContrast: true, fontSize: 'large' },
        },
      },
    });

    const req = createMockRequest();
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.theme).toBe('dark');
    expect(data.data.language).toBe('fr');
    expect(data.data.timezone).toBe('Europe/Paris');
    expect(data.data.notifications.email).toBe(false);
    expect(data.data.notifications.sms).toBe(true);
    expect(data.data.accessibility.reduceMotion).toBe(true);
  });
});

describe('PATCH /api/settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 for unauthenticated requests', async () => {
    mockUnauthenticated();
    const req = createMockRequest({ method: 'PATCH', body: { theme: 'dark' } });
    const res = await PATCH(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.success).toBe(false);
  });

  it('should validate request body with Zod', async () => {
    mockAuthenticated();
    const req = createMockRequest({ method: 'PATCH', body: { unknownField: true } });

    // Zod strips unknown fields, so this should still succeed with no actual changes
    mockFindUnique.mockResolvedValue({ preferences: {} });
    mockUpdate.mockResolvedValue({});

    const res = await PATCH(req);
    const data = await res.json();

    // With strip mode, unknown fields are ignored, so it succeeds
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should reject invalid theme value', async () => {
    mockAuthenticated();
    const req = createMockRequest({ method: 'PATCH', body: { theme: 'rainbow' } });

    const res = await PATCH(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject invalid timezone', async () => {
    mockAuthenticated();
    // Timezone is a string so empty string would be caught by min(1)
    const req = createMockRequest({ method: 'PATCH', body: { timezone: '' } });

    const res = await PATCH(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('should merge partial updates with existing settings', async () => {
    mockAuthenticated();
    mockFindUnique.mockResolvedValue({
      preferences: {
        settings: {
          theme: 'light',
          language: 'en',
          timezone: 'America/New_York',
          dateFormat: 'MM/DD/YYYY',
          timeFormat: '12h',
          notifications: { email: true, push: true, sms: false, digest: 'daily' },
          accessibility: { reduceMotion: false, highContrast: false, fontSize: 'medium' },
        },
      },
    });
    mockUpdate.mockResolvedValue({});

    const req = createMockRequest({ method: 'PATCH', body: { theme: 'dark' } });
    const res = await PATCH(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.theme).toBe('dark');
    // Other settings should remain unchanged
    expect(data.data.language).toBe('en');
    expect(data.data.notifications.email).toBe(true);
  });

  it('should persist updated settings', async () => {
    mockAuthenticated('user-456');
    mockFindUnique.mockResolvedValue({ preferences: {} });
    mockUpdate.mockResolvedValue({});

    const req = createMockRequest({ method: 'PATCH', body: { theme: 'dark', language: 'es' } });
    await PATCH(req);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-456' },
        data: expect.objectContaining({
          preferences: expect.objectContaining({
            settings: expect.objectContaining({
              theme: 'dark',
              language: 'es',
            }),
          }),
        }),
      })
    );
  });
});
