import { NextResponse } from 'next/server';
import {
  getSessionCookieName,
  getSessionCookieOptions,
  verifySession,
} from '@/lib/auth-session';
import { adminAuth } from '@/lib/firebase-admin';

export async function POST() {
  const session = await verifySession();
  const response = NextResponse.json({ success: true });

  response.cookies.set({
    name: getSessionCookieName(),
    value: '',
    ...getSessionCookieOptions(),
    maxAge: 0,
  });

  if (session?.sub) {
    try {
      await adminAuth.revokeRefreshTokens(session.sub);
    } catch (error) {
      console.error('Failed to revoke Firebase refresh tokens.', error);
    }
  }

  return response;
}
