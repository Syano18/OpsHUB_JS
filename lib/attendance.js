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

export async function getAttendanceRecords(limit = 500) {
  const result = await tursoClient.execute({
    sql: `
      SELECT
        id,
        employee_id,
        full_name,
        date,
        time_in_am,
        time_out_am,
        time_in_pm,
        time_out_pm,
        remarks,
        created_at,
        updated_at
      FROM attendance
      ORDER BY date DESC, employee_id ASC
      LIMIT ?
    `,
    args: [limit],
  });

  return result.rows.map((row) => ({
    id: normalizeRowId(row.id),
    employeeId: normalizeText(row.employee_id),
    fullName: normalizeText(row.full_name) || 'Unknown employee',
    date: normalizeText(row.date),
    timeInAm: normalizeText(row.time_in_am),
    timeOutAm: normalizeText(row.time_out_am),
    timeInPm: normalizeText(row.time_in_pm),
    timeOutPm: normalizeText(row.time_out_pm),
    remarks: normalizeText(row.remarks) ?? '',
    createdAt: normalizeText(row.created_at),
    updatedAt: normalizeText(row.updated_at),
  }));
}

export async function getPunchErrors(limit = 200) {
  const result = await tursoClient.execute({
    sql: `
      SELECT
        pe.id,
        pe.employee_id,
        pe.scan_date,
        pe.error_message,
        pe.created_at,
        MAX(a.full_name) AS full_name
      FROM punch_errors pe
      LEFT JOIN attendance a
        ON a.employee_id = pe.employee_id
       AND a.date = pe.scan_date
      GROUP BY
        pe.id,
        pe.employee_id,
        pe.scan_date,
        pe.error_message,
        pe.created_at
      ORDER BY pe.scan_date DESC, pe.created_at DESC
      LIMIT ?
    `,
    args: [limit],
  });

  return result.rows.map((row) => ({
    id: normalizeRowId(row.id),
    employeeId: normalizeText(row.employee_id),
    scanDate: normalizeText(row.scan_date),
    errorMessage: normalizeText(row.error_message) ?? 'Unknown punch error.',
    createdAt: normalizeText(row.created_at),
    fullName: normalizeText(row.full_name),
  }));
}

export async function getAttendanceRecordById(id) {
  if (id === null || id === undefined) {
    return null;
  }

  const result = await tursoClient.execute({
    sql: `
      SELECT
        id,
        employee_id,
        full_name,
        date,
        time_in_am,
        time_out_am,
        time_in_pm,
        time_out_pm,
        remarks,
        created_at,
        updated_at
      FROM attendance
      WHERE id = ?
      LIMIT 1
    `,
    args: [id],
  });

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    id: normalizeRowId(row.id),
    employeeId: normalizeText(row.employee_id),
    fullName: normalizeText(row.full_name) || 'Unknown employee',
    date: normalizeText(row.date),
    timeInAm: normalizeText(row.time_in_am),
    timeOutAm: normalizeText(row.time_out_am),
    timeInPm: normalizeText(row.time_in_pm),
    timeOutPm: normalizeText(row.time_out_pm),
    remarks: normalizeText(row.remarks) ?? '',
    createdAt: normalizeText(row.created_at),
    updatedAt: normalizeText(row.updated_at),
  };
}

export async function updateAttendanceRemarksById(id, remarks) {
  if (id === null || id === undefined) {
    return;
  }

  await tursoClient.execute({
    sql: `
      UPDATE attendance
      SET
        remarks = ?,
        updated_at = strftime('%Y-%m-%d %H:%M:%S', unixepoch('now') + 28800, 'unixepoch')
      WHERE id = ?
    `,
    args: [normalizeText(remarks), id],
  });
}
