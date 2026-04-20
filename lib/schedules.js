import { tursoClient } from '@/lib/turso';

function normalizeRowId(value) {
  if (typeof value === 'bigint') {
    return Number(value);
  }

  return value ?? null;
}

function normalizeText(value) {
  return value ?? null;
}

export async function getUpcomingSchedules(limit = 24) {
  const result = await tursoClient.execute({
    sql: `
      SELECT
        id,
        title,
        start_date,
        end_date,
        assigned_to,
        remarks,
        encoded_by,
        created_at
      FROM schedules
      ORDER BY
        CASE
          WHEN date(coalesce(nullif(end_date, ''), nullif(start_date, ''), created_at)) >= date(unixepoch('now') + 28800, 'unixepoch')
            THEN 0
          ELSE 1
        END ASC,
        CASE
          WHEN date(coalesce(nullif(end_date, ''), nullif(start_date, ''), created_at)) >= date(unixepoch('now') + 28800, 'unixepoch')
            THEN coalesce(nullif(start_date, ''), nullif(end_date, ''), created_at)
        END ASC,
        CASE
          WHEN date(coalesce(nullif(end_date, ''), nullif(start_date, ''), created_at)) < date(unixepoch('now') + 28800, 'unixepoch')
            THEN coalesce(nullif(end_date, ''), nullif(start_date, ''), created_at)
        END DESC,
        created_at DESC
      LIMIT ?
    `,
    args: [limit],
  });

  return result.rows.map((row) => ({
    id: normalizeRowId(row.id),
    title: normalizeText(row.title) ?? 'Untitled schedule',
    startDate: normalizeText(row.start_date),
    endDate: normalizeText(row.end_date),
    assignedTo: normalizeText(row.assigned_to),
    remarks: normalizeText(row.remarks),
    encodedBy: normalizeText(row.encoded_by),
    createdAt: normalizeText(row.created_at),
  }));
}

export async function createSchedule({
  title,
  startDate,
  endDate,
  assignedTo,
  remarks,
  encodedBy,
}) {
  const result = await tursoClient.execute({
    sql: `
      INSERT INTO schedules (
        title,
        start_date,
        end_date,
        assigned_to,
        remarks,
        encoded_by
      )
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING
        id,
        title,
        start_date,
        end_date,
        assigned_to,
        remarks,
        encoded_by,
        created_at
    `,
    args: [
      normalizeText(title),
      normalizeText(startDate),
      normalizeText(endDate),
      normalizeText(assignedTo),
      normalizeText(remarks),
      normalizeText(encodedBy),
    ],
  });

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    id: normalizeRowId(row.id),
    title: normalizeText(row.title) ?? 'Untitled schedule',
    startDate: normalizeText(row.start_date),
    endDate: normalizeText(row.end_date),
    assignedTo: normalizeText(row.assigned_to),
    remarks: normalizeText(row.remarks),
    encodedBy: normalizeText(row.encoded_by),
    createdAt: normalizeText(row.created_at),
  };
}

export async function updateSchedule(
  id,
  { title, startDate, endDate, assignedTo, remarks }
) {
  const result = await tursoClient.execute({
    sql: `
      UPDATE schedules
      SET
        title = ?,
        start_date = ?,
        end_date = ?,
        assigned_to = ?,
        remarks = ?
      WHERE id = ?
      RETURNING
        id,
        title,
        start_date,
        end_date,
        assigned_to,
        remarks,
        encoded_by,
        created_at
    `,
    args: [
      normalizeText(title),
      normalizeText(startDate),
      normalizeText(endDate),
      normalizeText(assignedTo),
      normalizeText(remarks),
      id,
    ],
  });

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    id: normalizeRowId(row.id),
    title: normalizeText(row.title) ?? 'Untitled schedule',
    startDate: normalizeText(row.start_date),
    endDate: normalizeText(row.end_date),
    assignedTo: normalizeText(row.assigned_to),
    remarks: normalizeText(row.remarks),
    encodedBy: normalizeText(row.encoded_by),
    createdAt: normalizeText(row.created_at),
  };
}
