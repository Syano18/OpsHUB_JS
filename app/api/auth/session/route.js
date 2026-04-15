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
    const isRecentSignIn =
      typeof decodedToken.auth_time === 'number' &&
      Date.now() / 1000 - decodedToken.auth_time < 5 * 60;

    if (!isRecentSignIn) {
      return NextResponse.json(
        { error: 'Please sign in again before creating a session.' },
        { status: 401 }
      );
    }

    const allowedUser = await getUserPermissionByEmail(decodedToken.email);

    if (!allowedUser) {
      try {
        const signInProvider = decodedToken.firebase?.sign_in_provider ?? null;

        if (signInProvider === 'google.com') {
          await adminAuth.deleteUser(decodedToken.uid);
        }
      } catch (deleteError) {
        console.error('Failed to remove unauthorized Firebase user.', deleteError);
      }

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
    console.error('Failed to create auth session.', error);

    return NextResponse.json(
      { error: 'Unable to complete Google sign-in right now.' },
      { status: 401 }
    );
  }
}
