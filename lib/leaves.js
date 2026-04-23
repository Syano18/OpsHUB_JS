import { tursoClient } from '@/lib/turso';

let leaveRequestsColumnsPromise = null;
let leaveTypesByCodePromise = null;

const MANILA_TIMESTAMP_SQL =
  "strftime('%Y-%m-%d %H:%M:%S', unixepoch('now') + 28800, 'unixepoch')";

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

async function getLeaveRequestsColumnNames() {
  if (!leaveRequestsColumnsPromise) {
    leaveRequestsColumnsPromise = tursoClient
      .execute(`PRAGMA table_info(leave_requests)`)
      .then((result) =>
        result.rows
          .map((row) => String(row.name ?? '').trim().toLowerCase())
          .filter(Boolean)
      )
      .catch(() => []);
  }

  return leaveRequestsColumnsPromise;
}

async function getLeaveTypesByCode() {
  if (!leaveTypesByCodePromise) {
    leaveTypesByCodePromise = tursoClient
      .execute({
        sql: `
          SELECT
            code,
            name,
            reset_policy,
            annual_allocation,
            annual_allocation_male,
            annual_allocation_female
          FROM leave_types
          WHERE is_active = 1
        `,
      })
      .then((result) => {
        const leaveTypesByCode = new Map();

        for (const row of result.rows) {
          const leaveType = normalizeText(row.code);

          if (!leaveType) {
            continue;
          }

          leaveTypesByCode.set(leaveType, {
            code: leaveType,
            name: normalizeText(row.name) ?? leaveType,
            resetPolicy: normalizeText(row.reset_policy) ?? 'yearly',
            annualAllocation: normalizeNumeric(row.annual_allocation),
            annualAllocationMale: normalizeNumeric(row.annual_allocation_male),
            annualAllocationFemale: normalizeNumeric(row.annual_allocation_female),
          });
        }

        return leaveTypesByCode;
      })
      .catch(() => new Map());
  }

  return leaveTypesByCodePromise;
}

function createRequestGroupId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `leave-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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

function normalizeGroupedLeaveRow(row) {
  return {
    id: row.id ?? null,
    requestGroupId: normalizeText(row.request_group_id),
    employeeEmail: normalizeEmail(row.employee_email),
    employeeName: normalizeText(row.employee_name) ?? null,
    leaveType: normalizeText(row.leave_type) ?? null,
    dateFrom: normalizeText(row.date_from) ?? null,
    dateTo: normalizeText(row.date_to) ?? null,
    requestedDays: normalizeNumeric(row.requested_days || 1),
    approvedDays: normalizeNumeric(row.approved_days),
    reason: normalizeText(row.reason) ?? '',
    status: normalizeText(row.status) ?? null,
    filedAt: normalizeText(row.filed_at) ?? null,
  };
}

async function getAvailableLeaveBalanceForDates({
  employeeEmail,
  leaveType,
  leaveDates,
}) {
  const normalizedEmployeeEmail = normalizeEmail(employeeEmail);
  const normalizedLeaveType = String(leaveType ?? '').trim().toLowerCase();
  const normalizedLeaveDates = normalizeLeaveDates(leaveDates);

  if (!normalizedEmployeeEmail || !normalizedLeaveType || !normalizedLeaveDates.length) {
    return 0;
  }

  const leaveTypesByCode = await getLeaveTypesByCode();
  const leaveTypeSettings = leaveTypesByCode.get(normalizedLeaveType);

  if (!leaveTypeSettings) {
    return 0;
  }

  const [balancesResult, pendingRequestsResult, userPermissionResult] = await Promise.all([
    tursoClient.execute({
      sql: `
        SELECT
          balance_year,
          balance
        FROM leave_balances
        WHERE lower(employee_email) = ?
          AND leave_type = ?
      `,
      args: [normalizedEmployeeEmail, normalizedLeaveType],
    }),
    tursoClient.execute({
      sql: `
        SELECT
          date_from,
          requested_days
        FROM leave_requests
        WHERE lower(employee_email) = ?
          AND leave_type = ?
          AND status = 'pending'
      `,
      args: [normalizedEmployeeEmail, normalizedLeaveType],
    }),
    tursoClient.execute({
      sql: `
        SELECT Sex
        FROM User_Permissions
        WHERE lower(Email) = ?
        LIMIT 1
      `,
      args: [normalizedEmployeeEmail],
    }),
  ]);

  const employeeSex = normalizeText(userPermissionResult.rows[0]?.Sex);
  const balancesByYear = new Map();

  for (const row of balancesResult.rows) {
    const balanceYear = Number.parseInt(String(row.balance_year ?? ''), 10);

    if (Number.isNaN(balanceYear)) {
      continue;
    }

    balancesByYear.set(balanceYear, normalizeNumeric(row.balance));
  }

  const pendingDaysByYear = new Map();

  for (const row of pendingRequestsResult.rows) {
    const pendingYear = Number.parseInt(String(row.date_from ?? '').slice(0, 4), 10);

    if (Number.isNaN(pendingYear)) {
      continue;
    }

    pendingDaysByYear.set(
      pendingYear,
      normalizeNumeric(pendingDaysByYear.get(pendingYear)) +
        normalizeNumeric(row.requested_days || 1)
    );
  }

  if (leaveTypeSettings.resetPolicy === 'lifetime') {
    const totalBalance = [...balancesByYear.values()].reduce(
      (sum, currentBalance) => sum + normalizeNumeric(currentBalance),
      0
    );
    const pendingDays = [...pendingDaysByYear.values()].reduce(
      (sum, currentDays) => sum + normalizeNumeric(currentDays),
      0
    );

    return Math.max(0, totalBalance - pendingDays);
  }

  const requestedDaysByYear = normalizedLeaveDates.reduce((totalsByYear, leaveDate) => {
    const effectiveYear = Number.parseInt(String(leaveDate).slice(0, 4), 10);

    if (Number.isNaN(effectiveYear)) {
      return totalsByYear;
    }

    totalsByYear.set(
      effectiveYear,
      normalizeNumeric(totalsByYear.get(effectiveYear)) + 1
    );
    return totalsByYear;
  }, new Map());

  let lowestAvailableBalance = Number.POSITIVE_INFINITY;

  for (const balanceYear of requestedDaysByYear.keys()) {
    const baseBalance = balancesByYear.has(balanceYear)
      ? normalizeNumeric(balancesByYear.get(balanceYear))
      : resolveSexBasedAnnualAllocation(
          employeeSex,
          leaveTypeSettings.annualAllocation,
          leaveTypeSettings.annualAllocationMale,
          leaveTypeSettings.annualAllocationFemale
        );
    const pendingDays = normalizeNumeric(pendingDaysByYear.get(balanceYear));
    const availableBalance = Math.max(0, baseBalance - pendingDays);

    lowestAvailableBalance = Math.min(lowestAvailableBalance, availableBalance);
  }

  return Number.isFinite(lowestAvailableBalance) ? lowestAvailableBalance : 0;
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
          AND status = 'approved'
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

  const availableBalance = await getAvailableLeaveBalanceForDates({
    employeeEmail: normalizedEmployeeEmail,
    leaveType: normalizedLeaveType,
    leaveDates: normalizedLeaveDates,
  });

  if (normalizedLeaveDates.length > availableBalance) {
    throw new Error(
      `Requested leave exceeds the available balance of ${availableBalance}.`
    );
  }

  const leaveRequestColumns = await getLeaveRequestsColumnNames();
  const supportsRequestGroupId = leaveRequestColumns.includes('request_group_id');
  const requestGroupId = createRequestGroupId();

  const insertStatements = normalizedLeaveDates.map((leaveDate) => ({
    sql: supportsRequestGroupId
      ? `
      INSERT INTO leave_requests (
        request_group_id,
        employee_email,
        employee_name,
        leave_type,
        date_from,
        date_to,
        requested_days,
        reason,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'pending')
      RETURNING
        id,
        request_group_id,
        employee_email,
        employee_name,
        leave_type,
        date_from,
        date_to,
        requested_days,
        reason,
        status,
        filed_at
    `
      : `
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
    args: supportsRequestGroupId
      ? [
          requestGroupId,
          normalizedEmployeeEmail,
          normalizedEmployeeName,
          normalizedLeaveType,
          leaveDate,
          leaveDate,
          normalizedReason,
        ]
      : [
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
    requestGroupId: normalizeText(firstRow.request_group_id) ?? requestGroupId,
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

export async function getLeaveRequestGroup(groupIdentifier) {
  const normalizedGroupIdentifier = String(groupIdentifier ?? '').trim();
  const leaveRequestColumns = await getLeaveRequestsColumnNames();
  const supportsRequestGroupId = leaveRequestColumns.includes('request_group_id');
  let rows = [];

  if (supportsRequestGroupId && normalizedGroupIdentifier) {
    const result = await tursoClient.execute({
      sql: `
        SELECT
          id,
          request_group_id,
          employee_email,
          employee_name,
          leave_type,
          date_from,
          date_to,
          requested_days,
          approved_days,
          reason,
          status,
          filed_at
        FROM leave_requests
        WHERE request_group_id = ?
        ORDER BY date_from ASC, id ASC
      `,
      args: [normalizedGroupIdentifier],
    });

    rows = result.rows;
  }

  if (!rows.length) {
    const normalizedId = Number.parseInt(normalizedGroupIdentifier, 10);

    if (Number.isNaN(normalizedId)) {
      return null;
    }

    const result = await tursoClient.execute({
      sql: `
        SELECT
          id,
          request_group_id,
          employee_email,
          employee_name,
          leave_type,
          date_from,
          date_to,
          requested_days,
          approved_days,
          reason,
          status,
          filed_at
        FROM leave_requests
        WHERE id = ?
        ORDER BY date_from ASC, id ASC
      `,
      args: [normalizedId],
    });

    rows = result.rows;
  }

  if (!rows.length) {
    return null;
  }

  const normalizedRows = rows.map(normalizeGroupedLeaveRow);
  const firstRow = normalizedRows[0];

  return {
    requestGroupId:
      firstRow.requestGroupId ??
      `leave-${String(firstRow.id ?? normalizedGroupIdentifier).trim()}`,
    employeeEmail: firstRow.employeeEmail,
    employeeName: firstRow.employeeName,
    leaveType: firstRow.leaveType,
    status: firstRow.status,
    reason: firstRow.reason,
    filedAt: firstRow.filedAt,
    requestedDays: normalizedRows.reduce(
      (totalDays, row) => totalDays + normalizeNumeric(row.requestedDays || 1),
      0
    ),
    leaveDates: normalizedRows
      .map((row) => row.dateFrom || row.dateTo)
      .filter(Boolean)
      .sort(sortDateValues),
    rows: normalizedRows,
  };
}

export async function updateLeaveRequestGroupStatus({
  groupIdentifier,
  status,
  reviewerEmail,
  hrRemarks,
}) {
  const normalizedStatus = String(status ?? '').trim().toLowerCase();
  const normalizedReviewerEmail = normalizeEmail(reviewerEmail);
  const normalizedRemarks = String(hrRemarks ?? '').trim();

  if (!['approved', 'rejected'].includes(normalizedStatus)) {
    throw new Error('A valid leave status is required.');
  }

  if (!normalizedReviewerEmail) {
    throw new Error('A reviewer email is required.');
  }

  const leaveRequestGroup = await getLeaveRequestGroup(groupIdentifier);

  if (!leaveRequestGroup) {
    throw new Error('Leave request group not found.');
  }

  if (leaveRequestGroup.rows.some((row) => row.status !== 'pending')) {
    throw new Error('Only pending leave requests can be updated.');
  }

  const leaveRequestColumns = await getLeaveRequestsColumnNames();
  const supportsRequestGroupId = leaveRequestColumns.includes('request_group_id');
  const leaveTypesByCode = await getLeaveTypesByCode();
  const leaveTypeSettings = leaveTypesByCode.get(leaveRequestGroup.leaveType) ?? {
    resetPolicy: 'yearly',
    annualAllocation: 0,
    annualAllocationMale: 0,
    annualAllocationFemale: 0,
  };
  const userPermissionResult = await tursoClient.execute({
    sql: `
      SELECT Sex
      FROM User_Permissions
      WHERE lower(Email) = ?
      LIMIT 1
    `,
    args: [leaveRequestGroup.employeeEmail],
  });
  const employeeSex = normalizeText(userPermissionResult.rows[0]?.Sex);
  const yearlyDayTotals = leaveRequestGroup.rows.reduce((totalsByYear, row) => {
    const effectiveYear = Number.parseInt(String(row.dateFrom ?? '').slice(0, 4), 10);

    if (Number.isNaN(effectiveYear)) {
      return totalsByYear;
    }

    totalsByYear.set(
      effectiveYear,
      normalizeNumeric(totalsByYear.get(effectiveYear)) + normalizeNumeric(row.requestedDays || 1)
    );
    return totalsByYear;
  }, new Map());

  const statements = [];

  if (supportsRequestGroupId && leaveRequestGroup.requestGroupId) {
    statements.push({
      sql: `
        UPDATE leave_requests
        SET
          status = ?,
          approved_days = CASE
            WHEN ? = 'approved' THEN requested_days
            ELSE approved_days
          END,
          hr_remarks = ?,
          reviewed_at = ${MANILA_TIMESTAMP_SQL},
          reviewed_by_email = ?
        WHERE request_group_id = ?
      `,
      args: [
        normalizedStatus,
        normalizedStatus,
        normalizedRemarks,
        normalizedReviewerEmail,
        leaveRequestGroup.requestGroupId,
      ],
    });
  } else {
    for (const row of leaveRequestGroup.rows) {
      statements.push({
        sql: `
          UPDATE leave_requests
          SET
            status = ?,
            approved_days = CASE
              WHEN ? = 'approved' THEN requested_days
              ELSE approved_days
            END,
            hr_remarks = ?,
            reviewed_at = ${MANILA_TIMESTAMP_SQL},
            reviewed_by_email = ?
          WHERE id = ?
        `,
        args: [
          normalizedStatus,
          normalizedStatus,
          normalizedRemarks,
          normalizedReviewerEmail,
          row.id,
        ],
      });
    }
  }

  if (normalizedStatus === 'approved') {
    for (const row of leaveRequestGroup.rows) {
      const effectiveYear = Number.parseInt(String(row.dateFrom ?? '').slice(0, 4), 10);

      if (Number.isNaN(effectiveYear)) {
        continue;
      }

      statements.push({
        sql: `
          INSERT INTO leave_balance_ledger (
            employee_email,
            employee_name,
            leave_type,
            effective_year,
            transaction_type,
            days,
            request_id,
            notes,
            created_at,
            created_by_email
          )
          VALUES (?, ?, ?, ?, 'use', ?, ?, ?, ${MANILA_TIMESTAMP_SQL}, ?)
        `,
        args: [
          leaveRequestGroup.employeeEmail,
          leaveRequestGroup.employeeName,
          leaveRequestGroup.leaveType,
          effectiveYear,
          normalizeNumeric(row.requestedDays || 1),
          row.id,
          normalizedRemarks || 'Approved leave request',
          normalizedReviewerEmail,
        ],
      });
    }

    for (const [effectiveYear, usedDays] of yearlyDayTotals.entries()) {
      const initialBalance =
        leaveTypeSettings.resetPolicy === 'yearly'
          ? resolveSexBasedAnnualAllocation(
              employeeSex,
              leaveTypeSettings.annualAllocation,
              leaveTypeSettings.annualAllocationMale,
              leaveTypeSettings.annualAllocationFemale
            )
          : 0;

      statements.push({
        sql: `
          INSERT INTO leave_balances (
            employee_email,
            employee_name,
            leave_type,
            balance_year,
            earned,
            used,
            restored,
            adjusted,
            balance,
            updated_at
          )
          VALUES (?, ?, ?, ?, 0, ?, 0, 0, ?, ${MANILA_TIMESTAMP_SQL})
          ON CONFLICT(employee_email, leave_type, balance_year)
          DO UPDATE SET
            employee_name = excluded.employee_name,
            used = leave_balances.used + excluded.used,
            balance = leave_balances.balance - excluded.used,
            updated_at = ${MANILA_TIMESTAMP_SQL}
        `,
        args: [
          leaveRequestGroup.employeeEmail,
          leaveRequestGroup.employeeName,
          leaveRequestGroup.leaveType,
          effectiveYear,
          usedDays,
          initialBalance - usedDays,
        ],
      });
    }
  }

  await tursoClient.batch(statements, 'write');

  return await getLeaveRequestGroup(leaveRequestGroup.requestGroupId ?? leaveRequestGroup.rows[0]?.id);
}

export async function listPendingLeaveRequestGroups() {
  const leaveRequestColumns = await getLeaveRequestsColumnNames();
  const supportsRequestGroupId = leaveRequestColumns.includes('request_group_id');
  const result = await tursoClient.execute({
    sql: supportsRequestGroupId
      ? `
        SELECT
          COALESCE(request_group_id, CAST(id AS TEXT)) AS group_key,
          request_group_id,
          employee_email,
          employee_name,
          leave_type,
          reason,
          MIN(date_from) AS first_date,
          MAX(date_to) AS last_date,
          SUM(requested_days) AS requested_days,
          MIN(filed_at) AS filed_at
        FROM leave_requests
        WHERE status = 'pending'
        GROUP BY
          COALESCE(request_group_id, CAST(id AS TEXT)),
          request_group_id,
          employee_email,
          employee_name,
          leave_type,
          reason
        ORDER BY filed_at ASC, first_date ASC
      `
      : `
        SELECT
          CAST(id AS TEXT) AS group_key,
          NULL AS request_group_id,
          employee_email,
          employee_name,
          leave_type,
          reason,
          date_from AS first_date,
          date_to AS last_date,
          requested_days,
          filed_at
        FROM leave_requests
        WHERE status = 'pending'
        ORDER BY filed_at ASC, date_from ASC
      `,
  });

  return result.rows.map((row) => ({
    requestGroupId: normalizeText(row.request_group_id) ?? normalizeText(row.group_key),
    employeeEmail: normalizeEmail(row.employee_email),
    employeeName: normalizeText(row.employee_name),
    leaveType: normalizeText(row.leave_type),
    reason: normalizeText(row.reason) ?? '',
    firstDate: normalizeText(row.first_date),
    lastDate: normalizeText(row.last_date),
    requestedDays: normalizeNumeric(row.requested_days),
    filedAt: normalizeText(row.filed_at),
  }));
}
