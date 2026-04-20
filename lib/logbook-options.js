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

export async function getLogbookAddressees() {
  const result = await tursoClient.execute(`
    SELECT addresse_name
    FROM Addresse
    ORDER BY addresse_name ASC
  `);

  return uniqueTrimmedValues(
    result.rows.map((row) => String(row.addresse_name ?? ''))
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

export async function createLogbookAddressee(addresseeName, addedBy) {
  const normalizedAddresseeName = String(addresseeName ?? '').trim();
  const normalizedAddedBy = String(addedBy ?? '').trim() || null;

  if (!normalizedAddresseeName) {
    throw new Error('Addressee name is required.');
  }

  const existingAddressees = await getLogbookAddressees();
  const duplicateAddressee = existingAddressees.find(
    (value) => value.toLowerCase() === normalizedAddresseeName.toLowerCase()
  );

  if (duplicateAddressee) {
    return {
      created: false,
      addressee: duplicateAddressee,
      addressees: existingAddressees,
    };
  }

  await tursoClient.execute({
    sql: `
      INSERT INTO Addresse (addresse_name, added_by)
      VALUES (?, ?)
    `,
    args: [normalizedAddresseeName, normalizedAddedBy],
  });

  const updatedAddressees = await getLogbookAddressees();

  return {
    created: true,
    addressee: normalizedAddresseeName,
    addressees: updatedAddressees,
  };
}

export async function createLogbookSection(sectionName, addedBy) {
  const normalizedSectionName = String(sectionName ?? '').trim();
  const normalizedAddedBy = String(addedBy ?? '').trim() || null;

  if (!normalizedSectionName) {
    throw new Error('Section name is required.');
  }

  const existingSections = await getLogbookSections();
  const duplicateSection = existingSections.find(
    (value) => value.toLowerCase() === normalizedSectionName.toLowerCase()
  );

  if (duplicateSection) {
    return {
      created: false,
      section: duplicateSection,
      sections: existingSections,
    };
  }

  await tursoClient.execute({
    sql: `
      INSERT INTO Section (section_name, added_by)
      VALUES (?, ?)
    `,
    args: [normalizedSectionName, normalizedAddedBy],
  });

  const updatedSections = await getLogbookSections();

  return {
    created: true,
    section: normalizedSectionName,
    sections: updatedSections,
  };
}

export async function createLogbookMode(modeName, addedBy) {
  const normalizedModeName = String(modeName ?? '').trim();
  const normalizedAddedBy = String(addedBy ?? '').trim() || null;

  if (!normalizedModeName) {
    throw new Error('Mode of transmittal is required.');
  }

  const existingModes = await getLogbookModes();
  const duplicateMode = existingModes.find(
    (value) => value.toLowerCase() === normalizedModeName.toLowerCase()
  );

  if (duplicateMode) {
    return {
      created: false,
      mode: duplicateMode,
      modes: existingModes,
    };
  }

  await tursoClient.execute({
    sql: `
      INSERT INTO Mode (mode_of_trans, added_by)
      VALUES (?, ?)
    `,
    args: [normalizedModeName, normalizedAddedBy],
  });

  const updatedModes = await getLogbookModes();

  return {
    created: true,
    mode: normalizedModeName,
    modes: updatedModes,
  };
}
