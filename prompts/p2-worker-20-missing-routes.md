# Worker 20: Missing API Routes, Pages, and Rate Limiting

## Branch

`ai-feature/p2-w20-missing-routes`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these directories:

```
src/app/api/settings/                  # Settings API routes (create)
src/app/api/onboarding/                # Onboarding API routes (create)
src/app/api/notifications/             # Notifications API routes (create)
src/app/(dashboard)/settings/          # Settings dashboard page (create or modify)
src/app/(dashboard)/billing/           # Billing dashboard page (create)
src/shared/middleware/rate-limit.ts     # Rate limiter middleware (create)
src/shared/middleware/cors.ts           # CORS helper middleware (create)
tests/unit/middleware/                  # Unit tests for rate limiter and CORS
tests/unit/settings/                   # Unit tests for settings endpoint
```

**DO NOT modify these files:**
- `jest.config.ts`
- `package.json`
- `src/lib/ai/` -- read only
- `src/shared/middleware/auth.ts` -- read only (but use it in your routes)
- `src/shared/types/index.ts` -- read only
- `src/shared/utils/api-response.ts` -- read only
- `src/lib/db/index.ts` -- read only
- `prisma/schema.prisma` -- read only

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project-wide dev process, commit conventions, done criteria |
| `src/shared/middleware/auth.ts` | Auth middleware: `withAuth(req, handler)`, `withRole(req, roles, handler)`, `withEntityAccess(req, entityId, handler)` -- understand the `AuthSession` shape |
| `src/lib/auth/types.ts` | Auth types: `AuthSession { userId, email, name, role, activeEntityId }` and `UserRole` |
| `src/shared/types/index.ts` | Shared types -- look for `User`, `UserPreferences`, `Entity`, `Notification` types if they exist |
| `src/shared/utils/api-response.ts` | API helpers: `success<T>()`, `error()`, `paginated<T>()` |
| `src/lib/db/index.ts` | Prisma client singleton: `import { prisma } from '@/lib/db'` |
| `prisma/schema.prisma` | Database schema -- understand the User model, UserPreferences, any Notification model |
| `src/modules/onboarding/types.ts` | Onboarding types (OnboardingWizard, OnboardingStep, DataMigrationSource) |
| `src/modules/onboarding/services/wizard-service.ts` | Onboarding wizard service -- understand `getWizard()`, `completeStep()`, `getProgress()` |
| `package.json` | Check available dependencies -- confirm `ioredis` is available or note it needs to be imported |
| `tsconfig.json` | Path aliases: `@/` maps to `src/` |

## Requirements

### 1. Settings API (`src/app/api/settings/route.ts`)

Create a settings route that manages user preferences.

```typescript
// GET /api/settings
// Returns the authenticated user's settings
// Response: ApiResponse<UserSettings>

// PATCH /api/settings
// Updates the authenticated user's settings (partial update)
// Body: Partial<UserSettings>
// Response: ApiResponse<UserSettings>
```

**UserSettings type** (define at top of route file or in a local types file):
```typescript
interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  language: string;            // e.g., 'en', 'es', 'fr'
  timezone: string;            // e.g., 'America/New_York'
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  timeFormat: '12h' | '24h';
  notifications: {
    email: boolean;
    push: boolean;
    sms: boolean;
    digest: 'daily' | 'weekly' | 'none';
    quietHoursStart?: string;  // HH:mm
    quietHoursEnd?: string;
  };
  accessibility: {
    reduceMotion: boolean;
    highContrast: boolean;
    fontSize: 'small' | 'medium' | 'large';
  };
}
```

Implementation:
- Use `withAuth()` for both GET and PATCH.
- GET: Load settings from the database. If no settings record exists, return defaults.
- PATCH: Validate body with Zod. Merge with existing settings. Save to database.
- Use `session.userId` from auth -- do not accept userId as a query parameter.
- Return `success(settings)` on success, `error()` on validation/server failure.

### 2. Onboarding API (`src/app/api/onboarding/route.ts`)

Create onboarding routes that expose the wizard service.

```typescript
// GET /api/onboarding
// Returns the current onboarding wizard state for the authenticated user
// Response: ApiResponse<OnboardingWizard | null>

// POST /api/onboarding
// Initializes a new onboarding wizard for the authenticated user
// Response: ApiResponse<OnboardingWizard>

// PATCH /api/onboarding
// Updates a step (complete or skip)
// Body: { stepId: string; action: 'complete' | 'skip' }
// Response: ApiResponse<OnboardingWizard>
```

Create a second route for migration status:

**`src/app/api/onboarding/migration/route.ts`**
```typescript
// GET /api/onboarding/migration
// Returns available data migration sources and their status
// Response: ApiResponse<DataMigrationSource[]>

// POST /api/onboarding/migration
// Initiates a data import from a source
// Body: { sourceId: string }
// Response: ApiResponse<DataMigrationSource>
```

Implementation:
- Use `withAuth()` for all handlers.
- Import and call the onboarding wizard service and migration service.
- Use Zod for request body validation.

### 3. Notifications API (`src/app/api/notifications/route.ts`)

Create a notifications route for managing user notifications.

```typescript
// GET /api/notifications
// Returns notifications for the authenticated user
// Query params: ?read=true|false&limit=50&offset=0
// Response: ApiResponse<Notification[]> with pagination

// PATCH /api/notifications
// Mark notifications as read
// Body: { ids: string[] } or { all: true }
// Response: ApiResponse<{ updated: number }>

// DELETE /api/notifications
// Delete notifications
// Body: { ids: string[] }
// Response: ApiResponse<{ deleted: number }>
```

**Notification type** (define locally if not in shared types):
```typescript
interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: 'info' | 'warning' | 'error' | 'success';
  source: string;
  isRead: boolean;
  actionUrl?: string;
  createdAt: Date;
}
```

Implementation:
- Use `withAuth()` for all handlers.
- GET supports filtering by read/unread status and pagination via `limit`/`offset` query params.
- PATCH supports marking specific IDs or all notifications as read.
- DELETE supports deleting specific notification IDs.
- Use `session.userId` to scope all queries to the authenticated user.
- Use `paginated()` for the GET response when pagination is used.

### 4. Settings Dashboard Page (`src/app/(dashboard)/settings/page.tsx`)

Create or update the settings page. Check if it already exists and is incomplete.

The page should include these sections:

1. **Profile Section**: Display user name, email, avatar. Link to edit profile.
2. **Appearance**: Theme selector (light/dark/system), font size, reduce motion toggle, high contrast toggle.
3. **Notifications**: Email/push/SMS toggles, digest frequency selector, quiet hours configuration.
4. **Regional**: Timezone selector, date format, time format, language selector.
5. **Entity Management**: List of user's entities with active entity indicator. Link to entity settings.
6. **API Keys**: Display masked API keys with copy and regenerate buttons (placeholder UI).
7. **Danger Zone**: Account deletion button with confirmation dialog (placeholder, no actual delete logic).

Implementation:
- This is a `'use client'` component.
- Fetch settings from `GET /api/settings` on mount.
- Save changes via `PATCH /api/settings`.
- Use Tailwind CSS for styling. No external UI libraries.
- Show loading states and error handling.
- Accessible: proper labels, ARIA attributes, keyboard navigation.

### 5. Billing Dashboard Page (`src/app/(dashboard)/billing/page.tsx`)

Create the billing page.

Sections:

1. **Current Plan**: Display subscription tier (Free/Pro/Enterprise), renewal date, status.
2. **Usage Metrics**: AI token usage bar chart (used vs. limit), API call count, storage used.
3. **Plan Selection**: Cards for each plan tier with features list and pricing. "Upgrade" / "Downgrade" buttons (placeholder, no actual Stripe integration yet).
4. **Payment History**: Table of past invoices with date, amount, status, download link (placeholder data).
5. **Payment Method**: Display masked card info. "Update Payment Method" button (placeholder).

Implementation:
- This is a `'use client'` component.
- Use placeholder/mock data for billing info since Stripe integration is not yet wired.
- Add a TODO comment noting where Stripe integration will be added.
- Use Tailwind CSS for styling. No external UI libraries.
- Show clear "Coming Soon" or placeholder indicators for non-functional payment actions.

### 6. Rate Limiter Middleware (`src/shared/middleware/rate-limit.ts`)

Create a Redis-backed sliding window rate limiter.

```typescript
import type { NextRequest } from 'next/server';

export interface RateLimitConfig {
  limit: number;               // max requests
  windowMs: number;            // time window in milliseconds
  keyPrefix?: string;          // Redis key prefix, default 'rl:'
  identifierFn?: (req: NextRequest) => string;  // custom identifier, default uses IP
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterMs?: number;
}

// Check rate limit and return result (does not send response)
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult>;

// Middleware wrapper: wraps a handler with rate limiting
export function withRateLimit(
  limit: number,
  windowMs: number,
  options?: Partial<RateLimitConfig>
): (req: NextRequest, handler: (req: NextRequest) => Promise<Response>) => Promise<Response>;
```

Implementation:
- Use `ioredis` for Redis connectivity. Import: `import Redis from 'ioredis'`.
- Create a Redis client singleton (similar pattern to Prisma singleton).
- Redis connection URL from `process.env.REDIS_URL` with fallback to `redis://localhost:6379`.
- **Sliding window algorithm**: Use a Redis sorted set per identifier. Each request adds a member with the current timestamp as the score. Remove members outside the window. Count remaining members. If count >= limit, deny.
- `withRateLimit()` should:
  1. Extract identifier from request (default: IP from `x-forwarded-for` header or `request.ip`).
  2. Call `checkRateLimit()`.
  3. If denied, return a 429 response with `Retry-After` header and JSON error body using `error('RATE_LIMITED', 'Too many requests', 429)`.
  4. If allowed, set `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers on the response.
- Handle Redis connection failures gracefully: if Redis is unavailable, **allow the request** (fail open) and log a warning.
- Export both `checkRateLimit` (for custom usage) and `withRateLimit` (for middleware usage).

### 7. CORS Middleware (`src/shared/middleware/cors.ts`)

Create a CORS helper for API routes.

```typescript
import type { NextRequest } from 'next/server';

export interface CorsConfig {
  allowedOrigins: string[];     // e.g., ['https://app.example.com']
  allowedMethods?: string[];    // default: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  allowedHeaders?: string[];    // default: ['Content-Type', 'Authorization']
  exposedHeaders?: string[];    // headers the browser can access
  maxAge?: number;              // preflight cache in seconds, default 86400
  credentials?: boolean;        // default true
}

// Apply CORS headers to a response
export function applyCorsHeaders(
  response: Response,
  origin: string,
  config: CorsConfig
): Response;

// Handle OPTIONS preflight request
export function handlePreflight(
  request: NextRequest,
  config: CorsConfig
): Response;

// Middleware wrapper: wraps a handler with CORS
export function withCors(
  config: CorsConfig
): (req: NextRequest, handler: (req: NextRequest) => Promise<Response>) => Promise<Response>;
```

Implementation:
- `allowedOrigins` supports exact matches and wildcard `'*'` (allow all -- warn in comments that this is for development only).
- `withCors()` should:
  1. Check if the request is an OPTIONS preflight -- if so, return `handlePreflight()`.
  2. Otherwise, call the handler and apply CORS headers to the response.
- CORS headers to set:
  - `Access-Control-Allow-Origin`: The requesting origin if it's in the allowed list, or omit if not.
  - `Access-Control-Allow-Methods`: Configured methods.
  - `Access-Control-Allow-Headers`: Configured headers.
  - `Access-Control-Expose-Headers`: Configured exposed headers.
  - `Access-Control-Max-Age`: Preflight cache duration.
  - `Access-Control-Allow-Credentials`: `'true'` if credentials enabled.
- Default allowed origins from `process.env.CORS_ALLOWED_ORIGINS` (comma-separated) with fallback to `['http://localhost:3000']`.

### 8. Apply Auth to All New Routes

All routes created in this worker MUST be wrapped with `withAuth()`:
- `src/app/api/settings/route.ts` -- `withAuth()`
- `src/app/api/onboarding/route.ts` -- `withAuth()`
- `src/app/api/onboarding/migration/route.ts` -- `withAuth()`
- `src/app/api/notifications/route.ts` -- `withAuth()`

## Acceptance Criteria

- [ ] `GET /api/settings` returns user settings with defaults for new users
- [ ] `PATCH /api/settings` validates and persists partial updates
- [ ] `GET /api/onboarding` returns wizard state or null
- [ ] `POST /api/onboarding` initializes a new wizard
- [ ] `PATCH /api/onboarding` completes or skips a step
- [ ] `GET /api/onboarding/migration` returns available migration sources
- [ ] `POST /api/onboarding/migration` initiates an import
- [ ] `GET /api/notifications` returns filtered, paginated notifications
- [ ] `PATCH /api/notifications` marks notifications as read (specific IDs or all)
- [ ] `DELETE /api/notifications` deletes specific notifications
- [ ] Settings page renders with all 7 sections and saves changes
- [ ] Billing page renders with placeholder data and clear "Coming Soon" indicators
- [ ] Rate limiter uses Redis sliding window algorithm
- [ ] Rate limiter returns 429 with `Retry-After` header when limit exceeded
- [ ] Rate limiter fails open when Redis is unavailable
- [ ] Rate limiter sets `X-RateLimit-*` headers on allowed responses
- [ ] CORS middleware handles OPTIONS preflight correctly
- [ ] CORS middleware sets correct headers for allowed origins
- [ ] CORS middleware rejects requests from disallowed origins
- [ ] ALL new routes are protected with `withAuth()`
- [ ] All routes use Zod for request validation
- [ ] All routes use `success()`, `error()`, `paginated()` response helpers
- [ ] No modifications to `jest.config.ts` or `package.json`
- [ ] `npx tsc --noEmit` passes with no errors in owned paths

## Implementation Steps

1. **Read context files**: Read `src/shared/middleware/auth.ts`, `src/lib/auth/types.ts`, `src/shared/types/index.ts`, `prisma/schema.prisma`, `src/modules/onboarding/services/wizard-service.ts`, `src/modules/onboarding/services/migration-service.ts`, `package.json`.
2. **Create branch**: `git checkout -b ai-feature/p2-w20-missing-routes`
3. **Create rate limiter**: `src/shared/middleware/rate-limit.ts` -- Redis sliding window implementation.
4. **Create CORS middleware**: `src/shared/middleware/cors.ts` -- CORS helper with configurable origins.
5. **Create settings API**: `src/app/api/settings/route.ts` -- GET/PATCH with auth and Zod validation.
6. **Create onboarding API**: `src/app/api/onboarding/route.ts` and `src/app/api/onboarding/migration/route.ts`.
7. **Create notifications API**: `src/app/api/notifications/route.ts` -- GET/PATCH/DELETE with auth.
8. **Create settings page**: `src/app/(dashboard)/settings/page.tsx` -- Full settings UI.
9. **Create billing page**: `src/app/(dashboard)/billing/page.tsx` -- Placeholder billing UI.
10. **Write tests**: Unit tests for rate limiter, CORS, and settings endpoint.
11. **Verify**: Run `npx tsc --noEmit`, `npx jest tests/unit/middleware/ tests/unit/settings/`, `npx next build`.

## Tests Required

### `tests/unit/middleware/rate-limit.test.ts`

```typescript
// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    zadd: jest.fn().mockResolvedValue(1),
    zremrangebyscore: jest.fn().mockResolvedValue(0),
    zcard: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(1),
    pipeline: jest.fn().mockReturnValue({
      zadd: jest.fn().mockReturnThis(),
      zremrangebyscore: jest.fn().mockReturnThis(),
      zcard: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([[null, 1], [null, 0], [null, 1], [null, 1]]),
    }),
  }));
});

describe('checkRateLimit', () => {
  it('should allow requests within the limit');
  it('should deny requests exceeding the limit');
  it('should return correct remaining count');
  it('should return correct resetAt timestamp');
  it('should use sliding window (allow after window passes)');
});

describe('withRateLimit', () => {
  it('should pass through when under limit');
  it('should return 429 when limit exceeded');
  it('should set X-RateLimit-Limit header');
  it('should set X-RateLimit-Remaining header');
  it('should set X-RateLimit-Reset header');
  it('should set Retry-After header on 429');
  it('should fail open when Redis is unavailable');
  it('should extract IP from x-forwarded-for header');
});
```

### `tests/unit/middleware/cors.test.ts`

```typescript
describe('handlePreflight', () => {
  it('should return 204 for valid preflight from allowed origin');
  it('should set correct CORS headers');
  it('should reject preflight from disallowed origin');
});

describe('withCors', () => {
  it('should add CORS headers to response for allowed origin');
  it('should not add headers for disallowed origin');
  it('should handle wildcard origin');
  it('should handle OPTIONS request as preflight');
  it('should pass through to handler for non-OPTIONS requests');
  it('should set Access-Control-Allow-Credentials when configured');
});

describe('applyCorsHeaders', () => {
  it('should set all configured headers');
  it('should use default methods when not configured');
  it('should use default headers when not configured');
});
```

### `tests/unit/settings/settings-api.test.ts`

```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

describe('GET /api/settings', () => {
  it('should return 401 for unauthenticated requests');
  it('should return default settings for new users');
  it('should return stored settings for existing users');
});

describe('PATCH /api/settings', () => {
  it('should return 401 for unauthenticated requests');
  it('should validate request body with Zod');
  it('should reject invalid theme value');
  it('should reject invalid timezone');
  it('should merge partial updates with existing settings');
  it('should persist updated settings');
});
```

Mock `@/lib/db`, `@/shared/middleware/auth`, and `ioredis` in all tests.

## Commit Strategy

Use Conventional Commits. Commit after each logical unit is complete and compiling.

```
feat(middleware): create Redis-backed sliding window rate limiter
feat(middleware): create CORS helper middleware with configurable origins
feat(settings): create settings API with GET/PATCH and auth protection
feat(onboarding): create onboarding API exposing wizard and migration services
feat(notifications): create notifications API with filtering and bulk operations
feat(settings): create settings dashboard page with profile, appearance, and notifications
feat(billing): create billing dashboard page with placeholder Stripe integration
test(middleware): add unit tests for rate limiter sliding window algorithm
test(middleware): add unit tests for CORS middleware
test(settings): add unit tests for settings API endpoints
chore(routes): verify build and final cleanup
```

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
