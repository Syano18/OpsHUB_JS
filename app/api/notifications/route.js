import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth-session';
import {
  listNotificationsForUser,
  markNotificationRead,
} from '@/lib/notifications';

function normalizeText(value) {
  return String(value ?? '').trim();
}

export async function GET(request) {
  try {
    const session = await verifySession();

    if (!session?.email) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Number.parseInt(searchParams.get('limit') ?? '50', 10);
    const notifications = await listNotificationsForUser(session.email, limit);

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error('Failed to fetch notifications.', error);

    return NextResponse.json(
      { error: 'Unable to fetch notifications right now.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const session = await verifySession();

    if (!session?.email) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    const notificationId = Number.parseInt(normalizeText(payload?.id), 10);

    if (Number.isNaN(notificationId)) {
      return NextResponse.json(
        { error: 'A valid notification id is required.' },
        { status: 400 }
      );
    }

    await markNotificationRead(notificationId, session.email);

    return NextResponse.json({
      id: notificationId,
      message: 'Notification marked as read.',
    });
  } catch (error) {
    console.error('Failed to update notification.', error);

    return NextResponse.json(
      { error: 'Unable to update notification right now.' },
      { status: 500 }
    );
  }
}

