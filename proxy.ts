import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/platform/auth/cookie';

// Presence check only — getSession() does the real verification.
export function proxy(req: NextRequest) {
  if (!req.cookies.get(SESSION_COOKIE)?.value) {
    const url = req.nextUrl.clone();
    const next = req.nextUrl.pathname + req.nextUrl.search;
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!login|api/mock|_next|.*\\..*).*)'],
};
