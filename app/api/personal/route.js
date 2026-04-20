import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth-session';
import { tursoClient } from '@/lib/turso';
import { getUserPermissionByEmail } from '@/lib/user-permissions';

export async function GET(request) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userObj = await getUserPermissionByEmail(session.email);
    const userDisplayName = userObj?.name || session?.name || session?.email || 'User';
    const res = await tursoClient.execute({
      sql: `SELECT * FROM personal WHERE assigned_to = ?`,
      args: [userDisplayName],
    });
    return NextResponse.json(res.rows);
  } catch (error) {
    console.error('Failed to fetch personal events:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { date, endDate, events } = body;

    const userObj = await getUserPermissionByEmail(session.email);
    const userDisplayName = userObj?.name || session?.name || session?.email || 'User';

    if (!date || !events) {
      return NextResponse.json({ error: 'Missing date or events payload' }, { status: 400 });
    }

    await tursoClient.execute({
      sql: 'INSERT INTO personal (date, end_date, events, assigned_to) VALUES (?, ?, ?, ?)',
      args: [date, endDate || null, events, userDisplayName],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save personal event:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, events, date, endDate } = await request.json();

    const userObj = await getUserPermissionByEmail(session.email);
    const userDisplayName = userObj?.name || session?.name || session?.email || 'User';

    if (!id || !events || !date) {
      return NextResponse.json({ error: 'Missing required payload' }, { status: 400 });
    }

    await tursoClient.execute({
      sql: 'UPDATE personal SET events = ?, date = ?, end_date = ? WHERE id = ? AND assigned_to = ?',
      args: [events, date, endDate || null, id, userDisplayName],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update personal event:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}