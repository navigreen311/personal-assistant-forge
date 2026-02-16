import { NextRequest } from 'next/server';

// Mock bcryptjs
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2a$12$hashed_password'),
  compare: jest.fn(),
}));

// Mock prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    entity: {
      create: jest.fn(),
    },
  },
}));

import { POST } from '@/app/api/auth/register/route';
import { prisma } from '@/lib/db';

const mockedUserFindUnique = prisma.user.findUnique as jest.MockedFunction<
  typeof prisma.user.findUnique
>;
const mockedUserCreate = prisma.user.create as jest.MockedFunction<typeof prisma.user.create>;
const mockedEntityCreate = prisma.entity.create as jest.MockedFunction<
  typeof prisma.entity.create
>;

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create user with valid input', async () => {
    mockedUserFindUnique.mockResolvedValue(null);
    mockedUserCreate.mockResolvedValue({
      id: 'new-user-id',
      name: 'Test User',
      email: 'test@example.com',
      hashedPassword: '$2a$12$hashed_password',
      preferences: {},
      timezone: 'America/Chicago',
      chronotype: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockedEntityCreate.mockResolvedValue({
      id: 'entity-1',
      userId: 'new-user-id',
      name: 'Personal',
      type: 'Personal',
      complianceProfile: [],
      brandKit: null,
      voicePersonaId: null,
      phoneNumbers: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = createRequest({
      name: 'Test User',
      email: 'test@example.com',
      password: 'SecurePass1',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.userId).toBe('new-user-id');
  });

  it('should return 400 for missing fields', async () => {
    const req = createRequest({ email: 'test@example.com' });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for weak password', async () => {
    const req = createRequest({
      name: 'Test User',
      email: 'test@example.com',
      password: 'alllowercase1', // passes Zod min(8) but fails uppercase requirement
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('WEAK_PASSWORD');
  });

  it('should return 409 for duplicate email', async () => {
    mockedUserFindUnique.mockResolvedValue({
      id: 'existing',
      name: 'Existing',
      email: 'test@example.com',
      hashedPassword: '$2a$12$hashed_password',
      preferences: {},
      timezone: 'America/Chicago',
      chronotype: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = createRequest({
      name: 'Test User',
      email: 'test@example.com',
      password: 'SecurePass1',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('EMAIL_EXISTS');
  });

  it('should hash password before storing', async () => {
    mockedUserFindUnique.mockResolvedValue(null);
    mockedUserCreate.mockResolvedValue({
      id: 'new-user-id',
      name: 'Test User',
      email: 'test@example.com',
      hashedPassword: '$2a$12$hashed_password',
      preferences: {},
      timezone: 'America/Chicago',
      chronotype: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockedEntityCreate.mockResolvedValue({
      id: 'entity-1',
      userId: 'new-user-id',
      name: 'Personal',
      type: 'Personal',
      complianceProfile: [],
      brandKit: null,
      voicePersonaId: null,
      phoneNumbers: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = createRequest({
      name: 'Test User',
      email: 'test@example.com',
      password: 'SecurePass1',
    });

    await POST(req);

    // Verify password was hashed (stored in preferences.hashedPassword)
    expect(mockedUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          preferences: expect.objectContaining({
            hashedPassword: '$2a$12$hashed_password',
          }),
        }),
      })
    );
  });

  it('should create default Personal entity for new user', async () => {
    mockedUserFindUnique.mockResolvedValue(null);
    mockedUserCreate.mockResolvedValue({
      id: 'new-user-id',
      name: 'Test User',
      email: 'test@example.com',
      hashedPassword: '$2a$12$hashed_password',
      preferences: {},
      timezone: 'America/Chicago',
      chronotype: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockedEntityCreate.mockResolvedValue({
      id: 'entity-1',
      userId: 'new-user-id',
      name: 'Personal',
      type: 'Personal',
      complianceProfile: [],
      brandKit: null,
      voicePersonaId: null,
      phoneNumbers: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = createRequest({
      name: 'Test User',
      email: 'test@example.com',
      password: 'SecurePass1',
    });

    await POST(req);

    expect(mockedEntityCreate).toHaveBeenCalledWith({
      data: {
        userId: 'new-user-id',
        name: 'Personal',
        type: 'Personal',
      },
    });
  });
});
