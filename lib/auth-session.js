import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';

const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME || 'kalinga_opshub_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 5;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };
}

export function getSessionMaxAgeMs() {
  return SESSION_MAX_AGE_MS;
}

export async function getSessionCookieValue() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function verifySession() {
  const sessionCookie = await getSessionCookieValue();

  if (!sessionCookie) {
    return null;
  }

  try {
    return await adminAuth.verifySessionCookie(sessionCookie, true);
  } catch {
    return null;
  }
}
