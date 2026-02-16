# Worker 04: Middleware, CORS, Config, Health Check

## Branch

`ai-feature/p2-w04-middleware`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside this list:

- `src/middleware.ts` (create)
- `next.config.ts` (update -- already exists with empty config)
- `src/app/api/health/route.ts` (create)

**DO NOT modify:**
- `jest.config.ts`
- `package.json`
- `src/lib/auth/config.ts` (read only)
- `src/lib/db/index.ts` (read only -- import from here for DB health check)
- Any files in `src/app/(dashboard)/`, `src/components/`, `src/shared/`

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`src/lib/auth/config.ts`** -- Auth configuration with NextAuth options. Note `pages.signIn: '/login'`, `session.strategy: 'jwt'`, and `secret: process.env.NEXTAUTH_SECRET`.
2. **`src/lib/auth/types.ts`** -- Session type augmentation with `userId`, `role`, `activeEntityId` on the JWT token.
3. **`src/lib/db/index.ts`** -- The Prisma client singleton. Use for health check DB connectivity test.
4. **`next.config.ts`** -- Currently empty. You will add security headers, image domains, and other config.
5. **`package.json`** -- Dependencies include `next-auth@^4.24.13`, `next@16.1.6`, `@prisma/client`.
6. **`tsconfig.json`** -- Path aliases: `@/*` maps to `./src/*`.
7. **`src/app/api/`** -- List existing API route directories to understand what routes exist.
8. **`src/app/(auth)/`** -- Auth pages exist at `login` and `register`.

## Requirements

### 1. Middleware (`src/middleware.ts`)

Create the Next.js middleware file at the project root `src/middleware.ts`:

```typescript
import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
```

**Authentication logic:**

Route categories and their protection rules:

| Route Pattern | Auth Required | Behavior |
|--------------|---------------|----------|
| `/login`, `/register` | No | If user IS authenticated, redirect to `/inbox` |
| `/api/auth/*` | No | Pass through (NextAuth handler routes) |
| `/api/health` | No | Pass through (public health check) |
| `/api/*` | Yes | Return 401 JSON `{ error: 'Unauthorized' }` if no valid token |
| `/inbox`, `/calendar`, `/tasks`, etc. (all dashboard routes) | Yes | Redirect to `/login` if no valid token |
| `/`, `/not-found`, static assets | No | Pass through |

**Implementation details:**

```typescript
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Get the JWT token from the request
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const isAuthenticated = !!token;

  // 2. Define public paths that never require auth
  const isPublicPath =
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.');

  // 3. Auth page redirect: if authenticated user visits /login or /register, redirect to /inbox
  if (isAuthenticated && (pathname.startsWith('/login') || pathname.startsWith('/register'))) {
    return NextResponse.redirect(new URL('/inbox', request.url));
  }

  // 4. Protected API routes: return 401 JSON
  if (!isAuthenticated && pathname.startsWith('/api/') && !pathname.startsWith('/api/auth') && !pathname.startsWith('/api/health')) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  // 5. Protected dashboard routes: redirect to /login
  if (!isAuthenticated && !isPublicPath) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 6. Add response headers
  const response = NextResponse.next();

  // CORS headers for API routes
  if (pathname.startsWith('/api/')) {
    response.headers.set('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Max-Age', '86400');
  }

  // Rate limit headers (informational -- actual rate limiting should be done at the infrastructure level)
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth')) {
    response.headers.set('X-RateLimit-Limit', '100');
    response.headers.set('X-RateLimit-Remaining', '99'); // Placeholder -- real tracking would use Redis
    response.headers.set('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + 3600));
  }

  return response;
}
```

**Matcher configuration:**

```typescript
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

**Key requirements:**
- Use `getToken` from `next-auth/jwt` (not `getServerSession` -- middleware runs on Edge and cannot use full auth helpers).
- The `callbackUrl` query parameter on the login redirect allows NextAuth to redirect back after login.
- CORS headers only apply to `/api/*` routes.
- The `ALLOWED_ORIGIN` env variable controls CORS. Defaults to `*` for development.
- Rate limit headers are informational placeholders. Real rate limiting requires Redis/infrastructure.
- Handle `OPTIONS` preflight requests for CORS by allowing them through.

### 2. Update Next.js Config (`next.config.ts`)

Update the existing `next.config.ts` with security headers and image configuration:

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.gravatar.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        pathname: '/**',
      },
    ],
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=(), interest-cohort=()',
          },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, max-age=0',
          },
        ],
      },
    ];
  },

  // Logging
  logging: {
    fetches: {
      fullUrl: true,
    },
  },

  // Experimental features
  experimental: {
    // Enable server actions (may already be default in Next 16)
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
```

**Security headers explained:**
- `X-Frame-Options: DENY` -- Prevents clickjacking by disallowing iframe embedding.
- `X-Content-Type-Options: nosniff` -- Prevents MIME type sniffing.
- `Referrer-Policy: strict-origin-when-cross-origin` -- Controls referrer information sent with requests.
- `X-DNS-Prefetch-Control: on` -- Enables DNS prefetching for performance.
- `Strict-Transport-Security` -- Forces HTTPS with a 1-year max-age.
- `Permissions-Policy` -- Restricts browser features. Allows microphone (for voice features) from self only.
- API routes get `Cache-Control: no-store` to prevent caching of dynamic data.

**Image domains:**
- Google user content (Google OAuth profile photos)
- Gravatar (common avatar service)
- GitHub avatars
- Add more domains as needed when integrations are wired up.

**Notes:**
- Do NOT add `Content-Security-Policy` yet -- it requires careful tuning for inline scripts/styles used by Next.js. That is a Phase 3 task.
- The `experimental.serverActions.bodySizeLimit` allows larger payloads for document upload actions.
- If `next.config.ts` includes any existing fields you did not add, preserve them.

### 3. Health Check API (`src/app/api/health/route.ts`)

Create a health check endpoint:

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: {
      status: 'ok' | 'error';
      latencyMs?: number;
      error?: string;
    };
  };
}

export async function GET(): Promise<NextResponse<HealthStatus>> {
  const startTime = Date.now();
  let dbStatus: HealthStatus['checks']['database'] = { status: 'ok' };

  // Check database connectivity
  if (process.env.DATABASE_URL) {
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = {
        status: 'ok',
        latencyMs: Date.now() - dbStart,
      };
    } catch (error) {
      dbStatus = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown database error',
      };
    }
  } else {
    dbStatus = {
      status: 'error',
      error: 'DATABASE_URL not configured',
    };
  }

  const overallStatus = dbStatus.status === 'ok' ? 'ok' : 'degraded';

  const health: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    uptime: process.uptime(),
    checks: {
      database: dbStatus,
    },
  };

  return NextResponse.json(health, {
    status: overallStatus === 'ok' ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

// Disable static optimization for this route
export const dynamic = 'force-dynamic';
```

**Requirements:**
- GET only -- no other HTTP methods.
- Always returns JSON with the `HealthStatus` shape.
- Checks database connectivity using `prisma.$queryRaw\`SELECT 1\`` -- a minimal query.
- Measures database latency in milliseconds.
- Returns `200` when all checks pass, `503` when any check fails.
- Overall status: `'ok'` if all checks pass, `'degraded'` if some fail, `'error'` if critical systems are down.
- Includes `timestamp` (ISO 8601), `version` (from package.json via env), and `uptime` (process.uptime in seconds).
- `Cache-Control: no-store` to prevent caching.
- `dynamic = 'force-dynamic'` to ensure this is never statically generated.
- If `DATABASE_URL` is not set, report database status as error with descriptive message (do not crash).
- This endpoint is intentionally public (no auth required) so monitoring systems can hit it.

## Acceptance Criteria

1. **Middleware protects dashboard routes**: Navigating to `/inbox` without a session redirects to `/login?callbackUrl=/inbox`.
2. **Middleware protects API routes**: Calling `GET /api/inbox` without a session returns `{ "error": "Unauthorized" }` with status 401.
3. **Auth routes are public**: `/login` and `/register` are accessible without a session.
4. **Auth redirect for authenticated users**: An authenticated user visiting `/login` is redirected to `/inbox`.
5. **NextAuth routes pass through**: `/api/auth/signin`, `/api/auth/session`, etc. are not blocked by middleware.
6. **Health check returns 200**: `GET /api/health` returns `{ "status": "ok", ... }` with status 200 when the database is connected.
7. **Health check handles DB failure**: If the database is unreachable, the health check returns status 503 with `"status": "degraded"`.
8. **CORS headers present**: API responses include `Access-Control-Allow-Origin` and related headers.
9. **Security headers present**: All page responses include `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Strict-Transport-Security`.
10. **Rate limit headers present**: API responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
11. **No TypeScript errors**: `npx tsc --noEmit` succeeds.
12. **Build succeeds**: `npm run build` completes without errors.

## Implementation Steps

1. **Read context files**: Read `src/lib/auth/config.ts`, `src/lib/auth/types.ts`, `src/lib/db/index.ts`, `next.config.ts`, `package.json`, `tsconfig.json`. List `src/app/api/` to see existing API routes.
2. **Create branch**: `git checkout -b ai-feature/p2-w04-middleware`
3. **Create `src/middleware.ts`**: Implement the full middleware with auth checks, CORS, and rate limit headers.
4. **Update `next.config.ts`**: Add image domains, security headers, and config options.
5. **Create `src/app/api/health/route.ts`**: Implement the health check endpoint.
6. **Verify middleware**: Start `npm run dev`, test unauthenticated access to dashboard routes (should redirect), test unauthenticated API access (should return 401), test public routes (should pass through).
7. **Verify health check**: `curl http://localhost:3000/api/health` should return 200 with health status.
8. **Verify headers**: Use browser DevTools or `curl -I` to check security headers on page responses and CORS headers on API responses.
9. **Type-check**: Run `npx tsc --noEmit`.
10. **Build**: Run `npm run build`.
11. **Commit**: Use conventional commits.

## Tests Required

Create tests in `tests/unit/middleware/` if desired, but since middleware is tightly coupled to Next.js internals and `getToken`, the primary verification is integration-level:

- `npm run build` succeeds
- Manual curl/browser testing of all route categories
- `npx tsc --noEmit` passes

If you add unit tests, focus on:
- Testing the path-matching logic (extract public path check into a pure function)
- Testing the CORS header values

## Commit Strategy

Make atomic commits in this order:

1. `feat(middleware): add auth middleware with route protection and CORS headers`
   - Files: `src/middleware.ts`
2. `chore(config): add security headers, image domains, and server action config to next.config.ts`
   - Files: `next.config.ts`
3. `feat(api): add health check endpoint with database connectivity test`
   - Files: `src/app/api/health/route.ts`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
