import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifySession } from '@/lib/auth-session';
import { getUserPermissionByEmail } from '@/lib/user-permissions';
import {
  createNotifications,
  markNotificationsReadByEntity,
} from '@/lib/notifications';
import { updateLeaveRequestGroupStatus } from '@/lib/leaves';

const LEAVE_APPROVER_ROLES = new Set(['admin', 'super_admin']);

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeRole(value) {
  return normalizeText(value).toLowerCase();
}

function canApproveLeave(role) {
  return LEAVE_APPROVER_ROLES.has(normalizeRole(role));
}

export async function PATCH(request, context) {
  try {
    const session = await verifySession();

    if (!session?.email) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const allowedUser = await getUserPermissionByEmail(session.email);

    if (!allowedUser || !canApproveLeave(allowedUser.role)) {
      return NextResponse.json(
        { error: 'Only admin and super_admin can reject leave requests.' },
        { status: 403 }
      );
    }

    const payload = await request.json().catch(() => ({}));
    const params = await context.params;
    const groupId = normalizeText(params?.groupId);
    const hrRemarks = normalizeText(payload?.hrRemarks);

    if (!groupId) {
      return NextResponse.json(
        { error: 'A valid leave request group is required.' },
        { status: 400 }
      );
    }

    if (!hrRemarks) {
      return NextResponse.json(
        { error: 'A reason is required when declining a leave request.' },
        { status: 400 }
      );
    }

    const updatedGroup = await updateLeaveRequestGroupStatus({
      groupIdentifier: groupId,
      status: 'rejected',
      reviewerEmail: allowedUser.email ?? session.email,
      hrRemarks,
    });

    await markNotificationsReadByEntity({
      relatedEntityId: updatedGroup?.requestGroupId ?? groupId,
      type: 'leave_request',
      relatedEntityType: 'leave_request',
    });

    if (updatedGroup?.employeeEmail) {
      await createNotifications([
        {
          recipientEmail: updatedGroup.employeeEmail,
          actorEmail: allowedUser.email ?? session.email,
          actorName: allowedUser.name ?? session.name ?? session.email,
          type: 'leave_rejected',
          title: 'Leave request rejected',
          message: `Your ${updatedGroup.leaveType?.replace(/_/g, ' ') ?? 'leave'} request has been rejected. Reason: ${hrRemarks}`,
          relatedEntityType: 'leave_request',
          relatedEntityId: updatedGroup.requestGroupId,
        },
      ]);
    }

    revalidatePath('/leave-monitoring');

    return NextResponse.json({
      requestGroupId: updatedGroup?.requestGroupId ?? groupId,
      status: 'rejected',
      message: 'Leave request rejected successfully.',
    });
  } catch (error) {
    console.error('Failed to reject leave request.', error);

    return NextResponse.json(
      { error: error.message || 'Unable to reject the leave request right now.' },
      { status: 400 }
    );
  }
}
