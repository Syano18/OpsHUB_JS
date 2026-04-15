import { tursoClient } from '@/lib/turso';

function buildDisplayName(row) {
  const parts = [
    row.First_Name,
    row.Middle_Name,
    row.Last_Name,
    row.Suffix,
  ]
    .map((value) => value?.trim())
    .filter(Boolean);

  return parts.join(' ').trim() || null;
}

export async function getUserPermissionByEmail(email) {
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  const result = await tursoClient.execute({
    sql: `
      SELECT
        user_id,
        Email,
        Role,
        First_Name,
        Middle_Name,
        Last_Name,
        Suffix,
        Position,
        Salary,
        Salary_Grade,
        Status
      FROM User_Permissions
      WHERE lower(Email) = ?
      LIMIT 1
    `,
    args: [normalizedEmail],
  });

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    email: row.Email ?? normalizedEmail,
    firstName: row.First_Name ?? null,
    lastName: row.Last_Name ?? null,
    middleName: row.Middle_Name ?? null,
    name: buildDisplayName(row),
    position: row.Position ?? null,
    role: row.Role ?? null,
    salary: row.Salary ?? null,
    salaryGrade: row.Salary_Grade ?? null,
    status: row.Status ?? null,
    suffix: row.Suffix ?? null,
    userId: row.user_id ?? null,
  };
}

export async function getRegisteredUserDisplayNames() {
  const result = await tursoClient.execute(`
    SELECT
      user_id,
      First_Name,
      Middle_Name,
      Last_Name,
      Suffix,
      Status
    FROM User_Permissions
    WHERE lower(trim(Status)) = 'active'
    ORDER BY Last_Name ASC, First_Name ASC, Middle_Name ASC, Suffix ASC
  `);

  const seenNames = new Set();

  return result.rows
    .map((row) => buildDisplayName(row))
    .filter(Boolean)
    .filter((name) => {
      const normalizedName = name.toLowerCase();

      if (seenNames.has(normalizedName)) {
        return false;
      }

      seenNames.add(normalizedName);
      return true;
    });
}
