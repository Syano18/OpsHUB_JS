import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifySession } from '@/lib/auth-session';
import {
  createBackdatedDigitalLogbookEntry,
  getDigitalLogbookEntryById,
} from '@/lib/digital-logbook';
import {
  getRegisteredUserDisplayNames,
  getUserPermissionByEmail,
} from '@/lib/user-permissions';
import {
  getLogbookModes,
  getLogbookSections,
} from '@/lib/logbook-options';

const BACKDATED_INSERT_ROLES = new Set(['super_admin', 'admin', 'pacd']);

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeListValues(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenValues = new Set();

  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .filter((item) => {
      const normalizedItem = item.toLowerCase();

      if (seenValues.has(normalizedItem)) {
        return false;
      }

      seenValues.add(normalizedItem);
      return true;
    });
}

function normalizeReferenceNumber(value) {
  return normalizeText(value);
}

function normalizeTimestampValue(value) {
  const text = String(value ?? '').trim();

  if (!text) {
    return null;
  }

  const normalizedTimestamp = text.replace('T', ' ');
  const timestampPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/;

  if (!timestampPattern.test(normalizedTimestamp)) {
    return null;
  }

  return normalizedTimestamp.length === 16
    ? `${normalizedTimestamp}:00`
    : normalizedTimestamp;
}

function isRoleAllowedToBackdate(role) {
  return BACKDATED_INSERT_ROLES.has(String(role ?? '').trim().toLowerCase());
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
        { error: 'Your account is not allowed to create logbook records.' },
        { status: 403 }
      );
    }

    if (!isRoleAllowedToBackdate(allowedUser.role)) {
      return NextResponse.json(
        { error: 'You are not allowed to create backdated logbook records.' },
        { status: 403 }
      );
    }

    const payload = await request.json();
    const referenceNumber = normalizeReferenceNumber(payload.referenceNumber);
    const timestamp = normalizeTimestampValue(payload.timestamp);
    const particulars = normalizeText(payload.particulars);
    const addresseeValues = normalizeListValues(payload.addressee);
    const transmitter = normalizeText(payload.transmitter);
    const section = normalizeText(payload.section);
    const remarks = normalizeText(payload.remarks);
    const modeValues = normalizeListValues(payload.modeOfTransmittal);

    if (
      !referenceNumber ||
      !timestamp ||
      !particulars ||
      !addresseeValues.length ||
      !transmitter ||
      !section ||
      !modeValues.length
    ) {
      return NextResponse.json(
        {
          error:
            'Reference Number, Timestamp, Particulars, Addressee, Transmitter, Section, and at least one Mode of Transmittal are required.',
        },
        { status: 400 }
      );
    }

    const [registeredUsers, allowedSections, allowedModes] =
      await Promise.all([
        getRegisteredUserDisplayNames(),
        getLogbookSections(),
        getLogbookModes(),
      ]);

    if (!registeredUsers.includes(transmitter)) {
      return NextResponse.json(
        {
          error:
            'Please choose a valid transmitter from the active registered users.',
        },
        { status: 400 }
      );
    }

    if (!allowedSections.includes(section)) {
      return NextResponse.json(
        { error: 'Please choose a valid section.' },
        { status: 400 }
      );
    }

    if (modeValues.some((mode) => !allowedModes.includes(mode))) {
      return NextResponse.json(
        { error: 'Please choose valid mode of transmittal values.' },
        { status: 400 }
      );
    }

    const encodedBy = allowedUser.email ?? session.email;

    const entryId = await createBackdatedDigitalLogbookEntry({
      timestamp,
      referenceNumber,
      particulars,
      addressee: addresseeValues.join(', '),
      transmitter,
      section,
      modeOfTransmittal: modeValues.join(', '),
      remarks,
      encodedBy,
    });
    const createdEntry = await getDigitalLogbookEntryById(entryId);

    revalidatePath('/logbook');

    return NextResponse.json({
      id: entryId,
      message: 'Backdated logbook record created successfully.',
      referenceNumber: createdEntry?.referenceNumber ?? referenceNumber,
      timestamp: createdEntry?.timestamp ?? timestamp,
    });
  } catch (error) {
    console.error('Failed to create backdated Digital Logbook entry.', error);

    return NextResponse.json(
      { error: 'Unable to save the backdated logbook record right now.' },
      { status: 500 }
    );
  }
}
