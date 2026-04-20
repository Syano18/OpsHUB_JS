import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifySession } from '@/lib/auth-session';
import { createLogbookAddressee } from '@/lib/logbook-options';
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
        { error: 'Your account is not allowed to manage logbook addressees.' },
        { status: 403 }
      );
    }

    const payload = await request.json();
    const addressee = normalizeText(payload.addressee);

    if (!addressee) {
      return NextResponse.json(
        { error: 'Addressee name is required.' },
        { status: 400 }
      );
    }

    const addedBy = allowedUser.email ?? session.email;
    const result = await createLogbookAddressee(addressee, addedBy);

    revalidatePath('/logbook/new');
    revalidatePath('/logbook');

    return NextResponse.json({
      created: result.created,
      message: result.created
        ? 'Addressee added successfully.'
        : 'Addressee already exists.',
      addressee: result.addressee,
      addressees: result.addressees,
    });
  } catch (error) {
    console.error('Failed to create logbook addressee.', error);

    return NextResponse.json(
      { error: 'Unable to add the addressee right now.' },
      { status: 500 }
    );
  }
}
