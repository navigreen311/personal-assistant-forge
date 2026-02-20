/**
 * E2E Test Setup
 * Shared test utilities, mock factories, and helper functions
 * for end-to-end auth and dashboard test suites.
 */

import { NextRequest } from 'next/server';

// --- Mock Data Factories ---

export interface MockUserRecord {
  id: string;
  name: string;
  email: string;
  hashedPassword: string;
  preferences: Record<string, unknown>;
  timezone: string;
  chronotype: string | null;
  createdAt: Date;
  updatedAt: Date;
  entities?: MockEntityRecord[];
}

export interface MockEntityRecord {
  id: string;
  userId: string;
  name: string;
  type: string;
  complianceProfile: string[];
  brandKit: null;
  voicePersonaId: null;
  phoneNumbers: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MockSessionToken {
  userId: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  activeEntityId?: string;
}

export function createMockUser(overrides: Partial<MockUserRecord> = {}): MockUserRecord {
  return {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    hashedPassword: '$2a$12$hashed_password_placeholder',
    preferences: {
      hashedPassword: '$2a$12$hashed_password_placeholder',
      defaultTone: 'WARM',
      attentionBudget: 10,
      focusHours: [],
      vipContacts: [],
      meetingFreedays: [],
      autonomyLevel: 'SUGGEST',
    },
    timezone: 'America/Chicago',
    chronotype: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

export function createMockEntity(overrides: Partial<MockEntityRecord> = {}): MockEntityRecord {
  return {
    id: 'entity-1',
    userId: 'user-1',
    name: 'Personal',
    type: 'Personal',
    complianceProfile: [],
    brandKit: null,
    voicePersonaId: null,
    phoneNumbers: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

export function createMockSession(overrides: Partial<MockSessionToken> = {}): MockSessionToken {
  return {
    userId: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    role: 'owner',
    activeEntityId: 'entity-1',
    ...overrides,
  };
}

// --- Request Helpers ---

export function createPostRequest(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

export function createGetRequest(
  url: string,
  params: Record<string, string> = {},
  headers: Record<string, string> = {}
): NextRequest {
  const searchParams = new URLSearchParams(params);
  const fullUrl = Object.keys(params).length > 0
    ? `http://localhost${url}?${searchParams.toString()}`
    : `http://localhost${url}`;

  return new NextRequest(fullUrl, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

export function createPutRequest(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

export function createPatchRequest(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

// --- Response Assertion Helpers ---

export async function expectSuccessResponse(
  res: Response,
  expectedStatus = 200
): Promise<Record<string, unknown>> {
  const body = await res.json();
  expect(res.status).toBe(expectedStatus);
  expect(body.success).toBe(true);
  expect(body.data).toBeDefined();
  expect(body.meta).toBeDefined();
  expect(body.meta.timestamp).toBeDefined();
  return body;
}

export async function expectErrorResponse(
  res: Response,
  expectedStatus: number,
  expectedCode: string
): Promise<Record<string, unknown>> {
  const body = await res.json();
  expect(res.status).toBe(expectedStatus);
  expect(body.success).toBe(false);
  expect(body.error).toBeDefined();
  expect(body.error.code).toBe(expectedCode);
  expect(body.error.message).toBeTruthy();
  return body;
}

// --- Mock User with Entities (for profile/session flows) ---

export function createMockUserWithEntities(
  userOverrides: Partial<MockUserRecord> = {},
  entityOverrides: Partial<MockEntityRecord>[] = [{}]
): MockUserRecord & { entities: MockEntityRecord[] } {
  const user = createMockUser(userOverrides);
  const entities = entityOverrides.map((override, index) =>
    createMockEntity({
      id: `entity-${index + 1}`,
      userId: user.id,
      ...override,
    })
  );

  return { ...user, entities };
}

// --- Standard Valid Registration Payload ---

export const VALID_REGISTRATION = {
  name: 'Jane Doe',
  email: 'jane.doe@example.com',
  password: 'SecurePass1',
};

// --- Standard Invalid Payloads for Negative Testing ---

export const INVALID_REGISTRATIONS = {
  missingName: { email: 'test@example.com', password: 'SecurePass1' },
  missingEmail: { name: 'Test User', password: 'SecurePass1' },
  missingPassword: { name: 'Test User', email: 'test@example.com' },
  invalidEmail: { name: 'Test User', email: 'not-an-email', password: 'SecurePass1' },
  shortPassword: { name: 'Test User', email: 'test@example.com', password: 'Ab1' },
  weakPassword: { name: 'Test User', email: 'test@example.com', password: 'alllowercase1' },
  shortName: { name: 'J', email: 'test@example.com', password: 'SecurePass1' },
};
