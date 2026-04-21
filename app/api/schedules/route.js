import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifySession } from '@/lib/auth-session';
import {
  getRegisteredUserDisplayNames,
  getUserPermissionByEmail,
} from '@/lib/user-permissions';
import { createSchedule } from '@/lib/schedules';
import {
  appendNotificationSummary,
  collectNotificationFailures,
  sendScheduleAssignmentNotifications,
} from '@/lib/schedule-notifications';
import { syncScheduleToPersonalCalendar } from '@/lib/schedule-personal-sync';

const ALL_EMPLOYEES_OPTION = 'All employees';

function normalizeText(value) {
  const normalized = String(value ?? '').trim();
  return normalized || '';
}

function validateAssignedToValues(values, activeUserNames) {
  if (!values.length) {
    return 'Assigned to is required.';
  }

  if (values.includes(ALL_EMPLOYEES_OPTION)) {
    return values.length === 1
      ? ''
      : 'All employees must be selected by itself.';
  }

  const activeUserNameSet = new Set(
    activeUserNames.map((name) => normalizeText(name).toLowerCase())
  );

  const invalidValues = values.filter(
    (value) => !activeUserNameSet.has(normalizeText(value).toLowerCase())
  );

  if (invalidValues.length) {
    return `Assigned to contains inactive or unknown users: ${invalidValues.join(', ')}.`;
  }

  return '';
}

export async function POST(request) {
  try {
    const session = await verifySession();

    if (!session?.email) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const allowedUser = await getUserPermissionByEmail(session.email);

    if (!allowedUser) {
      return NextResponse.json({ error: 'User is not allowed.' }, { status: 403 });
    }

    const payload = await request.json();
    const title = normalizeText(payload?.title);
    const startDate = normalizeText(payload?.startDate);
    const endDate = normalizeText(payload?.endDate);
    const remarks = normalizeText(payload?.remarks);
    const activeUserNames = await getRegisteredUserDisplayNames();
    const assignedToValues = Array.isArray(payload?.assignedTo)
      ? payload.assignedTo
          .map((value) => normalizeText(value))
          .filter(Boolean)
      : [];

    if (!title) {
      return NextResponse.json(
        { error: 'Schedule title is required.' },
        { status: 400 }
      );
    }

    if (!startDate) {
      return NextResponse.json(
        { error: 'Start date is required.' },
        { status: 400 }
      );
    }

    if (!endDate) {
      return NextResponse.json(
        { error: 'End date is required.' },
        { status: 400 }
      );
    }

    if (startDate && endDate && endDate < startDate) {
      return NextResponse.json(
        { error: 'End date cannot be earlier than start date.' },
        { status: 400 }
      );
    }

    const assignedToError = validateAssignedToValues(
      assignedToValues,
      activeUserNames
    );

    if (assignedToError) {
      return NextResponse.json({ error: assignedToError }, { status: 400 });
    }

    const schedule = await createSchedule({
      title,
      startDate,
      endDate,
      assignedTo: assignedToValues.join(', '),
      remarks,
      encodedBy: session.email,
    });

    if (schedule) {
      await syncScheduleToPersonalCalendar({ schedule });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const notificationResult = await sendScheduleAssignmentNotifications({
            schedule,
            actorName: allowedUser.name ?? session.email,
            actorEmail: session.email,
            action: 'created',
            onProgress: (sent, total) => {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: 'progress',
                    message: `Sending email ${sent} of ${total}...`,
                  }) + '\\n'
                )
              );
            },
          });

          revalidatePath('/event');
          revalidatePath('/personal-events');

          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'success',
                message: appendNotificationSummary(
                  'Schedule added successfully.',
                  notificationResult
                ),
                notificationFailures: collectNotificationFailures(
                  notificationResult
                ),
                schedule,
              }) + '\\n'
            )
          );
          controller.close();
        } catch (error) {
          console.error('Failed processing stream.', error);
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'error',
                error: 'Unable to complete notification process.',
              }) + '\\n'
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Failed to create schedule.', error);

    return NextResponse.json(
      { error: 'Unable to create schedule right now.' },
      { status: 500 }
    );
  }
}
