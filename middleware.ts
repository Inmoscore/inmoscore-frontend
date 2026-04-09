import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const INMOSCORE_TOKEN_COOKIE = 'inmoscore_token';

export function middleware(request: NextRequest) {
  const token = request.cookies.get(INMOSCORE_TOKEN_COOKIE)?.value;
  const hasCookie = !!token && token.trim().length > 0;
  const { pathname } = request.nextUrl;

  const isProtectedRoute =
    pathname.startsWith('/buscar') || pathname.startsWith('/reportar');

  const isGuestOnlyRoute =
    pathname.startsWith('/login') || pathname.startsWith('/register');

  if (isProtectedRoute && !hasCookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  if (isGuestOnlyRoute && hasCookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/buscar',
    '/buscar/:path*',
    '/reportar',
    '/reportar/:path*',
    '/login',
    '/login/:path*',
    '/register',
    '/register/:path*',
  ],
};