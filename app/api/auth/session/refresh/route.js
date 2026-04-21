import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import {
  getSessionCookieName,
  getSessionCookieOptions,
  getSessionMaxAgeMs,
} from '@/lib/auth-session';
import { getUserPermissionByEmail } from '@/lib/user-permissions';

export async function POST(request) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json(
        { error: 'Missing Firebase ID token.' },
        { status: 400 }
      );
    }

    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const allowedUser = await getUserPermissionByEmail(decodedToken.email);

    if (!allowedUser) {
      return NextResponse.json(
        {
          error:
            'This account is not registered. Please contact the Ms. Donah.',
        },
        { status: 403 }
      );
    }

    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: getSessionMaxAgeMs(),
    });

    const response = NextResponse.json({
      user: {
        email: allowedUser.email,
        name: allowedUser.name ?? decodedToken.name ?? null,
        picture: decodedToken.picture ?? null,
        role: allowedUser.role ?? null,
        status: allowedUser.status ?? null,
        uid: decodedToken.uid,
      },
    });

    response.cookies.set({
      name: getSessionCookieName(),
      value: sessionCookie,
      ...getSessionCookieOptions(),
    });

    return response;
  } catch (error) {
    console.error('Failed to refresh auth session.', error);

    return NextResponse.json(
      { error: 'Unable to refresh your session right now.' },
      { status: 401 }
    );
  }
}
