import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth-session';
import { getUserPermissionByEmail } from '@/lib/user-permissions';
import { listPendingLeaveRequestGroups } from '@/lib/leaves';

const LEAVE_APPROVER_ROLES = new Set(['admin', 'super_admin']);

function normalizeRole(value) {
  return String(value ?? '').trim().toLowerCase();
}

function canApproveLeave(role) {
  return LEAVE_APPROVER_ROLES.has(normalizeRole(role));
}

export async function GET() {
  try {
    const session = await verifySession();

    if (!session?.email) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const allowedUser = await getUserPermissionByEmail(session.email);

    if (!allowedUser || !canApproveLeave(allowedUser.role)) {
      return NextResponse.json(
        { error: 'Only admin and super_admin can view pending leave requests.' },
        { status: 403 }
      );
    }

    const pendingRequests = await listPendingLeaveRequestGroups();

    return NextResponse.json({ requests: pendingRequests });
  } catch (error) {
    console.error('Failed to fetch pending leave requests.', error);

    return NextResponse.json(
      { error: 'Unable to fetch pending leave requests right now.' },
      { status: 500 }
    );
  }
}

