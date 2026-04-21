import { tursoClient } from '@/lib/turso';
import { getRegisteredUserDisplayNames } from '@/lib/user-permissions';

const ALL_EMPLOYEES_OPTION = 'All employees';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeAssignedToList(assignedTo) {
  if (Array.isArray(assignedTo)) {
    return assignedTo.map((value) => normalizeText(value)).filter(Boolean);
  }

  return normalizeText(assignedTo)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function resolveAssignedUserNames(assignedTo) {
  const assignedNames = normalizeAssignedToList(assignedTo);

  if (!assignedNames.length) {
    return [];
  }

  if (assignedNames.includes(ALL_EMPLOYEES_OPTION)) {
    return getRegisteredUserDisplayNames();
  }

  return assignedNames;
}

function buildEntrySignature(entry) {
  return [
    normalizeText(entry.assignedTo).toLowerCase(),
    normalizeText(entry.date),
    normalizeText(entry.endDate),
    normalizeText(entry.events),
  ].join('|');
}

async function insertPersonalEntryIfMissing(entry) {
  const existing = await tursoClient.execute({
    sql: `
      SELECT id
      FROM personal
      WHERE assigned_to = ?
        AND date = ?
        AND coalesce(end_date, '') = ?
        AND events = ?
      LIMIT 1
    `,
    args: [entry.assignedTo, entry.date, entry.endDate, entry.events],
  });

  if (existing.rows.length) {
    return;
  }

  await tursoClient.execute({
    sql: 'INSERT INTO personal (date, end_date, events, assigned_to) VALUES (?, ?, ?, ?)',
    args: [entry.date, entry.endDate || null, entry.events, entry.assignedTo],
  });
}

async function deletePersonalEntry(entry) {
  await tursoClient.execute({
    sql: `
      DELETE FROM personal
      WHERE assigned_to = ?
        AND date = ?
        AND coalesce(end_date, '') = ?
        AND events = ?
    `,
    args: [entry.assignedTo, entry.date, entry.endDate, entry.events],
  });
}

async function buildPersonalEntries(schedule) {
  const title = normalizeText(schedule?.title);
  const date = normalizeText(schedule?.startDate);
  const endDate = normalizeText(schedule?.endDate) || date;
  const assignedUsers = await resolveAssignedUserNames(schedule?.assignedTo);

  if (!title || !date || !assignedUsers.length) {
    return [];
  }

  return assignedUsers.map((assignedTo) => ({
    assignedTo,
    date,
    endDate,
    events: title,
  }));
}

export async function syncScheduleToPersonalCalendar({ schedule, previousSchedule }) {
  const currentEntries = await buildPersonalEntries(schedule);
  const previousEntries = previousSchedule
    ? await buildPersonalEntries(previousSchedule)
    : [];

  const currentSignatures = new Set(currentEntries.map(buildEntrySignature));

  for (const previousEntry of previousEntries) {
    if (!currentSignatures.has(buildEntrySignature(previousEntry))) {
      await deletePersonalEntry(previousEntry);
    }
  }

  for (const currentEntry of currentEntries) {
    await insertPersonalEntryIfMissing(currentEntry);
  }
}
