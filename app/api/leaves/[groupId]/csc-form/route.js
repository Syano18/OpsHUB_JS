import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth-session';
import { getUserPermissionByEmail } from '@/lib/user-permissions';
import { getLeaveRequestGroup } from '@/lib/leaves';
import { CSC_FORM_MOCK_GROUP_ID } from '@/lib/csc-form-6-data';
import { generateCscForm6Pdf } from '@/lib/csc-leave-form';

export const dynamic = 'force-dynamic';
const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeRole(value) {
  return normalizeText(value).toLowerCase();
}

export async function GET(_request, context) {
  try {
    const session = await verifySession();

    if (!session?.email) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const params = await context.params;
    const groupId = normalizeText(params?.groupId);
    const isMockGroup = IS_DEVELOPMENT && groupId === CSC_FORM_MOCK_GROUP_ID;

    if (!groupId) {
      return NextResponse.json(
        { error: 'A valid leave request group is required.' },
        { status: 400 }
      );
    }

    const [currentUser, leaveRequestGroup] = await Promise.all([
      getUserPermissionByEmail(session.email),
      isMockGroup ? Promise.resolve(null) : getLeaveRequestGroup(groupId),
    ]);

    if (!isMockGroup && !leaveRequestGroup) {
      return NextResponse.json({ error: 'Leave request group not found.' }, { status: 404 });
    }

    const currentRole = normalizeRole(currentUser?.role);
    const canAccess =
      isMockGroup ||
      leaveRequestGroup.employeeEmail === normalizeText(session.email).toLowerCase() ||
      currentRole === 'admin' ||
      currentRole === 'super_admin';

    if (!canAccess) {
      return NextResponse.json(
        { error: 'You are not allowed to access this leave form.' },
        { status: 403 }
      );
    }

    let employeeForForm = null;

    if (!isMockGroup && leaveRequestGroup) {
      const leaveEmployeeEmail = normalizeText(leaveRequestGroup.employeeEmail).toLowerCase();
      const sessionEmail = normalizeText(session.email).toLowerCase();

      employeeForForm =
        leaveEmployeeEmail === sessionEmail
          ? currentUser
          : await getUserPermissionByEmail(leaveRequestGroup.employeeEmail);
    }

    const document = await generateCscForm6Pdf(groupId, {
      leaveRequestGroup,
      employee: employeeForForm,
    });

    return new NextResponse(document.bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${document.fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Failed to generate CSC Form 6.', error);

    return NextResponse.json(
      { error: error.message || 'Unable to generate the CSC Form 6 right now.' },
      { status: 400 }
    );
  }
}
