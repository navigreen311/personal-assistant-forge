/**
 * E2E Test: Auth Flow
 * Tests the complete authentication lifecycle:
 * - User registration (POST /api/auth/register)
 * - Login with credentials (NextAuth authorize)
 * - Login with invalid credentials (error case)
 * - Session / profile retrieval (GET /api/auth/profile)
 * - Entity switching (POST /api/auth/switch-entity)
 * - Unauthorized access to protected routes
 *
 * Services under test:
 * - register/route.ts (POST handler)
 * - profile/route.ts (GET, PATCH handlers)
 * - switch-entity/route.ts (POST handler)
 * - auth middleware (withAuth, withRole)
 * - auth config (authOptions - authorize callback)
 */

// --- Infrastructure mocks (must be before imports) ---

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  entity: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2a$12$hashed_password_e2e'),
  compare: jest.fn(),
}));

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { POST as registerHandler } from '@/app/api/auth/register/route';
import { GET as profileGetHandler, PATCH as profilePatchHandler } from '@/app/api/auth/profile/route';
import { POST as switchEntityHandler } from '@/app/api/auth/switch-entity/route';
import { authOptions } from '@/lib/auth/config';
import { getToken } from 'next-auth/jwt';
import bcrypt from 'bcryptjs';
import {
  createMockUser,
  createMockEntity,
  createMockSession,
  createMockUserWithEntities,
  createPostRequest,
  createGetRequest,
  createPatchRequest,
  expectSuccessResponse,
  expectErrorResponse,
  VALID_REGISTRATION,
  INVALID_REGISTRATIONS,
} from './setup';

const mockedGetToken = getToken as jest.MockedFunction<typeof getToken>;
const mockedBcryptCompare = bcrypt.compare as jest.MockedFunction<typeof bcrypt.compare>;

// --- Test Suite ---

describe('Auth Flow E2E Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. User Registration
  // =========================================================================

  describe('User Registration (POST /api/auth/register)', () => {
    it('should register a new user with valid credentials and create default entity', async () => {
      // Arrange: no existing user
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'new-user-1',
        name: VALID_REGISTRATION.name,
        email: VALID_REGISTRATION.email,
        hashedPassword: '$2a$12$hashed_password_e2e',
        preferences: {
          hashedPassword: '$2a$12$hashed_password_e2e',
          defaultTone: 'WARM',
          attentionBudget: 10,
          focusHours: [],
          vipContacts: [],
          meetingFreedays: [],
          autonomyLevel: 'SUGGEST',
        },
        timezone: 'America/Chicago',
        chronotype: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.entity.create.mockResolvedValue(
        createMockEntity({ userId: 'new-user-1' })
      );

      // Act
      const req = createPostRequest('/api/auth/register', VALID_REGISTRATION);
      const res = await registerHandler(req);
      const body = await expectSuccessResponse(res, 201);

      // Assert
      expect(body.data).toEqual({ userId: 'new-user-1' });

      // Verify user was created with hashed password in preferences
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: VALID_REGISTRATION.name,
          email: VALID_REGISTRATION.email,
          preferences: expect.objectContaining({
            hashedPassword: '$2a$12$hashed_password_e2e',
          }),
        }),
      });

      // Verify default Personal entity was created
      expect(mockPrisma.entity.create).toHaveBeenCalledWith({
        data: {
          userId: 'new-user-1',
          name: 'Personal',
          type: 'Personal',
        },
      });
    });

    it('should reject registration with missing name', async () => {
      const req = createPostRequest('/api/auth/register', INVALID_REGISTRATIONS.missingName);
      const res = await registerHandler(req);

      await expectErrorResponse(res, 400, 'VALIDATION_ERROR');
    });

    it('should reject registration with missing email', async () => {
      const req = createPostRequest('/api/auth/register', INVALID_REGISTRATIONS.missingEmail);
      const res = await registerHandler(req);

      await expectErrorResponse(res, 400, 'VALIDATION_ERROR');
    });

    it('should reject registration with missing password', async () => {
      const req = createPostRequest('/api/auth/register', INVALID_REGISTRATIONS.missingPassword);
      const res = await registerHandler(req);

      await expectErrorResponse(res, 400, 'VALIDATION_ERROR');
    });

    it('should reject registration with invalid email format', async () => {
      const req = createPostRequest('/api/auth/register', INVALID_REGISTRATIONS.invalidEmail);
      const res = await registerHandler(req);

      await expectErrorResponse(res, 400, 'VALIDATION_ERROR');
    });

    it('should reject registration with short password (under 8 chars)', async () => {
      const req = createPostRequest('/api/auth/register', INVALID_REGISTRATIONS.shortPassword);
      const res = await registerHandler(req);

      await expectErrorResponse(res, 400, 'VALIDATION_ERROR');
    });

    it('should reject registration with weak password (no uppercase)', async () => {
      const req = createPostRequest('/api/auth/register', INVALID_REGISTRATIONS.weakPassword);
      const res = await registerHandler(req);
      const body = await expectErrorResponse(res, 400, 'WEAK_PASSWORD');

      expect(body.error).toEqual(
        expect.objectContaining({
          details: expect.objectContaining({
            errors: expect.arrayContaining([
              expect.stringContaining('uppercase'),
            ]),
          }),
        })
      );
    });

    it('should reject registration with short name (under 2 chars)', async () => {
      const req = createPostRequest('/api/auth/register', INVALID_REGISTRATIONS.shortName);
      const res = await registerHandler(req);

      await expectErrorResponse(res, 400, 'VALIDATION_ERROR');
    });

    it('should reject registration with duplicate email', async () => {
      // Arrange: existing user found
      mockPrisma.user.findUnique.mockResolvedValue(createMockUser());

      const req = createPostRequest('/api/auth/register', VALID_REGISTRATION);
      const res = await registerHandler(req);
      const body = await expectErrorResponse(res, 409, 'EMAIL_EXISTS');

      expect(body.error).toEqual(
        expect.objectContaining({
          message: expect.stringContaining('email already exists'),
        })
      );

      // Verify no user was created
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('should return 500 on unexpected database errors during registration', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockRejectedValue(new Error('Database connection failed'));

      const req = createPostRequest('/api/auth/register', VALID_REGISTRATION);
      const res = await registerHandler(req);

      await expectErrorResponse(res, 500, 'INTERNAL_ERROR');
    });
  });

  // =========================================================================
  // 2. Login with Credentials (NextAuth authorize)
  // =========================================================================

  describe('Login with Credentials (NextAuth authorize)', () => {
    const authorizeCallback = authOptions.providers[0].options?.authorize;

    it('should authenticate user with valid email and password', async () => {
      if (!authorizeCallback) {
        throw new Error('Authorize callback not found in CredentialsProvider');
      }

      const mockUser = createMockUser({
        id: 'user-login-1',
        name: 'Login User',
        email: 'login@example.com',
      });

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockedBcryptCompare.mockResolvedValue(true as never);

      const result = await authorizeCallback(
        { email: 'login@example.com', password: 'SecurePass1' },
        {} as never
      );

      expect(result).not.toBeNull();
      expect(result).toEqual({
        id: 'user-login-1',
        name: 'Login User',
        email: 'login@example.com',
      });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'login@example.com' },
      });
      expect(mockedBcryptCompare).toHaveBeenCalled();
    });

    it('should reject login with non-existent email', async () => {
      if (!authorizeCallback) {
        throw new Error('Authorize callback not found in CredentialsProvider');
      }

      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await authorizeCallback(
        { email: 'nonexistent@example.com', password: 'SecurePass1' },
        {} as never
      );

      expect(result).toBeNull();
      expect(mockedBcryptCompare).not.toHaveBeenCalled();
    });

    it('should reject login with wrong password', async () => {
      if (!authorizeCallback) {
        throw new Error('Authorize callback not found in CredentialsProvider');
      }

      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockedBcryptCompare.mockResolvedValue(false as never);

      const result = await authorizeCallback(
        { email: 'test@example.com', password: 'WrongPassword1' },
        {} as never
      );

      expect(result).toBeNull();
    });

    it('should reject login when credentials are missing', async () => {
      if (!authorizeCallback) {
        throw new Error('Authorize callback not found in CredentialsProvider');
      }

      // Missing email
      const result1 = await authorizeCallback(
        { email: '', password: 'SecurePass1' },
        {} as never
      );
      expect(result1).toBeNull();

      // Missing password
      const result2 = await authorizeCallback(
        { email: 'test@example.com', password: '' },
        {} as never
      );
      expect(result2).toBeNull();
    });

    it('should reject login when user has no hashed password (OAuth-only user)', async () => {
      if (!authorizeCallback) {
        throw new Error('Authorize callback not found in CredentialsProvider');
      }

      const oauthUser = createMockUser({
        preferences: {
          defaultTone: 'WARM',
          attentionBudget: 10,
          focusHours: [],
          vipContacts: [],
          meetingFreedays: [],
          autonomyLevel: 'SUGGEST',
          // No hashedPassword field
        },
      });

      mockPrisma.user.findUnique.mockResolvedValue(oauthUser);

      const result = await authorizeCallback(
        { email: 'test@example.com', password: 'SecurePass1' },
        {} as never
      );

      expect(result).toBeNull();
      expect(mockedBcryptCompare).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 3. Login with Invalid Credentials (Error Cases)
  // =========================================================================

  describe('Login Error Cases', () => {
    const authorizeCallback = authOptions.providers[0].options?.authorize;

    it('should not leak user existence on failed login', async () => {
      if (!authorizeCallback) {
        throw new Error('Authorize callback not found in CredentialsProvider');
      }

      // Both "user not found" and "wrong password" return null (same response)
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const resultNoUser = await authorizeCallback(
        { email: 'nobody@example.com', password: 'SecurePass1' },
        {} as never
      );

      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockedBcryptCompare.mockResolvedValue(false as never);

      const resultWrongPwd = await authorizeCallback(
        { email: 'test@example.com', password: 'WrongPassword1' },
        {} as never
      );

      // Both should return null (no information leak)
      expect(resultNoUser).toBeNull();
      expect(resultWrongPwd).toBeNull();
    });

    it('should handle undefined credentials object gracefully', async () => {
      if (!authorizeCallback) {
        throw new Error('Authorize callback not found in CredentialsProvider');
      }

      const result = await authorizeCallback(undefined as never, {} as never);

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // 4. Session / Profile Retrieval (GET /api/auth/profile)
  // =========================================================================

  describe('Profile Retrieval (GET /api/auth/profile)', () => {
    it('should return user profile for authenticated user', async () => {
      // Arrange: valid JWT token
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      const mockUser = createMockUserWithEntities();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      // Act
      const req = createGetRequest('/api/auth/profile');
      const res = await profileGetHandler(req);
      const body = await expectSuccessResponse(res, 200);

      // Assert: profile data
      expect(body.data).toEqual(
        expect.objectContaining({
          id: 'user-1',
          name: 'Test User',
          email: 'test@example.com',
          timezone: 'America/Chicago',
          entityIds: ['entity-1'],
        })
      );

      // Assert: hashedPassword is stripped from preferences
      const prefs = (body.data as Record<string, unknown>).preferences as Record<string, unknown>;
      expect(prefs).not.toHaveProperty('hashedPassword');
      expect(prefs).toHaveProperty('defaultTone', 'WARM');
    });

    it('should return 404 when user not found in database', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const req = createGetRequest('/api/auth/profile');
      const res = await profileGetHandler(req);

      await expectErrorResponse(res, 404, 'NOT_FOUND');
    });

    it('should return 401 when not authenticated', async () => {
      mockedGetToken.mockResolvedValue(null);

      const req = createGetRequest('/api/auth/profile');
      const res = await profileGetHandler(req);

      await expectErrorResponse(res, 401, 'UNAUTHORIZED');
    });

    it('should return profile with multiple entities', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      const mockUser = createMockUserWithEntities({}, [
        { name: 'Personal', type: 'Personal' },
        { name: 'Business LLC', type: 'LLC' },
        { name: 'Side Project', type: 'Personal' },
      ]);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const req = createGetRequest('/api/auth/profile');
      const res = await profileGetHandler(req);
      const body = await expectSuccessResponse(res, 200);

      const data = body.data as Record<string, unknown>;
      expect(data.entityIds).toHaveLength(3);
      expect(data.entityIds).toEqual(['entity-1', 'entity-2', 'entity-3']);
    });
  });

  // =========================================================================
  // 5. Profile Update (PATCH /api/auth/profile)
  // =========================================================================

  describe('Profile Update (PATCH /api/auth/profile)', () => {
    it('should update user name and timezone', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      const existingUser = createMockUserWithEntities();
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);

      const updatedUser = {
        ...existingUser,
        name: 'Updated Name',
        timezone: 'America/New_York',
      };
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const req = createPatchRequest('/api/auth/profile', {
        name: 'Updated Name',
        timezone: 'America/New_York',
      });

      const res = await profilePatchHandler(req);
      const body = await expectSuccessResponse(res, 200);

      const data = body.data as Record<string, unknown>;
      expect(data.name).toBe('Updated Name');
      expect(data.timezone).toBe('America/New_York');
    });

    it('should merge preferences without overwriting hashedPassword', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      const existingUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);

      const updatedUser = createMockUserWithEntities({
        preferences: {
          ...existingUser.preferences,
          defaultTone: 'FORMAL',
        },
      });
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const req = createPatchRequest('/api/auth/profile', {
        preferences: { defaultTone: 'FORMAL' },
      });

      const res = await profilePatchHandler(req);
      await expectSuccessResponse(res, 200);

      // Verify update call merges preferences
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            preferences: expect.objectContaining({
              hashedPassword: existingUser.preferences.hashedPassword,
              defaultTone: 'FORMAL',
            }),
          }),
        })
      );
    });

    it('should reject profile update with invalid chronotype', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      const req = createPatchRequest('/api/auth/profile', {
        chronotype: 'INVALID_VALUE',
      });

      const res = await profilePatchHandler(req);

      await expectErrorResponse(res, 400, 'VALIDATION_ERROR');
    });

    it('should return 401 for unauthenticated profile update', async () => {
      mockedGetToken.mockResolvedValue(null);

      const req = createPatchRequest('/api/auth/profile', {
        name: 'Hacker',
      });

      const res = await profilePatchHandler(req);

      await expectErrorResponse(res, 401, 'UNAUTHORIZED');
    });
  });

  // =========================================================================
  // 6. Entity Switching (POST /api/auth/switch-entity)
  // =========================================================================

  describe('Entity Switching (POST /api/auth/switch-entity)', () => {
    it('should switch to an entity the user owns', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession({ activeEntityId: 'entity-1' }) as never
      );

      const targetEntity = createMockEntity({
        id: 'entity-2',
        userId: 'user-1',
        name: 'Business LLC',
        type: 'LLC',
      });
      mockPrisma.entity.findFirst.mockResolvedValue(targetEntity);

      const req = createPostRequest('/api/auth/switch-entity', {
        entityId: 'entity-2',
      });

      const res = await switchEntityHandler(req);
      const body = await expectSuccessResponse(res, 200);

      expect(body.data).toEqual({ activeEntityId: 'entity-2' });

      // Verify entity ownership check
      expect(mockPrisma.entity.findFirst).toHaveBeenCalledWith({
        where: { id: 'entity-2', userId: 'user-1' },
      });
    });

    it('should reject switching to entity the user does not own', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      // Entity not found for this user
      mockPrisma.entity.findFirst.mockResolvedValue(null);

      const req = createPostRequest('/api/auth/switch-entity', {
        entityId: 'entity-other-user',
      });

      const res = await switchEntityHandler(req);

      await expectErrorResponse(res, 403, 'FORBIDDEN');
    });

    it('should reject switching with missing entityId', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      const req = createPostRequest('/api/auth/switch-entity', {});

      const res = await switchEntityHandler(req);

      await expectErrorResponse(res, 400, 'VALIDATION_ERROR');
    });

    it('should reject switching with empty entityId', async () => {
      mockedGetToken.mockResolvedValue(
        createMockSession() as never
      );

      const req = createPostRequest('/api/auth/switch-entity', {
        entityId: '',
      });

      const res = await switchEntityHandler(req);

      await expectErrorResponse(res, 400, 'VALIDATION_ERROR');
    });

    it('should return 401 for unauthenticated entity switch', async () => {
      mockedGetToken.mockResolvedValue(null);

      const req = createPostRequest('/api/auth/switch-entity', {
        entityId: 'entity-1',
      });

      const res = await switchEntityHandler(req);

      await expectErrorResponse(res, 401, 'UNAUTHORIZED');
    });
  });

  // =========================================================================
  // 7. Unauthorized Access to Protected Routes
  // =========================================================================

  describe('Unauthorized Access to Protected Routes', () => {
    it('should return 401 for profile GET without token', async () => {
      mockedGetToken.mockResolvedValue(null);

      const req = createGetRequest('/api/auth/profile');
      const res = await profileGetHandler(req);

      const body = await expectErrorResponse(res, 401, 'UNAUTHORIZED');
      expect(body.error).toEqual(
        expect.objectContaining({
          message: expect.stringContaining('Authentication required'),
        })
      );
    });

    it('should return 401 for profile PATCH without token', async () => {
      mockedGetToken.mockResolvedValue(null);

      const req = createPatchRequest('/api/auth/profile', { name: 'Hacker' });
      const res = await profilePatchHandler(req);

      await expectErrorResponse(res, 401, 'UNAUTHORIZED');
    });

    it('should return 401 for entity switch without token', async () => {
      mockedGetToken.mockResolvedValue(null);

      const req = createPostRequest('/api/auth/switch-entity', { entityId: 'e1' });
      const res = await switchEntityHandler(req);

      await expectErrorResponse(res, 401, 'UNAUTHORIZED');
    });

    it('should return 401 when token has no userId', async () => {
      mockedGetToken.mockResolvedValue({ email: 'test@example.com' } as never);

      const req = createGetRequest('/api/auth/profile');
      const res = await profileGetHandler(req);

      await expectErrorResponse(res, 401, 'UNAUTHORIZED');
    });
  });

  // =========================================================================
  // 8. Full Registration -> Login -> Profile Flow
  // =========================================================================

  describe('Full Registration -> Login -> Profile Flow', () => {
    it('should register, login, then retrieve profile successfully', async () => {
      const authorizeCallback = authOptions.providers[0].options?.authorize;
      if (!authorizeCallback) {
        throw new Error('Authorize callback not found');
      }

      // --- Step 1: Register ---
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const createdUser = {
        id: 'flow-user-1',
        name: 'Flow User',
        email: 'flow@example.com',
        hashedPassword: '$2a$12$hashed_password_e2e',
        preferences: {
          hashedPassword: '$2a$12$hashed_password_e2e',
          defaultTone: 'WARM',
          attentionBudget: 10,
          focusHours: [],
          vipContacts: [],
          meetingFreedays: [],
          autonomyLevel: 'SUGGEST',
        },
        timezone: 'America/Chicago',
        chronotype: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.user.create.mockResolvedValue(createdUser);
      mockPrisma.entity.create.mockResolvedValue(
        createMockEntity({ id: 'flow-entity-1', userId: 'flow-user-1' })
      );

      const registerReq = createPostRequest('/api/auth/register', {
        name: 'Flow User',
        email: 'flow@example.com',
        password: 'SecurePass1',
      });

      const registerRes = await registerHandler(registerReq);
      const registerBody = await expectSuccessResponse(registerRes, 201);
      expect(registerBody.data).toEqual({ userId: 'flow-user-1' });

      // --- Step 2: Login via authorize ---
      mockPrisma.user.findUnique.mockResolvedValue(createdUser);
      mockedBcryptCompare.mockResolvedValue(true as never);

      const loginResult = await authorizeCallback(
        { email: 'flow@example.com', password: 'SecurePass1' },
        {} as never
      );

      expect(loginResult).toEqual({
        id: 'flow-user-1',
        name: 'Flow User',
        email: 'flow@example.com',
      });

      // --- Step 3: Retrieve profile (simulating post-login with JWT) ---
      mockedGetToken.mockResolvedValue({
        userId: 'flow-user-1',
        email: 'flow@example.com',
        name: 'Flow User',
        role: 'owner',
        activeEntityId: 'flow-entity-1',
      } as never);

      const userWithEntities = {
        ...createdUser,
        entities: [createMockEntity({ id: 'flow-entity-1', userId: 'flow-user-1' })],
      };
      mockPrisma.user.findUnique.mockResolvedValue(userWithEntities);

      const profileReq = createGetRequest('/api/auth/profile');
      const profileRes = await profileGetHandler(profileReq);
      const profileBody = await expectSuccessResponse(profileRes, 200);

      const profileData = profileBody.data as Record<string, unknown>;
      expect(profileData.id).toBe('flow-user-1');
      expect(profileData.name).toBe('Flow User');
      expect(profileData.email).toBe('flow@example.com');
      expect(profileData.entityIds).toEqual(['flow-entity-1']);

      // Verify password is not exposed in profile
      const prefs = profileData.preferences as Record<string, unknown>;
      expect(prefs).not.toHaveProperty('hashedPassword');
    });
  });

  // =========================================================================
  // 9. NextAuth Callbacks
  // =========================================================================

  describe('NextAuth JWT and Session Callbacks', () => {
    it('should populate JWT token with userId, role, and activeEntityId on sign-in', async () => {
      const jwtCallback = authOptions.callbacks?.jwt;
      if (!jwtCallback) {
        throw new Error('JWT callback not found');
      }

      const mockUser = createMockUserWithEntities(
        { id: 'jwt-user-1' },
        [{ id: 'jwt-entity-1', name: 'Personal' }]
      );
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const token = await jwtCallback({
        token: { sub: 'jwt-user-1' } as never,
        user: { id: 'jwt-user-1', name: 'JWT User', email: 'jwt@example.com' } as never,
        account: null as never,
        trigger: 'signIn' as never,
      });

      expect(token.userId).toBe('jwt-user-1');
      expect(token.role).toBe('owner');
      expect(token.activeEntityId).toBe('jwt-entity-1');
    });

    it('should pass through existing token on subsequent requests (no user in payload)', async () => {
      const jwtCallback = authOptions.callbacks?.jwt;
      if (!jwtCallback) {
        throw new Error('JWT callback not found');
      }

      const existingToken = {
        sub: 'existing-user',
        userId: 'existing-user',
        role: 'owner',
        activeEntityId: 'existing-entity',
      };

      const token = await jwtCallback({
        token: existingToken as never,
        user: undefined as never,
        account: null as never,
        trigger: 'update' as never,
      });

      // Token should be passed through unchanged
      expect(token.userId).toBe('existing-user');
      expect(token.role).toBe('owner');
      expect(token.activeEntityId).toBe('existing-entity');

      // Should NOT query DB when no user object
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should populate session from JWT token', async () => {
      const sessionCallback = authOptions.callbacks?.session;
      if (!sessionCallback) {
        throw new Error('Session callback not found');
      }

      const mockToken = {
        userId: 'session-user-1',
        role: 'owner',
        activeEntityId: 'session-entity-1',
      };

      const session = {
        user: { id: '', name: 'Session User', email: 'session@example.com', role: '' as never, activeEntityId: '' },
        expires: new Date().toISOString(),
      };

      const result = await sessionCallback({
        session: session as never,
        token: mockToken as never,
        trigger: 'update' as never,
        newSession: undefined as never,
      });

      expect(result.user.id).toBe('session-user-1');
      expect(result.user.role).toBe('owner');
      expect(result.user.activeEntityId).toBe('session-entity-1');
    });
  });
});
