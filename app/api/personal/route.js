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
      sql: `
        SELECT
          p.*,
          EXISTS (
            SELECT 1
            FROM schedules s
            WHERE lower(trim(coalesce(s.title, ''))) = lower(trim(coalesce(p.events, '')))
              AND coalesce(nullif(s.start_date, ''), '') = coalesce(nullif(p.date, ''), '')
              AND coalesce(nullif(s.end_date, ''), coalesce(nullif(s.start_date, ''), ''), '') =
                coalesce(nullif(p.end_date, ''), coalesce(nullif(p.date, ''), ''), '')
              AND (
                lower(trim(coalesce(s.assigned_to, ''))) = lower(?)
                OR lower(trim(coalesce(s.assigned_to, ''))) = 'all employees'
                OR instr(
                  ',' || replace(lower(coalesce(s.assigned_to, '')), ', ', ',') || ',',
                  ',' || lower(?) || ','
                ) > 0
              )
            LIMIT 1
          ) AS is_schedule_event
        FROM personal p
        WHERE p.assigned_to = ?
      `,
      args: [userDisplayName, userDisplayName, userDisplayName],
    });
    const events = res.rows.map((row) => ({
      ...row,
      is_schedule_event: Boolean(row.is_schedule_event),
    }));

    return NextResponse.json(events);
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

export async function DELETE(request) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await request.json();

    const userObj = await getUserPermissionByEmail(session.email);
    const userDisplayName = userObj?.name || session?.name || session?.email || 'User';

    if (!id) {
      return NextResponse.json({ error: 'Missing event id' }, { status: 400 });
    }

    const scheduleBackedEvent = await tursoClient.execute({
      sql: `
        SELECT p.id
        FROM personal p
        WHERE p.id = ?
          AND p.assigned_to = ?
          AND EXISTS (
            SELECT 1
            FROM schedules s
            WHERE lower(trim(coalesce(s.title, ''))) = lower(trim(coalesce(p.events, '')))
              AND coalesce(nullif(s.start_date, ''), '') = coalesce(nullif(p.date, ''), '')
              AND coalesce(nullif(s.end_date, ''), coalesce(nullif(s.start_date, ''), ''), '') =
                coalesce(nullif(p.end_date, ''), coalesce(nullif(p.date, ''), ''), '')
              AND (
                lower(trim(coalesce(s.assigned_to, ''))) = lower(?)
                OR lower(trim(coalesce(s.assigned_to, ''))) = 'all employees'
                OR instr(
                  ',' || replace(lower(coalesce(s.assigned_to, '')), ', ', ',') || ',',
                  ',' || lower(?) || ','
                ) > 0
              )
            LIMIT 1
          )
        LIMIT 1
      `,
      args: [id, userDisplayName, userDisplayName, userDisplayName],
    });

    if (scheduleBackedEvent.rows.length) {
      return NextResponse.json(
        { error: 'Schedule-synced events cannot be deleted from Personal Events.' },
        { status: 403 }
      );
    }

    await tursoClient.execute({
      sql: 'DELETE FROM personal WHERE id = ? AND assigned_to = ?',
      args: [id, userDisplayName],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete personal event:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}