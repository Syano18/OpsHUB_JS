import { tursoClient } from '@/lib/turso';

function uniqueTrimmedValues(values) {
  const seenValues = new Set();

  return values.filter((value) => {
    const normalizedValue = value.trim().toLowerCase();

    if (!normalizedValue || seenValues.has(normalizedValue)) {
      return false;
    }

    seenValues.add(normalizedValue);
    return true;
  });
}

export async function getLogbookSections() {
  const result = await tursoClient.execute(`
    SELECT section_name
    FROM Section
    ORDER BY section_name ASC
  `);

  return uniqueTrimmedValues(
    result.rows.map((row) => String(row.section_name ?? ''))
  );
}

export async function getLogbookModes() {
  const result = await tursoClient.execute(`
    SELECT mode_of_trans
    FROM Mode
    ORDER BY mode_of_trans ASC
  `);

  return uniqueTrimmedValues(
    result.rows.map((row) => String(row.mode_of_trans ?? ''))
  );
}
