import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth-session';

export async function GET() {
  const session = await verifySession();

  if (!session) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      email: session.email ?? null,
      name: session.name ?? null,
      picture: session.picture ?? null,
      uid: session.uid,
    },
  });
}
