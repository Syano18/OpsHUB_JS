import { getEmailConfigurationStatus, sendEmail } from '@/lib/email';
import { getActiveUserDirectory } from '@/lib/user-permissions';

const ALL_EMPLOYEES_OPTION = 'All employees';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function getTodayComparableDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shouldSendNotificationForSchedule(schedule, today = getTodayComparableDate()) {
  const startDate = normalizeText(schedule?.startDate);
  const endDate = normalizeText(schedule?.endDate);

  if (endDate) {
    return endDate >= today;
  }

  if (startDate) {
    return startDate >= today;
  }

  return true;
}

function formatDateLabel(value) {
  if (!value) {
    return 'Date not set';
  }

  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function formatDateRange(startDate, endDate) {
  if (startDate && endDate) {
    if (startDate === endDate) {
      return formatDateLabel(startDate);
    }

    return `${formatDateLabel(startDate)} to ${formatDateLabel(endDate)}`;
  }

  if (startDate) {
    return `Starts ${formatDateLabel(startDate)}`;
  }

  if (endDate) {
    return `Until ${formatDateLabel(endDate)}`;
  }

  return 'Date not set';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildEmailFooter() {
  return [
    'Iyaman Unay!',
    '',
    '-ISA II',
    '',
    'This is an automated message from Kalinga Ops Hub. Please do not reply to this email.',
  ];
}

function buildGreeting(recipientName) {
  return `Hello ${normalizeText(recipientName) || 'Team member'},`;
}

function buildActionMessage(actorName, actionLabel) {
  const actor = normalizeText(actorName) || 'A team member';
  return `${actor} ${actionLabel.toLowerCase()} and assigned this to you.`;
}

function buildScheduleDetailItems(schedule) {
  const title = normalizeText(schedule?.title) || 'Untitled schedule';
  const dateRange = formatDateRange(schedule?.startDate, schedule?.endDate);
  const assignedTo = normalizeText(schedule?.assignedTo) || 'No assignee set';
  const remarks = normalizeText(schedule?.remarks) || 'No remarks added.';

  return [
    { label: 'Title', value: title },
    { label: 'Date', value: dateRange },
    { label: 'Assigned to', value: assignedTo },
    { label: 'Remarks', value: remarks },
  ];
}

function normalizeAssignedToList(assignedTo) {
  if (Array.isArray(assignedTo)) {
    return assignedTo.map((value) => normalizeText(value)).filter(Boolean);
  }

  return normalizeText(assignedTo)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function resolveRecipientDirectory(assignedTo) {
  const assignedNames = normalizeAssignedToList(assignedTo);

  if (!assignedNames.length) {
    return [];
  }

  const directory = await getActiveUserDirectory();

  if (assignedNames.includes(ALL_EMPLOYEES_OPTION)) {
    return directory;
  }

  const normalizedAssignedNameSet = new Set(
    assignedNames.map((value) => value.toLowerCase())
  );

  return directory.filter((user) =>
    normalizedAssignedNameSet.has(normalizeText(user.name).toLowerCase())
  );
}

function buildScheduleEmailContent({
  schedule,
  actorName,
  actionLabel,
  recipientName,
}) {
  const title = normalizeText(schedule?.title) || 'Untitled schedule';
  const subject = `${actionLabel}: ${title}`;
  const greeting = buildGreeting(recipientName);
  const actionMessage = buildActionMessage(actorName, actionLabel);
  const footerLines = buildEmailFooter();
  const details = buildScheduleDetailItems(schedule);
  const safeGreeting = escapeHtml(greeting);
  const safeActionMessage = escapeHtml(actionMessage);

  return {
    subject,
    text: [
      greeting,
      '',
      actionMessage,
      '',
      ...details.map(({ label, value }) => `${label}: ${value}`),
      '',
      ...footerLines,
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
        <p>${safeGreeting}</p>
        <p>${safeActionMessage}</p>
        <div style="border: 1px solid #cbd5e1; border-radius: 14px; padding: 16px; background: #f8fafc;">
          ${details
            .map(
              ({ label, value }, index) =>
                `<p style="margin: 0 0 ${index === details.length - 1 ? '0' : '8px'};"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`
            )
            .join('')}
        </div>
        <div style="margin-top: 16px;">
          ${footerLines
            .map((line, index) => {
              if (!line) {
                return '<div style="height: 12px;"></div>';
              }

              const isBoldLine = line === 'Iyaman Unay!' || line === '-ISA II';

              return `<p style="margin: 0 0 ${index === footerLines.length - 1 ? '0' : '6px'};${isBoldLine ? ' font-weight: 700;' : ''}">${escapeHtml(line)}</p>`;
            })
            .join('')}
        </div>
      </div>
    `,
  };
}

export async function sendScheduleAssignmentNotifications({
  schedule,
  actorName,
  actorEmail,
  action = 'created',
  onProgress,
}) {
  const { configured } = getEmailConfigurationStatus();

  if (!configured) {
    return {
      status: 'disabled',
      sentCount: 0,
      recipientCount: 0,
      failures: [],
    };
  }

  if (!shouldSendNotificationForSchedule(schedule)) {
    return {
      status: 'skipped_past_schedule',
      sentCount: 0,
      recipientCount: 0,
      failures: [],
    };
  }

  const recipients = await resolveRecipientDirectory(schedule?.assignedTo);

  if (!recipients.length) {
    return {
      status: 'no_recipients',
      sentCount: 0,
      recipientCount: 0,
      failures: [],
    };
  }

  const actionLabel = action === 'updated' ? 'Updated the schedule' : 'Created a new schedule';
  const results = [];
  let processedCount = 0;

  for (const recipient of recipients) {
    const emailContent = buildScheduleEmailContent({
      schedule,
      actorName,
      actionLabel,
      recipientName: recipient.name,
    });

    try {
      const result = await sendEmail({
        to: recipient.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        replyTo: actorEmail,
      });
      // Add a small delay to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 500));
      results.push({ status: 'fulfilled', value: result });
    } catch (error) {
      results.push({ status: 'rejected', reason: error });
    }

    processedCount++;
    if (onProgress) {
      onProgress(processedCount, recipients.length);
    }
  }

  const sentCount = results.filter(
    (result) => result.status === 'fulfilled' && result.value?.ok
  ).length;
  const failures = results
    .map((result, index) => {
      if (result.status === 'fulfilled' && result.value?.ok) {
        return null;
      }

      return {
        email: recipients[index]?.email ?? '',
        name: recipients[index]?.name ?? '',
        reason:
          result.status === 'rejected'
            ? result.reason?.message || 'Unknown email delivery failure.'
            : 'Email delivery failed.',
      };
    })
    .filter(Boolean);

  if (failures.length) {
    console.error('Schedule notification delivery failures:', failures);
  }

  return {
    status: sentCount === recipients.length ? 'sent' : 'partial_failure',
    sentCount,
    recipientCount: recipients.length,
    failures,
  };
}

export function appendNotificationSummary(baseMessage, notificationResults) {
  const results = Array.isArray(notificationResults)
    ? notificationResults
    : [notificationResults];

  const sentCount = results.reduce(
    (total, result) => total + Number(result?.sentCount || 0),
    0
  );
  const recipientCount = results.reduce(
    (total, result) => total + Number(result?.recipientCount || 0),
    0
  );
  const hasDisabled = results.some((result) => result?.status === 'disabled');
  const hasPartialFailure = results.some(
    (result) => result?.status === 'partial_failure'
  );

  if (sentCount > 0 && sentCount === recipientCount) {
    return `${baseMessage} Email notifications sent to ${sentCount} assigned ${sentCount === 1 ? 'person' : 'people'}.`;
  }

  if (sentCount > 0) {
    return `${baseMessage} Email notifications were sent to ${sentCount} of ${recipientCount} assigned people.`;
  }

  if (hasPartialFailure) {
    return `${baseMessage} The schedule was saved, but email notifications could not be delivered to everyone.`;
  }

  if (hasDisabled) {
    return `${baseMessage} Email notifications are not configured yet.`;
  }

  return baseMessage;
}

export function collectNotificationFailures(notificationResults) {
  const results = Array.isArray(notificationResults)
    ? notificationResults
    : [notificationResults];

  return results.flatMap((result) =>
    Array.isArray(result?.failures) ? result.failures : []
  );
}
