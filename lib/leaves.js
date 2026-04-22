import { tursoClient } from '@/lib/turso';

function normalizeText(value) {
  return value ?? null;
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeNumeric(value) {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function normalizeDateValue(value) {
  const normalizedValue = String(value ?? '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return '';
  }

  const parsedDate = new Date(`${normalizedValue}T12:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return normalizedValue;
}

function sortDateValues(left, right) {
  return left.localeCompare(right);
}

function isWeekendDate(dateValue) {
  const parsedDate = new Date(`${dateValue}T12:00:00`);
  const dayOfWeek = parsedDate.getDay();

  return dayOfWeek === 0 || dayOfWeek === 6;
}

function normalizeLeaveDates(leaveDates) {
  if (!Array.isArray(leaveDates)) {
    return [];
  }

  return [...new Set(leaveDates.map(normalizeDateValue).filter(Boolean))].sort(sortDateValues);
}

function getLeaveDisplayName(leaveType, leaveName) {
  if (leaveType === 'wellness') {
    return 'Wellness Leave';
  }

  return normalizeText(leaveName) ?? leaveType;
}

function resolveSexBasedAnnualAllocation(
  sex,
  annualAllocation,
  maleAnnualAllocation,
  femaleAnnualAllocation
) {
  const normalizedSex = String(sex ?? '').trim().toLowerCase();
  const normalizedAnnualAllocation = normalizeNumeric(annualAllocation);
  const normalizedMaleAnnualAllocation = normalizeNumeric(maleAnnualAllocation);
  const normalizedFemaleAnnualAllocation = normalizeNumeric(femaleAnnualAllocation);

  if (normalizedSex === 'female') {
    return normalizedFemaleAnnualAllocation || normalizedAnnualAllocation;
  }

  if (normalizedSex === 'male') {
    return normalizedMaleAnnualAllocation || normalizedAnnualAllocation;
  }

  return normalizedAnnualAllocation;
}

function buildFiledHistoryLabel(dateFrom, dateTo) {
  const normalizedDateFrom = normalizeText(dateFrom);
  const normalizedDateTo = normalizeText(dateTo);

  if (!normalizedDateFrom && !normalizedDateTo) {
    return null;
  }

  if (normalizedDateFrom && normalizedDateTo && normalizedDateFrom !== normalizedDateTo) {
    return `${normalizedDateFrom} to ${normalizedDateTo}`;
  }

  return normalizedDateFrom || normalizedDateTo;
}

function pickHistoryDateValue(record) {
  return record.dateFrom || record.dateTo || record.filedAt || '';
}

export async function getLeaveMonitoringData(employeeEmail, balanceYear) {
  const normalizedEmail = normalizeEmail(employeeEmail);
  const normalizedBalanceYear = Number.parseInt(balanceYear, 10);

  if (!normalizedEmail || Number.isNaN(normalizedBalanceYear)) {
    return [];
  }

  const [leaveTypesResult, balancesResult, requestsResult] = await Promise.all([
    tursoClient.execute({
      sql: `
        SELECT
          code,
          name,
          accrual_mode,
          reset_policy,
          annual_allocation,
          annual_allocation_male,
          annual_allocation_female,
          display_order
        FROM leave_types
        WHERE is_active = 1
        ORDER BY display_order ASC, name ASC
      `,
    }),
    tursoClient.execute({
      sql: `
        SELECT
          leave_type,
          balance_year,
          earned,
          used,
          restored,
          adjusted,
          balance
        FROM leave_balances
        WHERE lower(employee_email) = ?
      `,
      args: [normalizedEmail],
    }),
    tursoClient.execute({
      sql: `
        SELECT
          leave_type,
          date_from,
          date_to,
          filed_at,
          status
        FROM leave_requests
        WHERE lower(employee_email) = ?
          AND status IN ('pending', 'approved')
        ORDER BY filed_at DESC, date_from DESC, date_to DESC
      `,
      args: [normalizedEmail],
    }),
  ]);

  const userPermissionResult = await tursoClient.execute({
    sql: `
      SELECT Sex
      FROM User_Permissions
      WHERE lower(Email) = ?
      LIMIT 1
    `,
    args: [normalizedEmail],
  });
  const userSex = normalizeText(userPermissionResult.rows[0]?.Sex);

  const balancesByType = new Map();

  for (const row of balancesResult.rows) {
    const leaveType = normalizeText(row.leave_type);
    const currentYear = Number.parseInt(row.balance_year, 10);

    if (!leaveType || Number.isNaN(currentYear)) {
      continue;
    }

    const currentBalance = balancesByType.get(leaveType) ?? {
      earned: 0,
      used: 0,
      restored: 0,
      adjusted: 0,
      balance: 0,
      yearlyRows: [],
    };

    currentBalance.yearlyRows.push({
      year: currentYear,
      earned: normalizeNumeric(row.earned),
      used: normalizeNumeric(row.used),
      restored: normalizeNumeric(row.restored),
      adjusted: normalizeNumeric(row.adjusted),
      balance: normalizeNumeric(row.balance),
    });

    balancesByType.set(leaveType, currentBalance);
  }

  const historyByType = new Map();

  for (const row of requestsResult.rows) {
    const leaveType = normalizeText(row.leave_type);
    const historyLabel = buildFiledHistoryLabel(row.date_from, row.date_to);

    if (!leaveType || !historyLabel) {
      continue;
    }

    const currentHistory = historyByType.get(leaveType) ?? [];

    currentHistory.push({
      label: historyLabel,
      dateFrom: normalizeText(row.date_from),
      dateTo: normalizeText(row.date_to),
      filedAt: normalizeText(row.filed_at),
      status: normalizeText(row.status),
    });

    historyByType.set(leaveType, currentHistory);
  }

  return leaveTypesResult.rows.map((row) => {
    const resetPolicy = normalizeText(row.reset_policy) ?? 'yearly';
    const annualAllocation = normalizeNumeric(row.annual_allocation);
    const annualAllocationMale = normalizeNumeric(row.annual_allocation_male);
    const annualAllocationFemale = normalizeNumeric(row.annual_allocation_female);
    const leaveType = normalizeText(row.code);
    const storedBalances = balancesByType.get(leaveType)?.yearlyRows ?? [];
    const relevantBalances =
      resetPolicy === 'lifetime'
        ? storedBalances
        : storedBalances.filter((balance) => balance.year === normalizedBalanceYear);

    const totals = relevantBalances.reduce(
      (accumulator, balance) => ({
        earned: accumulator.earned + balance.earned,
        used: accumulator.used + balance.used,
        restored: accumulator.restored + balance.restored,
        adjusted: accumulator.adjusted + balance.adjusted,
        balance: accumulator.balance + balance.balance,
      }),
      {
        earned: 0,
        used: 0,
        restored: 0,
        adjusted: 0,
        balance: 0,
      }
    );

    if (resetPolicy === 'yearly' && !relevantBalances.length) {
      totals.balance = resolveSexBasedAnnualAllocation(
        userSex,
        annualAllocation,
        annualAllocationMale,
        annualAllocationFemale
      );
    }

    const history = (historyByType.get(leaveType) ?? [])
      .sort((left, right) =>
        String(pickHistoryDateValue(right)).localeCompare(String(pickHistoryDateValue(left)))
      )
      .map((record) => record.label);

    return {
      key: leaveType,
      name: getLeaveDisplayName(leaveType, row.name),
      accrualMode: normalizeText(row.accrual_mode),
      resetPolicy,
      earned: totals.earned,
      used: totals.used,
      balance: totals.balance,
      filedHistory: history,
    };
  });
}

export async function getActiveLeaveTypeCodes() {
  const result = await tursoClient.execute({
    sql: `
      SELECT code
      FROM leave_types
      WHERE is_active = 1
    `,
  });

  return result.rows
    .map((row) => normalizeText(row.code))
    .filter(Boolean);
}

export async function createLeaveRequest({
  employeeEmail,
  employeeName,
  leaveType,
  leaveDates,
  reason,
}) {
  const normalizedEmployeeEmail = normalizeEmail(employeeEmail);
  const normalizedEmployeeName = String(employeeName ?? '').trim();
  const normalizedLeaveType = String(leaveType ?? '').trim().toLowerCase();
  const normalizedLeaveDates = normalizeLeaveDates(leaveDates);
  const normalizedReason = String(reason ?? '').trim();

  if (
    !normalizedEmployeeEmail ||
    !normalizedEmployeeName ||
    !normalizedLeaveType ||
    !normalizedLeaveDates.length
  ) {
    throw new Error('Leave type and leave dates are required.');
  }

  const weekendDates = normalizedLeaveDates.filter(isWeekendDate);

  if (weekendDates.length) {
    throw new Error('Weekend dates cannot be filed as leave dates.');
  }

  const allowedLeaveTypes = await getActiveLeaveTypeCodes();

  if (!allowedLeaveTypes.includes(normalizedLeaveType)) {
    throw new Error('Please choose a valid leave type.');
  }

  const insertStatements = normalizedLeaveDates.map((leaveDate) => ({
    sql: `
      INSERT INTO leave_requests (
        employee_email,
        employee_name,
        leave_type,
        date_from,
        date_to,
        requested_days,
        reason,
        status
      )
      VALUES (?, ?, ?, ?, ?, 1, ?, 'pending')
      RETURNING
        id,
        employee_email,
        employee_name,
        leave_type,
        date_from,
        date_to,
        requested_days,
        reason,
        status,
        filed_at
    `,
    args: [
      normalizedEmployeeEmail,
      normalizedEmployeeName,
      normalizedLeaveType,
      leaveDate,
      leaveDate,
      normalizedReason,
    ],
  }));

  const results = await tursoClient.batch(insertStatements, 'write');
  const createdRows = results
    .flatMap((result) => result.rows ?? [])
    .filter(Boolean);

  if (!createdRows.length) {
    return null;
  }

  const firstRow = createdRows[0];

  return {
    id: firstRow.id ?? null,
    employeeEmail: normalizeText(firstRow.employee_email),
    employeeName: normalizeText(firstRow.employee_name),
    leaveType: normalizeText(firstRow.leave_type),
    requestedDays: createdRows.length,
    leaveDates: createdRows
      .map((row) => normalizeText(row.date_from))
      .filter(Boolean)
      .sort(sortDateValues),
    reason: normalizeText(firstRow.reason),
    status: normalizeText(firstRow.status),
    filedAt: normalizeText(firstRow.filed_at),
  };
}
