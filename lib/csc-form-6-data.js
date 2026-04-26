import { getLeaveRequestGroup } from '@/lib/leaves';
import { getUserPermissionByEmail } from '@/lib/user-permissions';

const STATIC_OFFICE_DEPARTMENT = 'PSA-RSSO CAR, Kalinga';
export const CSC_FORM_MOCK_GROUP_ID = '__mock__';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function formatFullName(user) {
  const parts = [
    user?.firstName,
    user?.middleName,
    user?.lastName,
    user?.suffix,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  return parts.join(' ');
}

function formatNameParts(user) {
  const firstName = normalizeText(user?.firstName);
  const middleName = normalizeText(user?.middleName);
  const lastName = normalizeText(user?.lastName);
  const suffix = normalizeText(user?.suffix);

  return {
    firstName,
    middleName,
    lastName: [lastName, suffix].filter(Boolean).join(' '),
  };
}

function formatDateLabel(value) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return '';
  }

  const parsedDate = new Date(
    normalizedValue.includes('T')
      ? normalizedValue
      : `${normalizedValue.replace(' ', 'T')}`
  );

  if (Number.isNaN(parsedDate.getTime())) {
    return normalizedValue;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(parsedDate);
}

function formatSalaryLabel(value) {
  const salary = Number(value ?? 0);

  if (!Number.isFinite(salary) || salary <= 0) {
    return '';
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(salary);
}

function formatRequestedDaysLabel(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return '';
  }

  return `${numericValue} ${numericValue === 1 ? 'day' : 'days'}`;
}

function sortDateValues(left, right) {
  return left.localeCompare(right);
}

function formatCompactDateRange(startValue, endValue) {
  const start = new Date(`${startValue}T00:00:00`);
  const end = new Date(`${endValue}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return startValue === endValue ? startValue : `${startValue} to ${endValue}`;
  }

  const sameMonth =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();
  const sameYear = start.getFullYear() === end.getFullYear();

  if (startValue === endValue) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(start);
  }

  if (sameMonth) {
    const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(
      start
    );
    return `${monthLabel} ${start.getDate()}-${end.getDate()}, ${start.getFullYear()}`;
  }

  if (sameYear) {
    const startLabel = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(start);
    const endLabel = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(end);
    return `${startLabel} to ${endLabel}`;
  }

  return `${formatDateLabel(startValue)} to ${formatDateLabel(endValue)}`;
}

function compressLeaveDates(leaveDates) {
  const normalizedLeaveDates = [
    ...new Set((leaveDates ?? []).map(normalizeText).filter(Boolean)),
  ].sort(sortDateValues);

  if (!normalizedLeaveDates.length) {
    return '';
  }

  const ranges = [];
  let rangeStart = normalizedLeaveDates[0];
  let previousDate = normalizedLeaveDates[0];

  for (let index = 1; index < normalizedLeaveDates.length; index += 1) {
    const currentDate = normalizedLeaveDates[index];
    const previous = new Date(`${previousDate}T00:00:00`);
    const current = new Date(`${currentDate}T00:00:00`);
    const differenceInDays = Math.round(
      (current.getTime() - previous.getTime()) / 86400000
    );

    if (differenceInDays === 1) {
      previousDate = currentDate;
      continue;
    }

    ranges.push(formatCompactDateRange(rangeStart, previousDate));
    rangeStart = currentDate;
    previousDate = currentDate;
  }

  ranges.push(formatCompactDateRange(rangeStart, previousDate));
  return ranges.join('; ');
}

function parseReasonMetadata(reason) {
  const lines = normalizeText(reason)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const metadata = {
    generalReason: [],
    location: '',
    specifiedPlace: '',
    sickLeaveType: '',
    illness: '',
  };

  for (const line of lines) {
    if (line.startsWith('Location: ')) {
      metadata.location = line.replace('Location: ', '').trim();
      continue;
    }

    if (line.startsWith('Specified Place: ')) {
      metadata.specifiedPlace = line.replace('Specified Place: ', '').trim();
      continue;
    }

    if (line.startsWith('Sick Leave Type: ')) {
      metadata.sickLeaveType = line.replace('Sick Leave Type: ', '').trim();
      continue;
    }

    if (line.startsWith('Illness: ')) {
      metadata.illness = line.replace('Illness: ', '').trim();
      continue;
    }

    metadata.generalReason.push(line);
  }

  return metadata;
}

function buildLeaveDetailsText(leaveType, metadata) {
  const detailLines = [];

  if (leaveType === 'social') {
    detailLines.push('Special Privilege Leave');
  }

  if (leaveType === 'wellness') {
    detailLines.push('Wellness Leave');
  }

  if (metadata.location) {
    detailLines.push(metadata.location);
  }

  if (metadata.specifiedPlace) {
    detailLines.push(metadata.specifiedPlace);
  }

  if (metadata.sickLeaveType) {
    detailLines.push(metadata.sickLeaveType);
  }

  if (metadata.illness) {
    detailLines.push(metadata.illness);
  }

  if (metadata.generalReason.length) {
    detailLines.push(metadata.generalReason.join(' '));
  }

  return detailLines.join('\n');
}

function splitInclusiveDates(value, maxLineLength = 36) {
  const segments = normalizeText(value)
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!segments.length) {
    return [];
  }

  const lines = [];
  let currentLine = '';

  for (const segment of segments) {
    const nextLine = currentLine ? `${currentLine}; ${segment}` : segment;

    if (nextLine.length <= maxLineLength || !currentLine) {
      currentLine = nextLine;
      continue;
    }

    lines.push(currentLine);
    currentLine = segment;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.slice(0, 3);
}

function getLeaveSelections(leaveType, metadata) {
  return {
    vacation: leaveType === 'vacation',
    sick: leaveType === 'sick',
    forced: leaveType === 'forced',
    specialPrivilege: leaveType === 'social',
    others: leaveType === 'wellness',
    withinPhilippines: metadata.location === 'Within the Philippines',
    abroad: metadata.location === 'Abroad',
    inHospital: metadata.sickLeaveType === 'In Hospital',
    outPatient: metadata.sickLeaveType === 'Out Patient',
  };
}

function getLeaveTypeLabel(leaveType) {
  switch (leaveType) {
    case 'vacation':
      return 'Vacation Leave';
    case 'sick':
      return 'Sick Leave';
    case 'forced':
      return 'Forced Leave';
    case 'social':
      return 'Special Privilege Leave';
    case 'wellness':
      return 'Others';
    case 'use_leave':
      return 'USE Leave';
    default:
      return normalizeText(leaveType)
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
  }
}

export function getMockCscForm6ViewData() {
  const metadata = {
    generalReason: ['Personal errands and family matters.'],
    location: 'Within the Philippines',
    specifiedPlace: 'Tabuk City, Kalinga',
    sickLeaveType: '',
    illness: '',
  };
  const inclusiveDates = 'Apr 28-29, 2026';

  return {
    officeDepartment: STATIC_OFFICE_DEPARTMENT,
    employeeEmail: 'mock.user@psa.gov.ph',
    employeeName: 'Christian Dacpano',
    nameParts: {
      firstName: 'Frizhinn Ivee',
      middleName: 'Taway',
      lastName: 'Matute',
    },
    dateFiled: 'April 23, 2026',
    position: 'Information Systems Analyst II',
    salary: '45,000.00',
    leaveType: 'wellness',
    leaveTypeLabel: 'Others',
    leaveDetails: buildLeaveDetailsText('wellness', metadata),
    inclusiveDates,
    inclusiveDateLines: splitInclusiveDates(inclusiveDates),
    requestedDays: formatRequestedDaysLabel(2),
    metadata,
    selections: getLeaveSelections('wellness', metadata),
  };
}

export function buildCscForm6ViewData(leaveRequestGroup, employee) {
  if (!leaveRequestGroup) {
    throw new Error('Leave request group not found.');
  }

  if (leaveRequestGroup.leaveType === 'use_leave') {
    throw new Error('CSC Form 6 is not available yet for USE Leave.');
  }

  if (!employee) {
    throw new Error('Employee information could not be loaded for the CSC form.');
  }

  const metadata = parseReasonMetadata(leaveRequestGroup.reason);
  const nameParts = formatNameParts(employee);
  const inclusiveDates = compressLeaveDates(leaveRequestGroup.leaveDates);

  return {
    officeDepartment: STATIC_OFFICE_DEPARTMENT,
    employeeEmail: leaveRequestGroup.employeeEmail,
    employeeName: formatFullName(employee),
    nameParts,
    dateFiled: formatDateLabel(leaveRequestGroup.filedAt),
    position: normalizeText(employee.position),
    salary: formatSalaryLabel(employee.salary),
    leaveType: leaveRequestGroup.leaveType,
    leaveTypeLabel: getLeaveTypeLabel(leaveRequestGroup.leaveType),
    leaveDetails: buildLeaveDetailsText(leaveRequestGroup.leaveType, metadata),
    inclusiveDates,
    inclusiveDateLines: splitInclusiveDates(inclusiveDates),
    requestedDays: formatRequestedDaysLabel(leaveRequestGroup.requestedDays),
    metadata,
    selections: getLeaveSelections(leaveRequestGroup.leaveType, metadata),
  };
}

export async function getCscForm6ViewData(groupIdentifier) {
  const leaveRequestGroup = await getLeaveRequestGroup(groupIdentifier);

  if (!leaveRequestGroup) {
    throw new Error('Leave request group not found.');
  }

  const employee = await getUserPermissionByEmail(leaveRequestGroup.employeeEmail);

  return buildCscForm6ViewData(leaveRequestGroup, employee);
}
