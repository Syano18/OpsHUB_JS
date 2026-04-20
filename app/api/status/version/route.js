import { NextResponse } from 'next/server';
import { tursoClient } from '@/lib/turso';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await tursoClient.execute(`
      SELECT
        (SELECT COUNT(id) FROM schedules) as sched_count,
        (SELECT MAX(created_at) FROM schedules) as sched_max_at,
        (SELECT COUNT(id) FROM attendance) as att_count,
        (SELECT MAX(updated_at) FROM attendance) as att_max_at,
        (SELECT COUNT(id) FROM Digital_Logbook) as log_count,
        (SELECT MAX(id) FROM Digital_Logbook) as log_max_id
    `);
    
    const row = result.rows[0];
    
    const versionStr = [
      row.sched_count,
      row.sched_max_at,
      row.att_count,
      row.att_max_at,
      row.log_count,
      row.log_max_id
    ].join('|');

    return NextResponse.json({ version: versionStr });
  } catch (error) {
    console.error('Failed to get database state version', error);
    return NextResponse.json({ version: 'error' }, { status: 500 });
  }
}