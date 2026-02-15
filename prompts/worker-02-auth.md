# Worker 02: Auth & User Management

## Branch: ai-feature/w02-auth

Create and check out the branch `ai-feature/w02-auth` from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these directories:

- `src/lib/auth/` (all files -- create this directory)
- `src/app/api/auth/` (all files -- NextAuth API routes)
- `src/modules/security/` (all files -- RBAC, permissions)
- `src/app/(auth)/` (all files -- login/register UI pages)
- `src/shared/middleware/auth.ts` (single file -- auth middleware)
- `tests/unit/auth/` (all files)

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`prisma/schema.prisma`** -- The User model is the auth target. Note: it has id (cuid), name, email (unique), preferences (Json), timezone, chronotype, createdAt, updatedAt. There is NO password field -- you will need to handle this via a separate auth approach (see below).
2. **`src/shared/types/index.ts`** -- The `User`, `UserPreferences`, `AutonomyLevel`, `Tone` types. Your auth system must return data conforming to these shapes.
3. **`src/shared/utils/api-response.ts`** -- Use `success()`, `error()`, and `paginated()` helpers for all API responses.
4. **`src/lib/db/index.ts`** -- Import `prisma` from here for all database operations.
5. **`package.json`** -- `next-auth@^4.24.13` is already installed. Do NOT install additional auth packages unless absolutely necessary.
6. **`tsconfig.json`** -- Path alias `@/*` maps to `./src/*`.

### Important Schema Note

The Prisma User model does NOT have a `password` or `hashedPassword` field. Since you cannot modify `prisma/schema.prisma`, you have two approaches:

- **Option A (Recommended)**: Store credentials in NextAuth's built-in adapter tables. Use the Prisma adapter for NextAuth which manages its own Account/Session tables.
- **Option B**: Use the `preferences` JSON field on User to store a hashed password (less clean but avoids schema changes).

Choose Option A. Create a separate file `src/lib/auth/prisma-adapter.ts` that extends the base Prisma adapter to work with the existing User model. For the credentials provider, store the hashed password in the Account model's metadata or use a custom approach that maps to the existing schema.

ASSUMPTION: Since this is a development/demo environment, the credentials provider will use bcrypt hashing but we will keep it simple. Google OAuth will be configured with placeholder env vars.

## Requirements

### 1. NextAuth Configuration (`src/lib/auth/config.ts`)

```typescript
// src/lib/auth/config.ts
import { NextAuthOptions } from 'next-auth';

export const authOptions: NextAuthOptions = {
  providers: [
    // Credentials provider (email + password)
    // Google OAuth provider
  ],
  callbacks: {
    // jwt: attach userId, role, activeEntityId to token
    // session: expose userId, role, activeEntityId on session
  },
  pages: {
    signIn: '/login',
    signUp: '/register',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
};
```

**Providers:**
- **Credentials**: Accept `email` and `password`. Look up user by email, verify password hash (bcrypt). Return user object with id, name, email.
- **Google OAuth**: Use `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` env vars. On first login, auto-create User record with defaults. Map Google profile to User model.

**Callbacks:**
- `jwt`: On sign-in, fetch user from DB, attach `userId`, `role` (default "owner"), and `activeEntityId` (first entity) to the JWT token.
- `session`: Expose `userId`, `role`, `activeEntityId`, `name`, `email` on the session object.
- `signIn`: Validate that the user account is active.

**Session type extension** (`src/lib/auth/types.ts`):
```typescript
// src/lib/auth/types.ts
import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: UserRole;
      activeEntityId?: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string;
    role: UserRole;
    activeEntityId?: string;
  }
}

export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';
```

### 2. NextAuth API Route (`src/app/api/auth/[...nextauth]/route.ts`)

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth/config';

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

### 3. Auth Middleware (`src/shared/middleware/auth.ts`)

Create middleware that protects API routes:

```typescript
// src/shared/middleware/auth.ts

import { NextRequest } from 'next/server';

// Verify JWT and extract session for API routes
export async function withAuth(
  req: NextRequest,
  handler: (req: NextRequest, session: AuthSession) => Promise<Response>
): Promise<Response>;

// Require specific role(s)
export async function withRole(
  req: NextRequest,
  roles: UserRole[],
  handler: (req: NextRequest, session: AuthSession) => Promise<Response>
): Promise<Response>;

// Require entity access (user must own or have access to the entity)
export async function withEntityAccess(
  req: NextRequest,
  entityId: string,
  handler: (req: NextRequest, session: AuthSession) => Promise<Response>
): Promise<Response>;

export interface AuthSession {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  activeEntityId?: string;
}
```

These should:
- Extract the JWT from the request using `getToken()` from `next-auth/jwt`.
- Return a `401` error response (using `error()` from api-response) if no valid session.
- Return a `403` error response if role requirements are not met.
- Pass the session to the handler function.

### 4. Registration API (`src/app/api/auth/register/route.ts`)

```typescript
// POST /api/auth/register
// Body: { name: string; email: string; password: string }
// Response: ApiResponse<{ userId: string }>

// Validation:
// - name: 2-100 chars
// - email: valid email, unique
// - password: 8+ chars, 1 uppercase, 1 lowercase, 1 number

// Steps:
// 1. Validate input with Zod
// 2. Check if email already exists
// 3. Hash password with bcrypt (12 rounds)
// 4. Create User record with default preferences
// 5. Create a default "Personal" entity for the user
// 6. Return userId
```

### 5. User Profile API (`src/app/api/auth/profile/route.ts`)

```typescript
// GET /api/auth/profile
// Protected: requires auth
// Response: ApiResponse<User>
// Returns the current user's profile with preferences

// PATCH /api/auth/profile
// Protected: requires auth
// Body: Partial<{ name: string; timezone: string; chronotype: string; preferences: Partial<UserPreferences> }>
// Response: ApiResponse<User>
// Updates user profile fields
```

### 6. Session/Entity Switching API (`src/app/api/auth/switch-entity/route.ts`)

```typescript
// POST /api/auth/switch-entity
// Protected: requires auth
// Body: { entityId: string }
// Response: ApiResponse<{ activeEntityId: string }>

// Validates that the user owns the entity, then updates the session's activeEntityId.
// This is used for the multi-entity switching feature.
```

### 7. RBAC Helpers (`src/modules/security/rbac.ts`)

```typescript
// src/modules/security/rbac.ts

export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';

export type Permission =
  | 'entity:create' | 'entity:read' | 'entity:update' | 'entity:delete'
  | 'contact:create' | 'contact:read' | 'contact:update' | 'contact:delete'
  | 'task:create' | 'task:read' | 'task:update' | 'task:delete'
  | 'project:create' | 'project:read' | 'project:update' | 'project:delete'
  | 'message:create' | 'message:read' | 'message:update' | 'message:delete' | 'message:send'
  | 'calendar:create' | 'calendar:read' | 'calendar:update' | 'calendar:delete'
  | 'workflow:create' | 'workflow:read' | 'workflow:update' | 'workflow:delete' | 'workflow:execute'
  | 'financial:create' | 'financial:read' | 'financial:update' | 'financial:approve'
  | 'settings:read' | 'settings:update'
  | 'user:manage';

// Role -> permissions mapping
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  owner: [/* all permissions */],
  admin: [/* all except user:manage and some destructive ops */],
  member: [/* CRUD on own resources, read on shared */],
  viewer: [/* read-only permissions */],
};

export function hasPermission(role: UserRole, permission: Permission): boolean;
export function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean;
export function hasAllPermissions(role: UserRole, permissions: Permission[]): boolean;
export function getPermissions(role: UserRole): Permission[];
```

### 8. Auth Utility Helpers (`src/lib/auth/helpers.ts`)

```typescript
// src/lib/auth/helpers.ts

// Password hashing (bcrypt)
export async function hashPassword(password: string): Promise<string>;
export async function verifyPassword(password: string, hash: string): Promise<boolean>;

// Password validation
export function validatePasswordStrength(password: string): {
  valid: boolean;
  errors: string[];
};

// Email validation
export function validateEmail(email: string): boolean;

// Generate secure random tokens (for password reset, etc.)
export function generateToken(length?: number): string;

// Get current session helper (for server components)
export async function getCurrentUser(): Promise<AuthSession | null>;
```

### 9. Login Page (`src/app/(auth)/login/page.tsx`)

Build a clean, functional login page with Tailwind CSS:

- Email and password input fields with labels
- "Sign In" button with loading state
- "Sign in with Google" OAuth button
- "Don't have an account? Register" link to /register
- Error message display area (invalid credentials, account not found)
- Responsive layout centered on the page
- Use Next.js `useRouter` for redirects after login
- Call `signIn('credentials', ...)` from next-auth/react

### 10. Register Page (`src/app/(auth)/register/page.tsx`)

Build a registration page:

- Name, email, password, confirm password fields
- Password strength indicator (visual bar)
- Real-time validation feedback
- "Create Account" button with loading state
- "Already have an account? Sign In" link
- POST to `/api/auth/register`, then auto-sign-in on success
- Responsive Tailwind layout

### 11. Auth Layout (`src/app/(auth)/layout.tsx`)

Shared layout for login/register pages:

- Centered card layout with max-width
- App logo/name at top ("PersonalAssistantForge")
- Clean background (gradient or subtle pattern)
- No navigation bar (public pages)

### 12. Auth Provider Wrapper (`src/lib/auth/provider.tsx`)

```typescript
// src/lib/auth/provider.tsx
'use client';

import { SessionProvider } from 'next-auth/react';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

This component will be imported by other workers into the root layout.

### 13. Auth Hook (`src/lib/auth/use-session.ts`)

```typescript
// src/lib/auth/use-session.ts
'use client';

// Wrapper around next-auth useSession with typed returns
export function useAuthSession(): {
  user: AuthSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  activeEntityId: string | null;
  switchEntity: (entityId: string) => Promise<void>;
  signOut: () => Promise<void>;
};
```

## Acceptance Criteria

1. NextAuth is configured with both Credentials and Google OAuth providers.
2. `POST /api/auth/register` creates a user with hashed password and default Personal entity.
3. Sign-in with credentials works (email + password verification).
4. JWT session includes userId, role, and activeEntityId.
5. `withAuth` middleware correctly protects API routes (returns 401 for unauthenticated).
6. `withRole` middleware correctly enforces role-based access (returns 403 for unauthorized).
7. `withEntityAccess` middleware validates entity ownership.
8. RBAC permission mapping is complete for all 4 roles.
9. Login page renders with email/password fields and Google OAuth button.
10. Register page renders with validation and password strength indicator.
11. Auth provider component is exported for use in root layout.
12. All files compile without TypeScript errors (`npx tsc --noEmit`).
13. All unit tests pass.
14. No modifications to files outside owned paths.

## Implementation Steps

1. **Read context files**: Read `prisma/schema.prisma`, `src/shared/types/index.ts`, `src/shared/utils/api-response.ts`, `src/lib/db/index.ts`, `package.json`.
2. **Create branch**: `git checkout -b ai-feature/w02-auth`
3. **Install bcrypt** (if not present): `npm install bcryptjs` and `npm install -D @types/bcryptjs`. Use `bcryptjs` (pure JS) rather than `bcrypt` (native) to avoid build issues.
4. **Create `src/lib/auth/types.ts`**: NextAuth module augmentation and UserRole type.
5. **Create `src/lib/auth/helpers.ts`**: Password hashing, validation, token generation.
6. **Create `src/lib/auth/config.ts`**: Full NextAuth configuration with providers, callbacks, pages.
7. **Create `src/lib/auth/provider.tsx`**: SessionProvider wrapper component.
8. **Create `src/lib/auth/use-session.ts`**: Client-side session hook.
9. **Create `src/app/api/auth/[...nextauth]/route.ts`**: NextAuth catch-all API route.
10. **Create `src/app/api/auth/register/route.ts`**: Registration endpoint with Zod validation.
11. **Create `src/app/api/auth/profile/route.ts`**: GET and PATCH profile endpoints.
12. **Create `src/app/api/auth/switch-entity/route.ts`**: Entity switching endpoint.
13. **Create `src/shared/middleware/auth.ts`**: withAuth, withRole, withEntityAccess middleware.
14. **Create `src/modules/security/rbac.ts`**: Role-permission mapping and helpers.
15. **Create `src/app/(auth)/layout.tsx`**: Shared auth page layout.
16. **Create `src/app/(auth)/login/page.tsx`**: Login page with form and OAuth.
17. **Create `src/app/(auth)/register/page.tsx`**: Registration page with validation.
18. **Create tests**.
19. **Type-check**: Run `npx tsc --noEmit`.
20. **Run tests**: `npx jest tests/unit/auth/`.
21. **Commit** with conventional commit messages.

## Tests

Create test files in `tests/unit/auth/`:

### `tests/unit/auth/helpers.test.ts`
```typescript
describe('hashPassword / verifyPassword', () => {
  it('should hash a password and verify it correctly');
  it('should reject incorrect password');
  it('should produce different hashes for same password (salt)');
});

describe('validatePasswordStrength', () => {
  it('should reject passwords shorter than 8 chars');
  it('should reject passwords without uppercase');
  it('should reject passwords without lowercase');
  it('should reject passwords without numbers');
  it('should accept valid passwords');
});

describe('validateEmail', () => {
  it('should accept valid email addresses');
  it('should reject invalid email addresses');
});

describe('generateToken', () => {
  it('should generate token of specified length');
  it('should generate unique tokens');
});
```

### `tests/unit/auth/rbac.test.ts`
```typescript
describe('hasPermission', () => {
  it('should return true for owner with any permission');
  it('should return false for viewer with write permissions');
  it('should return true for member with own-resource permissions');
  it('should return false for member with user:manage');
});

describe('hasAnyPermission', () => {
  it('should return true if role has at least one permission');
  it('should return false if role has none of the permissions');
});

describe('hasAllPermissions', () => {
  it('should return true only if role has all permissions');
  it('should return false if role is missing any permission');
});

describe('getPermissions', () => {
  it('should return all permissions for owner');
  it('should return limited permissions for viewer');
});
```

### `tests/unit/auth/middleware.test.ts`
```typescript
// Mock next-auth/jwt getToken
// Mock Prisma client

describe('withAuth', () => {
  it('should call handler with session when valid token exists');
  it('should return 401 when no token');
  it('should return 401 when token is expired');
});

describe('withRole', () => {
  it('should allow access for permitted roles');
  it('should return 403 for unpermitted roles');
});

describe('withEntityAccess', () => {
  it('should allow access when user owns entity');
  it('should return 403 when user does not own entity');
  it('should return 404 when entity does not exist');
});
```

### `tests/unit/auth/register.test.ts`
```typescript
// Mock Prisma client and bcrypt

describe('POST /api/auth/register', () => {
  it('should create user with valid input');
  it('should return 400 for missing fields');
  it('should return 400 for weak password');
  it('should return 409 for duplicate email');
  it('should hash password before storing');
  it('should create default Personal entity for new user');
});
```

## Commit Strategy

Make atomic commits in this order:

1. `feat(auth): add NextAuth config with credentials and Google OAuth providers`
   - Files: `src/lib/auth/config.ts`, `src/lib/auth/types.ts`, `src/lib/auth/helpers.ts`, `src/lib/auth/provider.tsx`, `src/lib/auth/use-session.ts`
2. `feat(auth): add auth API routes for NextAuth, registration, profile, and entity switching`
   - Files: `src/app/api/auth/[...nextauth]/route.ts`, `src/app/api/auth/register/route.ts`, `src/app/api/auth/profile/route.ts`, `src/app/api/auth/switch-entity/route.ts`
3. `feat(auth): add auth middleware with role and entity access guards`
   - Files: `src/shared/middleware/auth.ts`
4. `feat(auth): add RBAC permission system with role-based access control`
   - Files: `src/modules/security/rbac.ts`
5. `feat(auth): add login and register UI pages`
   - Files: `src/app/(auth)/layout.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`
6. `test(auth): add unit tests for auth helpers, RBAC, middleware, and registration`
   - Files: `tests/unit/auth/*.test.ts`

After all commits, verify with `git log --oneline` that the history is clean.
