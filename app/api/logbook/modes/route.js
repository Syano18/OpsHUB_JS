import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifySession } from '@/lib/auth-session';
import { createLogbookMode } from '@/lib/logbook-options';
import { getUserPermissionByEmail } from '@/lib/user-permissions';

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
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
        { error: 'Your account is not allowed to manage logbook modes.' },
        { status: 403 }
      );
    }

    const payload = await request.json();
    const mode = normalizeText(payload.mode);

    if (!mode) {
      return NextResponse.json(
        { error: 'Mode of transmittal is required.' },
        { status: 400 }
      );
    }

    const addedBy = allowedUser.email ?? session.email;
    const result = await createLogbookMode(mode, addedBy);

    revalidatePath('/logbook/new');
    revalidatePath('/logbook');

    return NextResponse.json({
      created: result.created,
      message: result.created
        ? 'Mode of transmittal added successfully.'
        : 'Mode of transmittal already exists.',
      mode: result.mode,
      modes: result.modes,
    });
  } catch (error) {
    console.error('Failed to create logbook mode.', error);

    return NextResponse.json(
      { error: 'Unable to add the mode of transmittal right now.' },
      { status: 500 }
    );
  }
}
