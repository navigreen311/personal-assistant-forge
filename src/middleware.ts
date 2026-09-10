import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Paths that end in one of these extensions are served as static assets and
 * never require a session. Matched against `pathname` only -- `NextURL.pathname`
 * excludes the query string, so `?x=.png` cannot smuggle a path past it.
 *
 * `_next/static`, `_next/image`, `favicon.ico` and the raster/vector image
 * extensions in `config.matcher` below never reach this file at all; they are
 * listed here anyway so the rule stays correct if the matcher is ever widened.
 */
const STATIC_ASSET_PATTERN =
  /\.(?:css|js|mjs|cjs|map|json|webmanifest|txt|xml|ico|svg|png|jpe?g|gif|webp|avif|bmp|woff2?|ttf|otf|eot|mp4|webm|ogg|mp3|wav|pdf)$/i;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle CORS preflight requests
  if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    const response = new NextResponse(null, { status: 204 });
    response.headers.set('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Max-Age', '86400');
    return response;
  }

  // 1. Get the JWT token from the request
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const isAuthenticated = !!token;

  // 2. Define public paths that never require auth
  //
  // T-038. This used to end in `pathname.includes('.')` -- ANY path containing a
  // dot was public. `/dashboard/report.2024`, `/settings/profile.edit` and
  // `/admin.php` all matched, and so did `/api/anything.json`. It was not an
  // auth bypass only because step 4 below (the `/api/` 401) runs before step 5
  // (the public-path redirect), so API routes were caught first. That is an
  // ordering accident, not a control: moving step 5 above step 4, or adding a
  // dotted page route, turns it into one.
  //
  // The rule exists to let static assets through, so it now matches only a path
  // that ENDS in a known asset extension -- and never one under `/api/`, so the
  // guarantee no longer depends on the order of the checks below.
  const isStaticAsset =
    !pathname.startsWith('/api/') && STATIC_ASSET_PATTERN.test(pathname);

  const isPublicPath =
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    isStaticAsset;

  // 3. Auth page redirect: if authenticated user visits /login or /register, redirect to /dashboard
  if (isAuthenticated && (pathname.startsWith('/login') || pathname.startsWith('/register'))) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
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

  // P-18 / T-012. Three lines used to sit here setting `X-RateLimit-Limit: 100`,
  // `X-RateLimit-Remaining: 99` and a computed reset on EVERY API response, as
  // constants, above a comment conceding that "actual rate limiting should be
  // done at the infrastructure level". Nothing counted anything. A client that
  // trusted those headers was being handed a number nobody was keeping, and a
  // reviewer grepping for "rate limit" found them and concluded it was handled.
  //
  // They are gone rather than corrected here, for a reason worth stating: this
  // file is Next.js edge middleware, and the real limiter is Redis-backed
  // (`ioredis` is a Node TCP client and does not run on the edge runtime). So
  // this is structurally the wrong place to count. The limiter now runs inside
  // the route handlers, which are Node, and it sets the three headers itself —
  // if and only if a real count in Redis produced the numbers in them.
  //
  // See `src/shared/middleware/rate-limit.ts` for the tier table and for which
  // routes are covered. A route not listed there emits no rate-limit headers,
  // which is the honest report of "nothing is counting this one".

  return response;
}

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
