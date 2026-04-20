import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifySession } from '@/lib/auth-session';
import {
	getDigitalLogbookEntryById,
	updateDigitalLogbookEntryById,
} from '@/lib/digital-logbook';
import {
	getRegisteredUserDisplayNames,
	getUserPermissionByEmail,
} from '@/lib/user-permissions';
import {
	getLogbookAddressees,
	getLogbookModes,
	getLogbookSections,
} from '@/lib/logbook-options';

function normalizeText(value) {
	const text = String(value ?? '').trim();
	return text || null;
}

function normalizeModeValues(value) {
	return normalizeListValues(value);
}

function normalizeAddresseeValues(value) {
	return normalizeListValues(value);
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

function normalizeEmail(value) {
	return String(value ?? '').trim().toLowerCase();
}

function canEditEntry(sessionEmail, entryEncodedBy) {
	const normalizedSessionEmail = normalizeEmail(sessionEmail);
	const normalizedEncodedBy = normalizeEmail(entryEncodedBy);

	return Boolean(normalizedSessionEmail) &&
		Boolean(normalizedEncodedBy) &&
		normalizedSessionEmail === normalizedEncodedBy;
}

async function parseEntryId(paramsPromise) {
	const params = await paramsPromise;
	const id = Number(params?.id);

	if (!Number.isInteger(id) || id < 1) {
		return null;
	}

	return id;
}

export async function GET(_request, { params }) {
	try {
		const session = await verifySession();

		if (!session?.email) {
			return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
		}

		const entryId = await parseEntryId(params);

		if (!entryId) {
			return NextResponse.json({ error: 'Invalid record id.' }, { status: 400 });
		}

		const entry = await getDigitalLogbookEntryById(entryId);

		if (!entry) {
			return NextResponse.json({ error: 'Logbook record not found.' }, { status: 404 });
		}

		if (!canEditEntry(session.email, entry.encodedBy)) {
			return NextResponse.json(
				{ error: 'You can only edit records that you encoded.' },
				{ status: 403 }
			);
		}

		return NextResponse.json({ entry });
	} catch (error) {
		console.error('Failed to load Digital Logbook entry.', error);

		return NextResponse.json(
			{ error: 'Unable to load the logbook record right now.' },
			{ status: 500 }
		);
	}
}

export async function PUT(request, { params }) {
	try {
		const session = await verifySession();

		if (!session?.email) {
			return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
		}

		const allowedUser = await getUserPermissionByEmail(session.email);

		if (!allowedUser) {
			return NextResponse.json(
				{ error: 'Your account is not allowed to update logbook records.' },
				{ status: 403 }
			);
		}

		const entryId = await parseEntryId(params);

		if (!entryId) {
			return NextResponse.json({ error: 'Invalid record id.' }, { status: 400 });
		}

		const existingEntry = await getDigitalLogbookEntryById(entryId);

		if (!existingEntry) {
			return NextResponse.json({ error: 'Logbook record not found.' }, { status: 404 });
		}

		if (!canEditEntry(session.email, existingEntry.encodedBy)) {
			return NextResponse.json(
				{ error: 'You can only edit records that you encoded.' },
				{ status: 403 }
			);
		}

		const payload = await request.json();
		const particulars = normalizeText(payload.particulars);
		const addresseeValues = normalizeAddresseeValues(payload.addressee);
		const transmitter = normalizeText(payload.transmitter);
		const section = normalizeText(payload.section);
		const remarks = normalizeText(payload.remarks);
		const modeValues = normalizeModeValues(payload.modeOfTransmittal);

		if (
			!particulars ||
			!addresseeValues.length ||
			!transmitter ||
			!section ||
			!modeValues.length
		) {
			return NextResponse.json(
				{
					error:
						'Particulars, Addressee, Transmitter, Section, and at least one Mode of Transmittal are required.',
				},
				{ status: 400 }
			);
		}

		const [registeredUsers, allowedAddressees, allowedSections, allowedModes] =
			await Promise.all([
				getRegisteredUserDisplayNames(),
				getLogbookAddressees(),
				getLogbookSections(),
				getLogbookModes(),
			]);

		if (
			addresseeValues.some(
				(addressee) => !allowedAddressees.includes(addressee)
			)
		) {
			return NextResponse.json(
				{ error: 'Please choose valid addressee values.' },
				{ status: 400 }
			);
		}

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

		await updateDigitalLogbookEntryById(entryId, {
			particulars,
			addressee: addresseeValues.join(', '),
			transmitter,
			section,
			modeOfTransmittal: modeValues.join(', '),
			remarks,
			encodedBy,
		});

		const updatedEntry = await getDigitalLogbookEntryById(entryId);

		revalidatePath('/logbook');
		revalidatePath(`/logbook/${entryId}/edit`);

		return NextResponse.json({
			id: entryId,
			message: 'Logbook record updated successfully.',
			referenceNumber:
				updatedEntry?.referenceNumber ?? existingEntry.referenceNumber ?? null,
		});
	} catch (error) {
		console.error('Failed to update Digital Logbook entry.', error);

		return NextResponse.json(
			{ error: 'Unable to update the logbook record right now.' },
			{ status: 500 }
		);
	}
}
