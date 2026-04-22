import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifySession } from '@/lib/auth-session';
import { createLeaveRequest } from '@/lib/leaves';
import { getUserPermissionByEmail } from '@/lib/user-permissions';

function normalizeText(value) {
  const normalizedValue = String(value ?? '').trim();
  return normalizedValue || '';
}

function normalizeDateList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((dateValue) => normalizeText(dateValue))
    .filter(Boolean);
}

export async function POST(request) {
  try {
    const session = await verifySession();

    if (!session?.email) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const allowedUser = await getUserPermissionByEmail(session.email);

    if (!allowedUser) {
      return NextResponse.json(
        { error: 'Your account is not allowed to file leave requests.' },
        { status: 403 }
      );
    }

    const payload = await request.json();
    const leaveType = normalizeText(payload?.leaveType).toLowerCase();
    const leaveDates = normalizeDateList(payload?.leaveDates);
    const reason = normalizeText(payload?.reason);

    const createdRequest = await createLeaveRequest({
      employeeEmail: allowedUser.email ?? session.email,
      employeeName: allowedUser.name ?? session.name ?? session.email,
      leaveType,
      leaveDates,
      reason,
    });

    revalidatePath('/leave-monitoring');

    return NextResponse.json({
      id: createdRequest?.id ?? null,
      requestedDays: createdRequest?.requestedDays ?? 0,
      message:
        createdRequest?.requestedDays > 1
          ? `${createdRequest.requestedDays} leave dates submitted for HR review.`
          : 'Leave date submitted for HR review.',
    });
  } catch (error) {
    console.error('Failed to file leave request.', error);

    return NextResponse.json(
      { error: error.message || 'Unable to file the leave request right now.' },
      { status: 400 }
    );
  }
}
