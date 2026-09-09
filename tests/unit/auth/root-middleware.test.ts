/**
 * P-23 / T-038 — `src/middleware.ts`: the dotted-path public rule.
 *
 * ============================================================================
 * THE DEFECT
 * ============================================================================
 *
 * Step 2 of the edge middleware ended in:
 *
 *     pathname.includes('.')
 *
 * so ANY path containing a dot was classified public and skipped the
 * unauthenticated redirect. `/dashboard/report.2024`, `/settings/profile.edit`,
 * `/admin.php` and `/api/anything.json` all matched.
 *
 * It was not an auth bypass in practice, and the reason is the only reason:
 * the `/api/` 401 (step 4) happens to run BEFORE the public-path redirect
 * (step 5), so API requests were refused before the dotted rule was consulted.
 * That is an ordering accident, not a control. Swapping those two blocks --
 * or shipping one page route with a dot in it -- turns it into an unauthorised
 * read.
 *
 * The rule exists so static assets are served without a session, so the fix is
 * to match a known asset extension at the END of the path, and never under
 * `/api/`. Both halves are asserted here:
 *
 *   - a dotted dashboard path is NOT public (redirect to /login)
 *   - static assets still load (no redirect, no 401)
 *
 * plus the ordering itself: `/api/x.json` with no session is 401 even though it
 * ends in a dot-extension, so the guarantee no longer depends on step 4 running
 * first.
 */

import { NextRequest } from 'next/server';

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}));

import { getToken } from 'next-auth/jwt';
import { middleware } from '@/middleware';

const mockedGetToken = getToken as jest.MockedFunction<typeof getToken>;

const ORIGIN = 'http://localhost:3000';

function req(pathname: string, method = 'GET'): NextRequest {
  return new NextRequest(`${ORIGIN}${pathname}`, { method });
}

function signedIn(): void {
  mockedGetToken.mockResolvedValue({
    userId: 'user-1',
    email: 'a@example.test',
    name: 'A',
    role: 'owner',
  } as never);
}

function signedOut(): void {
  mockedGetToken.mockResolvedValue(null);
}

/** A redirect to /login is how the middleware refuses an unauthenticated page. */
function isLoginRedirect(res: Response): boolean {
  if (res.status !== 307 && res.status !== 308 && res.status !== 302) return false;
  const location = res.headers.get('location');
  return !!location && new URL(location).pathname === '/login';
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// T-038 — half one: a dotted path is not public
// ---------------------------------------------------------------------------

describe('T-038: a dotted page path is not public', () => {
  const DOTTED_PAGES = [
    '/dashboard/report.2024',
    '/settings/profile.edit',
    '/entities/acme.co/tasks',
    '/admin.php',
    '/knowledge/v1.2',
    '/finance/q3.summary',
  ];

  it.each(DOTTED_PAGES)('%s redirects an anonymous caller to /login', async (pathname) => {
    signedOut();

    const res = await middleware(req(pathname));

    expect(isLoginRedirect(res)).toBe(true);
  });

  it('carries the original path through as callbackUrl', async () => {
    signedOut();

    const res = await middleware(req('/dashboard/report.2024'));
    const location = new URL(res.headers.get('location')!);

    expect(location.searchParams.get('callbackUrl')).toBe('/dashboard/report.2024');
  });

  it('still serves a dotted page to a signed-in caller', async () => {
    signedIn();

    const res = await middleware(req('/dashboard/report.2024'));

    expect(isLoginRedirect(res)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T-038 — half two: static assets still load
// ---------------------------------------------------------------------------

describe('T-038: static assets remain public', () => {
  const ASSETS = [
    '/styles/main.css',
    '/scripts/app.js',
    '/scripts/app.js.map',
    '/robots.txt',
    '/sitemap.xml',
    '/site.webmanifest',
    '/manifest.json',
    '/fonts/inter.woff2',
    '/fonts/inter.ttf',
    '/icons/apple-touch-icon.png',
    '/media/intro.mp4',
    '/docs/handbook.pdf',
    '/favicon.ico',
    '/_next/static/chunks/main.js',
  ];

  it.each(ASSETS)('%s is served without a session', async (pathname) => {
    signedOut();

    const res = await middleware(req(pathname));

    expect(isLoginRedirect(res)).toBe(false);
    expect(res.status).toBe(200);
  });

  it('matches the extension at the end of the path, not anywhere in it', async () => {
    signedOut();

    // Ends in `.css` -> asset. Contains `.css` mid-path -> not an asset.
    expect(isLoginRedirect(await middleware(req('/a/b/theme.css')))).toBe(false);
    expect(isLoginRedirect(await middleware(req('/theme.css/secret')))).toBe(true);
  });

  it('is not fooled by an extension in the query string', async () => {
    signedOut();

    const res = await middleware(
      new NextRequest(`${ORIGIN}/dashboard/secrets?download=report.png`)
    );

    expect(isLoginRedirect(res)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-038 — half three: the fix no longer leans on check ordering
// ---------------------------------------------------------------------------

describe('T-038: /api/ is never classified as a static asset', () => {
  const DOTTED_API = ['/api/tasks/export.json', '/api/reports/summary.csv', '/api/config.js'];

  it.each(DOTTED_API)('%s returns 401 with no session', async (pathname) => {
    signedOut();

    const res = await middleware(req(pathname));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: 'Unauthorized' });
  });

  it('still exempts /api/auth and /api/health', async () => {
    signedOut();

    expect((await middleware(req('/api/auth/session'))).status).toBe(200);
    expect((await middleware(req('/api/health'))).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Behaviour that must not have moved
// ---------------------------------------------------------------------------

describe('unchanged middleware behaviour', () => {
  it('lets an anonymous caller reach /, /login and /register', async () => {
    signedOut();

    for (const p of ['/', '/login', '/register']) {
      expect(isLoginRedirect(await middleware(req(p)))).toBe(false);
    }
  });

  it('redirects a signed-in caller away from /login to /dashboard', async () => {
    signedIn();

    const res = await middleware(req('/login'));
    const location = new URL(res.headers.get('location')!);

    expect(location.pathname).toBe('/dashboard');
  });

  it('answers a CORS preflight on /api/ with 204 before touching auth', async () => {
    signedOut();

    const res = await middleware(req('/api/tasks', 'OPTIONS'));

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('PATCH');
  });

  it('refuses an unauthenticated protected API route with 401', async () => {
    signedOut();

    const res = await middleware(req('/api/tasks'));

    expect(res.status).toBe(401);
  });

  it('sets rate-limit headers on authenticated API responses', async () => {
    signedIn();

    const res = await middleware(req('/api/tasks'));

    expect(res.headers.get('X-RateLimit-Limit')).toBe('100');
  });
});
