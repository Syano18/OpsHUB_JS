import { tursoClient } from '@/lib/turso';

function normalizeRowId(value) {
  if (typeof value === 'bigint') {
    return Number(value);
  }

  return value ?? null;
}

export async function getDigitalLogbookEntries() {
  const result = await tursoClient.execute(`
    SELECT
      id,
      Timestamp,
      REFERENCE_NUMBER,
      PARTICULARS,
      ADDRESSE,
      TRANSMITTER,
      SECTION,
      MODE_OF_TRANSMITTAL,
      REMARKS,
      ENCODED_BY
    FROM Digital_Logbook
    ORDER BY id DESC
  `);

  return result.rows.map((row) => ({
    id: normalizeRowId(row.id),
    timestamp: row.Timestamp ?? null,
    referenceNumber: row.REFERENCE_NUMBER ?? null,
    particulars: row.PARTICULARS ?? null,
    addressee: row.ADDRESSE ?? null,
    transmitter: row.TRANSMITTER ?? null,
    section: row.SECTION ?? null,
    modeOfTransmittal: row.MODE_OF_TRANSMITTAL ?? null,
    remarks: row.REMARKS ?? null,
    encodedBy: row.ENCODED_BY ?? null,
  }));
}

export async function createDigitalLogbookEntry({
  particulars,
  addressee,
  transmitter,
  section,
  modeOfTransmittal,
  remarks,
  encodedBy,
}) {
  const result = await tursoClient.execute({
    sql: `
      INSERT INTO Digital_Logbook (
        PARTICULARS,
        ADDRESSE,
        TRANSMITTER,
        SECTION,
        MODE_OF_TRANSMITTAL,
        REMARKS,
        ENCODED_BY
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      particulars,
      addressee,
      transmitter,
      section,
      modeOfTransmittal,
      remarks,
      encodedBy,
    ],
  });

  return normalizeRowId(result.lastInsertRowid);
}

export async function updateDigitalLogbookEntryById(
  id,
  {
    particulars,
    addressee,
    transmitter,
    section,
    modeOfTransmittal,
    remarks,
    encodedBy,
  }
) {
  if (id === null || id === undefined) {
    return;
  }

  await tursoClient.execute({
    sql: `
      UPDATE Digital_Logbook
      SET
        PARTICULARS = ?,
        ADDRESSE = ?,
        TRANSMITTER = ?,
        SECTION = ?,
        MODE_OF_TRANSMITTAL = ?,
        REMARKS = ?,
        ENCODED_BY = ?
      WHERE id = ?
    `,
    args: [
      particulars,
      addressee,
      transmitter,
      section,
      modeOfTransmittal,
      remarks,
      encodedBy,
      id,
    ],
  });
}

export async function getDigitalLogbookEntryById(id) {
  if (id === null || id === undefined) {
    return null;
  }

  const result = await tursoClient.execute({
    sql: `
      SELECT
        id,
        Timestamp,
        REFERENCE_NUMBER,
        PARTICULARS,
        ADDRESSE,
        TRANSMITTER,
        SECTION,
        MODE_OF_TRANSMITTAL,
        REMARKS,
        ENCODED_BY
      FROM Digital_Logbook
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
    timestamp: row.Timestamp ?? null,
    referenceNumber: row.REFERENCE_NUMBER ?? null,
    particulars: row.PARTICULARS ?? null,
    addressee: row.ADDRESSE ?? null,
    transmitter: row.TRANSMITTER ?? null,
    section: row.SECTION ?? null,
    modeOfTransmittal: row.MODE_OF_TRANSMITTAL ?? null,
    remarks: row.REMARKS ?? null,
    encodedBy: row.ENCODED_BY ?? null,
  };
}
