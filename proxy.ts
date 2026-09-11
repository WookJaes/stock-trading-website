import { NextRequest, NextResponse } from 'next/server';
import { authCookie, verifySession } from '@/lib/auth';

const PUBLIC_PATHS = new Set(['/login', '/api/auth/login']);

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (PUBLIC_PATHS.has(path)) {
    if (path === '/login' && await verifySession(request.cookies.get(authCookie.name)?.value)) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  if (await verifySession(request.cookies.get(authCookie.name)?.value)) return NextResponse.next();
  if (path.startsWith('/api/')) return NextResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 });

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', `${path}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|robots.txt).*)'],
};
