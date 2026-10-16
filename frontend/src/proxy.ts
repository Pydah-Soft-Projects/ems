import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const token = request.cookies.get('ems_token')?.value;
  const role = request.cookies.get('ems_role')?.value;
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/dashboard')) {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (role === 'student') {
      return NextResponse.redirect(new URL('/student', request.url));
    }
  }

  if (pathname.startsWith('/student') && !pathname.startsWith('/student/login')) {
    if (!token) {
      return NextResponse.redirect(new URL('/student/login', request.url));
    }
    if (role === 'super_admin' || role === 'staff') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  const hasSsoToken = request.nextUrl.searchParams.has('token');

  // If a request arrives with an SSO token on any route other than /login, redirect to /login to verify and authenticate
  if (hasSsoToken && pathname !== '/login') {
    const ssoRedirectUrl = new URL('/login', request.url);
    ssoRedirectUrl.searchParams.set('token', request.nextUrl.searchParams.get('token')!);
    return NextResponse.redirect(ssoRedirectUrl);
  }

  if (pathname === '/login' && token && !hasSsoToken) {
    if (role === 'student') {
      return NextResponse.redirect(new URL('/student', request.url));
    }
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (pathname === '/student/login' && token && !hasSsoToken) {
    if (role === 'student') {
      return NextResponse.redirect(new URL('/student', request.url));
    }
    if (role === 'super_admin' || role === 'staff') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/student', '/student/:path*'],
};
