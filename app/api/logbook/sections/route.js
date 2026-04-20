import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifySession } from '@/lib/auth-session';
import { createLogbookSection } from '@/lib/logbook-options';
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
        { error: 'Your account is not allowed to manage logbook sections.' },
        { status: 403 }
      );
    }

    const payload = await request.json();
    const section = normalizeText(payload.section);

    if (!section) {
      return NextResponse.json(
        { error: 'Section name is required.' },
        { status: 400 }
      );
    }

    const addedBy = allowedUser.email ?? session.email;
    const result = await createLogbookSection(section, addedBy);

    revalidatePath('/logbook/new');
    revalidatePath('/logbook');

    return NextResponse.json({
      created: result.created,
      message: result.created
        ? 'Section added successfully.'
        : 'Section already exists.',
      section: result.section,
      sections: result.sections,
    });
  } catch (error) {
    console.error('Failed to create logbook section.', error);

    return NextResponse.json(
      { error: 'Unable to add the section right now.' },
      { status: 500 }
    );
  }
}
