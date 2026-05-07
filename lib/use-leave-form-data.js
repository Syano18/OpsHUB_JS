import { getLeaveRequestGroup } from '@/lib/leaves';
import { getUserPermissionByEmail } from '@/lib/user-permissions';

const STATIC_OFFICE_DEPARTMENT = 'PSA-RSSO CAR, Kalinga';

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

function compressLeaveDates(leaveDates) {
  const normalizedLeaveDates = [
    ...new Set((leaveDates ?? []).map(normalizeText).filter(Boolean)),
  ].sort(sortDateValues);

  if (!normalizedLeaveDates.length) {
    return '';
  }

  const validDates = [];
  const invalidDates = [];

  for (const dateStr of normalizedLeaveDates) {
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) {
      invalidDates.push(dateStr);
    } else {
      validDates.push({
        dateStr,
        date: d,
        year: d.getFullYear(),
        month: d.getMonth(),
        day: d.getDate(),
        time: d.getTime(),
      });
    }
  }

  const groups = [];
  let currentGroup = null;

  for (const item of validDates) {
    if (!currentGroup || currentGroup.year !== item.year || currentGroup.month !== item.month) {
      currentGroup = { year: item.year, month: item.month, date: item.date, items: [] };
      groups.push(currentGroup);
    }
    currentGroup.items.push(item);
  }

  const groupStrings = groups.map((group) => {
    const dayRanges = [];
    let rangeStart = group.items[0];
    let previousItem = group.items[0];

    for (let i = 1; i < group.items.length; i += 1) {
      const currentItem = group.items[i];
      const differenceInDays = Math.round(
        (currentItem.time - previousItem.time) / 86400000
      );

      if (differenceInDays === 1) {
        previousItem = currentItem;
        continue;
      }

      if (rangeStart.day === previousItem.day) {
        dayRanges.push(`${rangeStart.day}`);
      } else {
        dayRanges.push(`${rangeStart.day}-${previousItem.day}`);
      }

      rangeStart = currentItem;
      previousItem = currentItem;
    }

    if (rangeStart.day === previousItem.day) {
      dayRanges.push(`${rangeStart.day}`);
    } else {
      dayRanges.push(`${rangeStart.day}-${previousItem.day}`);
    }

    const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(group.date);
    return `${monthLabel} ${dayRanges.join(', ')}, ${group.year}`;
  });

  return [...invalidDates, ...groupStrings].join('; ');
}

function buildUseLeaveViewData(leaveRequestGroup, employee) {
  if (!leaveRequestGroup) {
    throw new Error('Leave request group not found.');
  }

  if (leaveRequestGroup.leaveType !== 'use_leave') {
    throw new Error('USE Leave form is only available for USE Leave.');
  }

  if (!employee) {
    throw new Error('Employee information could not be loaded for the USE form.');
  }

  return {
    employeeEmail: leaveRequestGroup.employeeEmail,
    employeeName: formatFullName(employee),
    nameParts: formatNameParts(employee),
    position: normalizeText(employee.position),
    salaryGrade: normalizeText(employee.salaryGrade),
    officeDepartment: STATIC_OFFICE_DEPARTMENT,
    dateFiled: formatDateLabel(leaveRequestGroup.filedAt),
    requestedDays: formatRequestedDaysLabel(leaveRequestGroup.requestedDays),
    dateAvailed: compressLeaveDates(leaveRequestGroup.leaveDates),
    dayOffPlace: normalizeText(leaveRequestGroup.reason),
  };
}

export async function getUseLeaveViewData(groupIdentifier) {
  const leaveRequestGroup = await getLeaveRequestGroup(groupIdentifier);

  if (!leaveRequestGroup) {
    throw new Error('Leave request group not found.');
  }

  const employee = await getUserPermissionByEmail(leaveRequestGroup.employeeEmail);

  return buildUseLeaveViewData(leaveRequestGroup, employee);
}

export { buildUseLeaveViewData };
