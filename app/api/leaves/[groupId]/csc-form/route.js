import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth-session';
import { getUserPermissionByEmail } from '@/lib/user-permissions';
import { getLeaveRequestGroup } from '@/lib/leaves';
import { generateCscForm6Pdf } from '@/lib/csc-leave-form';

export const dynamic = 'force-dynamic';
const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production';
const PDF_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const pdfCacheByGroupId = new Map();

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeRole(value) {
  return normalizeText(value).toLowerCase();
}

function getCachedPdf(groupId) {
  const cached = pdfCacheByGroupId.get(groupId);
  if (!cached) {
    return null;
  }

  const elapsedMs = Date.now() - cached.cachedAt;
  if (elapsedMs > PDF_CACHE_TTL_MS) {
    pdfCacheByGroupId.delete(groupId);
    if (IS_DEVELOPMENT) {
      console.info(`[CSC Form 6 PDF] cache expired for group=${groupId} after ${elapsedMs}ms`);
    }
    return null;
  }

  if (IS_DEVELOPMENT) {
    console.info(`[CSC Form 6 PDF] cache hit for group=${groupId}, age=${elapsedMs}ms`);
  }
  return cached;
}

function setCachedPdf(groupId, document) {
  pdfCacheByGroupId.set(groupId, {
    ...document,
    cachedAt: Date.now(),
  });
}

export async function GET(_request, context) {
  try {
    const session = await verifySession();

    if (!session?.email) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const params = await context.params;
    const groupId = normalizeText(params?.groupId);

    if (!groupId) {
      return NextResponse.json(
        { error: 'A valid leave request group is required.' },
        { status: 400 }
      );
    }

    const [currentUser, leaveRequestGroup] = await Promise.all([
      getUserPermissionByEmail(session.email),
      getLeaveRequestGroup(groupId),
    ]);

    if (!leaveRequestGroup) {
      return NextResponse.json({ error: 'Leave request group not found.' }, { status: 404 });
    }

    const currentRole = normalizeRole(currentUser?.role);
    const canAccess =
      leaveRequestGroup.employeeEmail === normalizeText(session.email).toLowerCase() ||
      currentRole === 'admin' ||
      currentRole === 'super_admin';

    if (!canAccess) {
      return NextResponse.json(
        { error: 'You are not allowed to access this leave form.' },
        { status: 403 }
      );
    }

    // Check cache before generating
    const cachedDocument = getCachedPdf(groupId);
    if (cachedDocument) {
      return new NextResponse(cachedDocument.bytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${cachedDocument.fileName}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const leaveEmployeeEmail = normalizeText(leaveRequestGroup.employeeEmail).toLowerCase();
    const sessionEmail = normalizeText(session.email).toLowerCase();

    const employeeForForm =
      leaveEmployeeEmail === sessionEmail
        ? currentUser
        : await getUserPermissionByEmail(leaveRequestGroup.employeeEmail);

    const document = await generateCscForm6Pdf(groupId, {
      leaveRequestGroup,
      employee: employeeForForm,
    });

    // Cache the generated PDF
    setCachedPdf(groupId, document);

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
