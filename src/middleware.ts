import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const authCookie = request.cookies.get('isAuthenticated');
  const isAuthenticated = authCookie?.value === 'true';
  const isLoginPage = request.nextUrl.pathname === '/login';
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/');

  // Debug logging (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔐 Middleware: ${request.nextUrl.pathname}`, {
      hasCookie: !!authCookie,
      cookieValue: authCookie?.value,
      isAuthenticated,
      isLoginPage,
      isApiRoute
    });
  }

  // Allow API routes to pass through (they handle their own auth if needed)
  if (isApiRoute) {
    return NextResponse.next();
  }

  // Redirect to login if not authenticated and not on login page
  if (!isAuthenticated && !isLoginPage) {
    console.log(`🔐 Redirecting to login from: ${request.nextUrl.pathname}`);
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Redirect to home if authenticated and on login page
  if (isAuthenticated && isLoginPage) {
    console.log(`🔐 Redirecting to home from login page`);
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}; 