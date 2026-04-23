import { tursoClient } from '@/lib/turso';

const MANILA_TIMESTAMP_SQL =
  "strftime('%Y-%m-%d %H:%M:%S', unixepoch('now') + 28800, 'unixepoch')";

let notificationsColumnsPromise = null;

function normalizeText(value) {
  return value ?? null;
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

async function getNotificationsColumnNames() {
  if (!notificationsColumnsPromise) {
    notificationsColumnsPromise = tursoClient
      .execute(`PRAGMA table_info(notifications)`)
      .then((result) =>
        result.rows
          .map((row) => String(row.name ?? '').trim().toLowerCase())
          .filter(Boolean)
      )
      .catch(() => []);
  }

  return notificationsColumnsPromise;
}

export async function hasNotificationsTable() {
  const columns = await getNotificationsColumnNames();
  return columns.length > 0;
}

export async function createNotifications(entries) {
  if (!(await hasNotificationsTable())) {
    return [];
  }

  const normalizedEntries = (entries ?? [])
    .map((entry) => ({
      recipientEmail: normalizeEmail(entry?.recipientEmail),
      actorEmail: normalizeEmail(entry?.actorEmail),
      actorName: String(entry?.actorName ?? '').trim() || null,
      type: String(entry?.type ?? '').trim() || 'general',
      title: String(entry?.title ?? '').trim() || 'Notification',
      message: String(entry?.message ?? '').trim() || '',
      relatedEntityType: String(entry?.relatedEntityType ?? '').trim() || null,
      relatedEntityId: String(entry?.relatedEntityId ?? '').trim() || null,
    }))
    .filter((entry) => entry.recipientEmail);

  if (!normalizedEntries.length) {
    return [];
  }

  const statements = normalizedEntries.map((entry) => ({
    sql: `
      INSERT INTO notifications (
        recipient_email,
        actor_email,
        actor_name,
        type,
        title,
        message,
        related_entity_type,
        related_entity_id,
        is_read,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ${MANILA_TIMESTAMP_SQL})
      RETURNING
        id,
        recipient_email,
        actor_email,
        actor_name,
        type,
        title,
        message,
        related_entity_type,
        related_entity_id,
        is_read,
        created_at
    `,
    args: [
      entry.recipientEmail,
      entry.actorEmail,
      entry.actorName,
      entry.type,
      entry.title,
      entry.message,
      entry.relatedEntityType,
      entry.relatedEntityId,
    ],
  }));

  const results = await tursoClient.batch(statements, 'write');

  return results.flatMap((result) => result.rows ?? []).map((row) => ({
    id: row.id ?? null,
    recipientEmail: normalizeText(row.recipient_email),
    actorEmail: normalizeText(row.actor_email),
    actorName: normalizeText(row.actor_name),
    type: normalizeText(row.type),
    title: normalizeText(row.title),
    message: normalizeText(row.message),
    relatedEntityType: normalizeText(row.related_entity_type),
    relatedEntityId: normalizeText(row.related_entity_id),
    isRead: Number(row.is_read ?? 0) === 1,
    createdAt: normalizeText(row.created_at),
  }));
}

export async function listNotificationsForUser(recipientEmail, limit = 50) {
  if (!(await hasNotificationsTable())) {
    return [];
  }

  const normalizedRecipientEmail = normalizeEmail(recipientEmail);
  const normalizedLimit = Math.max(1, Number.parseInt(String(limit ?? 50), 10) || 50);

  if (!normalizedRecipientEmail) {
    return [];
  }

  const result = await tursoClient.execute({
    sql: `
      SELECT
        id,
        recipient_email,
        actor_email,
        actor_name,
        type,
        title,
        message,
        related_entity_type,
        related_entity_id,
        is_read,
        created_at
      FROM notifications
      WHERE lower(recipient_email) = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `,
    args: [normalizedRecipientEmail, normalizedLimit],
  });

  return result.rows.map((row) => ({
    id: row.id ?? null,
    recipientEmail: normalizeText(row.recipient_email),
    actorEmail: normalizeText(row.actor_email),
    actorName: normalizeText(row.actor_name),
    type: normalizeText(row.type),
    title: normalizeText(row.title),
    message: normalizeText(row.message),
    relatedEntityType: normalizeText(row.related_entity_type),
    relatedEntityId: normalizeText(row.related_entity_id),
    isRead: Number(row.is_read ?? 0) === 1,
    createdAt: normalizeText(row.created_at),
  }));
}

export async function markNotificationRead(notificationId, recipientEmail) {
  if (!(await hasNotificationsTable())) {
    return false;
  }

  const normalizedRecipientEmail = normalizeEmail(recipientEmail);
  const normalizedNotificationId = Number.parseInt(String(notificationId ?? ''), 10);

  if (!normalizedRecipientEmail || Number.isNaN(normalizedNotificationId)) {
    return false;
  }

  await tursoClient.execute({
    sql: `
      UPDATE notifications
      SET
        is_read = 1
      WHERE id = ?
        AND lower(recipient_email) = ?
    `,
    args: [normalizedNotificationId, normalizedRecipientEmail],
  });

  return true;
}

export async function markNotificationsReadByEntity({
  relatedEntityId,
  type = null,
  relatedEntityType = null,
}) {
  if (!(await hasNotificationsTable())) {
    return 0;
  }

  const normalizedRelatedEntityId = String(relatedEntityId ?? '').trim();
  const normalizedType = String(type ?? '').trim();
  const normalizedRelatedEntityType = String(relatedEntityType ?? '').trim();

  if (!normalizedRelatedEntityId) {
    return 0;
  }

  const conditions = ['related_entity_id = ?'];
  const args = [normalizedRelatedEntityId];

  if (normalizedType) {
    conditions.push('type = ?');
    args.push(normalizedType);
  }

  if (normalizedRelatedEntityType) {
    conditions.push('related_entity_type = ?');
    args.push(normalizedRelatedEntityType);
  }

  await tursoClient.execute({
    sql: `
      UPDATE notifications
      SET
        is_read = 1
      WHERE ${conditions.join(' AND ')}
    `,
    args,
  });

  return 1;
}
