import { tursoClient } from '@/lib/turso';
import { ensureLeaveBalanceRecord } from '@/lib/leaves';

export async function runSystemMaintenance() {
  try {
    // 1. Get Current Date in Manila Time
    const now = new Date(Date.now() + 28800000); // UTC+8
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentMonthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    console.log(`[Maintenance] Running checks for ${currentMonthStr}...`);

    let accruedCount = 0;
    let resetCount = 0;

    // Fetch all active leave types to determine logic dynamically
    const leaveTypesRes = await tursoClient.execute({
      sql: `SELECT code, accrual_mode, reset_policy, annual_allocation FROM leave_types WHERE is_active = 1`,
    });

    const leaveTypes = leaveTypesRes.rows;

    // ==========================================
    // MONTHLY ACCRUAL logic
    // ==========================================
    const accrualNote = `Monthly Accrual [${currentMonthStr}]`;
    const accrualLeaveTypes = leaveTypes
      .filter((lt) => lt.accrual_mode === 'monthly')
      .map((lt) => lt.code);

    for (const leaveType of accrualLeaveTypes) {
      // Find all valid users who haven't received accrual this month
      const eligibleUsersRes = await tursoClient.execute({
        sql: `
          SELECT u.Email, u.First_Name, u.Middle_Name, u.Last_Name, u.Suffix
          FROM User_Permissions u
          WHERE (u.Status = 'Active' OR u.Status IS NULL)
          AND (u.emp_stat IS NULL OR u.emp_stat != 'COSW')
          AND lower(u.Email) NOT IN (
            SELECT lower(employee_email) 
            FROM leave_balance_ledger 
            WHERE leave_type = ? AND notes = ?
          )
        `,
        args: [leaveType, accrualNote],
      });

      for (const user of eligibleUsersRes.rows) {
        const email = String(user.Email || '').toLowerCase();
        const fullName = [user.First_Name, user.Middle_Name, user.Last_Name, user.Suffix]
          .map((v) => (v || '').trim())
          .filter(Boolean)
          .join(' ');
        if (!email) continue;

        // Ensure balancing record for current year exists
        await ensureLeaveBalanceRecord(email, fullName, leaveType, currentYear);

        // Add 1.25 to earned and balance
        await tursoClient.execute({
          sql: `
            UPDATE leave_balances
            SET earned = earned + 1.25,
                balance = balance + 1.25,
                updated_at = strftime('%Y-%m-%d %H:%M:%S', unixepoch('now') + 28800, 'unixepoch')
            WHERE lower(employee_email) = ? AND leave_type = ? AND balance_year = ?
          `,
          args: [email, leaveType, currentYear],
        });

        // Insert to Ledger tracking
        await tursoClient.execute({
          sql: `
            INSERT INTO leave_balance_ledger
            (employee_email, employee_name, leave_type, effective_year, transaction_type, days, notes, created_by_email)
            VALUES (?, ?, ?, ?, 'earn', 1.25, ?, 'system@maintenance')
          `,
          args: [email, fullName, leaveType, currentYear, accrualNote],
        });

        accruedCount++;
      }
    }

    // ==========================================
    // YEARLY RESET logic
    // ==========================================
    const resetNote = `Yearly Reset [${currentYear}]`;
    const resetLeaveTypes = leaveTypes
      .filter((lt) => lt.reset_policy === 'yearly')
      .map((lt) => lt.code);

    for (const leaveType of resetLeaveTypes) {
      // Check if we need to apply reset for this user this year
      const eligibleUsersRes = await tursoClient.execute({
        sql: `
          SELECT u.Email, u.First_Name, u.Middle_Name, u.Last_Name, u.Suffix
          FROM User_Permissions u
          WHERE (u.Status = 'Active' OR u.Status IS NULL)
          ${leaveType !== 'wellness' ? "AND (u.emp_stat IS NULL OR u.emp_stat != 'COSW')" : ""}
          AND lower(u.Email) NOT IN (
            SELECT lower(employee_email) 
            FROM leave_balance_ledger 
            WHERE leave_type = ? AND notes = ?
          )
        `,
        args: [leaveType, resetNote],
      });

      if (eligibleUsersRes.rows.length === 0) continue;

      const allocation = leaveTypes.find((lt) => lt.code === leaveType);
      if (!allocation) continue;

      for (const user of eligibleUsersRes.rows) {
        const email = String(user.Email || '').toLowerCase();
        const fullName = [user.First_Name, user.Middle_Name, user.Last_Name, user.Suffix]
          .map((v) => (v || '').trim())
          .filter(Boolean)
          .join(' ');
        if (!email) continue;

        const finalAlloc = Number(allocation.annual_allocation || 0);

        // Check if balance record exists, if not create
        await ensureLeaveBalanceRecord(email, fullName, leaveType, currentYear, finalAlloc);

        // If it existing previously (not just created), we explicitly rewrite the values so it effectively "Resets"
        await tursoClient.execute({
          sql: `
            UPDATE leave_balances
            SET earned = ?, 
                used = 0,
                restored = 0, 
                adjusted = 0, 
                balance = ?,
                updated_at = strftime('%Y-%m-%d %H:%M:%S', unixepoch('now') + 28800, 'unixepoch')
            WHERE lower(employee_email) = ? AND leave_type = ? AND balance_year = ?
          `,
          args: [finalAlloc, finalAlloc, email, leaveType, currentYear],
        });

        // Track in Ledger
        await tursoClient.execute({
          sql: `
            INSERT INTO leave_balance_ledger
            (employee_email, employee_name, leave_type, effective_year, transaction_type, days, notes, created_by_email)
            VALUES (?, ?, ?, ?, 'annual_grant', ?, ?, 'system@maintenance')
          `,
          args: [email, fullName, leaveType, currentYear, finalAlloc, resetNote],
        });

        resetCount++;
      }
    }

    if (accruedCount > 0 || resetCount > 0) {
      console.log(`[Maintenance] Complete. Accruals: ${accruedCount}, Resets: ${resetCount}`);
    }
  } catch (error) {
    console.error('[Maintenance] Task Exception:', error);
  }
}
