import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifySession } from '@/lib/auth-session';
import { getUserPermissionByEmail } from '@/lib/user-permissions';
import {
  getAttendanceRecordById,
  updateAttendanceRemarksById,
} from '@/lib/attendance';

const FULL_ATTENDANCE_ROLES = new Set(['admin', 'super_admin']);

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
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

function canManageAllAttendance(role) {
  return FULL_ATTENDANCE_ROLES.has(normalizeText(role));
}

function canManageRecord(record, allowedUser, session) {
  const recordFullName = normalizeText(record.fullName);
  const permissionShortName = normalizeText(
    buildAttendanceShortName(allowedUser?.firstName, allowedUser?.lastName)
  );
  const sessionShortName = normalizeText(buildShortNameFromFullName(session?.name));

  return (
    canManageAllAttendance(allowedUser?.role) ||
    (permissionShortName && recordFullName === permissionShortName) ||
    (sessionShortName && recordFullName === sessionShortName)
  );
}

export async function PATCH(request) {
  try {
    const session = await verifySession();

    if (!session?.email) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const allowedUser = await getUserPermissionByEmail(session.email);

    if (!allowedUser) {
      return NextResponse.json({ error: 'User is not allowed.' }, { status: 403 });
    }

    const payload = await request.json();
    const recordId = Number.parseInt(String(payload?.id ?? ''), 10);
    const remarks = String(payload?.remarks ?? '').trim();

    if (Number.isNaN(recordId)) {
      return NextResponse.json(
        { error: 'A valid attendance record is required.' },
        { status: 400 }
      );
    }

    const record = await getAttendanceRecordById(recordId);

    if (!record) {
      return NextResponse.json(
        { error: 'Attendance record not found.' },
        { status: 404 }
      );
    }

    if (!canManageRecord(record, allowedUser, session)) {
      return NextResponse.json(
        { error: 'You are not allowed to update this attendance record.' },
        { status: 403 }
      );
    }

    await updateAttendanceRemarksById(recordId, remarks);
    revalidatePath('/attendance');

    return NextResponse.json({
      id: recordId,
      remarks,
      message: remarks ? 'Remarks saved successfully.' : 'Remarks cleared successfully.',
    });
  } catch (error) {
    console.error('Failed to update attendance remarks.', error);

    return NextResponse.json(
      { error: 'Unable to update attendance remarks right now.' },
      { status: 500 }
    );
  }
}
