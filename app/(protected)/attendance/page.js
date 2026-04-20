import { verifySession } from '@/lib/auth-session';
import { getUserPermissionByEmail } from '@/lib/user-permissions';
import { getAttendanceRecords, getPunchErrors } from '@/lib/attendance';
import AttendanceDashboard from './attendance-dashboard';

export const dynamic = 'force-dynamic';

const FULL_ATTENDANCE_ROLES = new Set(['admin', 'super_admin']);

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function canViewAllAttendance(role) {
  return FULL_ATTENDANCE_ROLES.has(normalizeText(role));
}

function buildAttendanceShortName(firstName, lastName) {
  const normalizedFirstName = String(firstName ?? '').trim();
  const normalizedLastName = String(lastName ?? '').trim();

  if (!normalizedFirstName || !normalizedLastName) {
    return '';
  }

  return `${normalizedFirstName.charAt(0)}.${normalizedLastName}`;
}

function buildShortNameFromFullName(fullName) {
  const normalizedName = String(fullName ?? '').trim();

  if (!normalizedName) {
    return '';
  }

  const nameParts = normalizedName.split(/\s+/).filter(Boolean);

  if (nameParts.length < 2) {
    return normalizedName;
  }

  return `${nameParts[0].charAt(0)}.${nameParts[nameParts.length - 1]}`;
}

function isOwnRecord(record, allowedUser, session) {
  const recordFullName = normalizeText(record.fullName);
  const permissionShortName = normalizeText(
    buildAttendanceShortName(allowedUser?.firstName, allowedUser?.lastName)
  );
  const sessionShortName = normalizeText(buildShortNameFromFullName(session?.name));

  return (
    (permissionShortName && recordFullName === permissionShortName) ||
    (sessionShortName && recordFullName === sessionShortName)
  );
}

export default async function AttendancePage() {
  const [attendanceRecords, punchErrors, session] = await Promise.all([
    getAttendanceRecords(),
    getPunchErrors(),
    verifySession(),
  ]);
  let scopedAttendanceRecords = attendanceRecords;
  let scopedPunchErrors = punchErrors;
  let currentUserRole = null;

  if (session?.email) {
    try {
      const allowedUser = await getUserPermissionByEmail(session.email);
      currentUserRole = allowedUser?.role ?? null;

      if (allowedUser && !canViewAllAttendance(allowedUser.role)) {
        scopedAttendanceRecords = attendanceRecords.filter((record) =>
          isOwnRecord(record, allowedUser, session)
        );
        scopedPunchErrors = punchErrors.filter((record) =>
          isOwnRecord(record, allowedUser, session)
        );
      }
    } catch (error) {
      console.error('Failed to resolve attendance permissions.', error);
    }
  }

  return (
    <AttendanceDashboard
      initialAttendance={scopedAttendanceRecords}
      initialPunchErrors={scopedPunchErrors}
      currentUserRole={currentUserRole}
    />
  );
}
