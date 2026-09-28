import { NextResponse } from 'next/server';

// Routes that require authentication
const PROTECTED_ROUTES = ['/account', '/checkout'];
// Routes that require admin/staff role
const ADMIN_ROUTES = ['/admin'];
// Routes that authenticated users should not see
const AUTH_ROUTES = ['/login'];

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Read the access token from the HTTP-only cookie
  // (cookie name must match what the backend sets)
  const token = request.cookies.get('accessToken')?.value;

  // --- Protected routes: require auth ---
  const isProtected = PROTECTED_ROUTES.some(route => pathname.startsWith(route));
  const isAdmin = ADMIN_ROUTES.some(route => pathname.startsWith(route));

  if ((isProtected || isAdmin) && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // --- Admin routes: verify role claim from JWT ---
  if (isAdmin && token) {
    try {
      // Decode JWT payload (middleware cannot verify signature — that's the
      // backend's job). We only read the `role` claim for client-side gating.
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString()
      );
      if (!['admin', 'staff'].includes(payload.role)) {
        return NextResponse.redirect(new URL('/', request.url));
      }
    } catch {
      // Malformed token — redirect to login
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // --- Auth routes: redirect logged-in users away from /login ---
  const isAuthRoute = AUTH_ROUTES.some(route => pathname.startsWith(route));
  if (isAuthRoute && token) {
    return NextResponse.redirect(new URL('/account', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Only run middleware on page routes, not on static assets or API calls
  matcher: [
    '/account/:path*',
    '/checkout/:path*',
    '/admin/:path*',
    '/login',
  ],
};
