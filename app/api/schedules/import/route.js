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

function normalizeAssignedTo(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean).join(', ');
  }

  return normalizeText(value);
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

function validateRecord(record, index, activeUserNames) {
  const title = normalizeText(record?.title);
  const startDate = normalizeText(record?.startDate);
  const endDate = normalizeText(record?.endDate);
  const assignedToValues = Array.isArray(record?.assignedTo)
    ? record.assignedTo.map((value) => normalizeText(value)).filter(Boolean)
    : [];

  if (!title) {
    return `Row ${index + 1}: Title is required.`;
  }

  if (!startDate) {
    return `Row ${index + 1}: Start date is required.`;
  }

  if (!endDate) {
    return `Row ${index + 1}: End date is required.`;
  }

  if (startDate && endDate && endDate < startDate) {
    return `Row ${index + 1}: End date cannot be earlier than start date.`;
  }

  const assignedToError = validateAssignedToValues(
    assignedToValues,
    activeUserNames
  );

  if (assignedToError) {
    return `Row ${index + 1}: ${assignedToError}`;
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
    const records = Array.isArray(payload?.records) ? payload.records : [];
    const activeUserNames = await getRegisteredUserDisplayNames();

    if (!records.length) {
      return NextResponse.json(
        { error: 'No schedule rows were provided.' },
        { status: 400 }
      );
    }

    for (const [index, record] of records.entries()) {
      const validationError = validateRecord(record, index, activeUserNames);

      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const insertedSchedules = [];
          const notificationResults = [];

          let processedCount = 0;
          for (const record of records) {
            const schedule = await createSchedule({
              title: normalizeText(record.title),
              startDate: normalizeText(record.startDate),
              endDate: normalizeText(record.endDate),
              assignedTo: normalizeAssignedTo(record.assignedTo),
              remarks: normalizeText(record.remarks),
              encodedBy: session.email,
            });

            if (schedule) {
              insertedSchedules.push(schedule);
              await syncScheduleToPersonalCalendar({ schedule });
              processedCount++;
              
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: 'progress',
                    message: `Sending emails for schedule ${processedCount} of ${records.length}...`,
                  }) + '\\n'
                )
              );

              notificationResults.push(
                await sendScheduleAssignmentNotifications({
                  schedule,
                  actorName: allowedUser.name ?? session.email,
                  actorEmail: session.email,
                  action: 'created',
                  onProgress: (sent, total) => {
                    controller.enqueue(
                      encoder.encode(
                        JSON.stringify({
                          type: 'progress',
                          message: `Sending emails for schedule ${processedCount} of ${records.length}... (${sent}/${total})`,
                        }) + '\\n'
                      )
                    );
                  },
                })
              );
            }
          }

          revalidatePath('/event');
          revalidatePath('/personal-events');

          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'success',
                message: appendNotificationSummary(
                  `${insertedSchedules.length} schedule${insertedSchedules.length === 1 ? '' : 's'} imported successfully.`,
                  notificationResults
                ),
                notificationFailures: collectNotificationFailures(
                  notificationResults
                ),
                schedules: insertedSchedules,
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
    console.error('Failed to import schedules.', error);

    return NextResponse.json(
      { error: 'Unable to import schedules right now.' },
      { status: 500 }
    );
  }
}
