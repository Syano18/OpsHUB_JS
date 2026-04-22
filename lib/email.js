import nodemailer from 'nodemailer';
import { ensureRuntimeEnv } from '@/lib/runtime-env';

ensureRuntimeEnv();

let cachedTransporter = null;
const DEFAULT_MAX_CONNECTIONS = 4;
const DEFAULT_MAX_MESSAGES = 100;

function normalizePort(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 587;
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isEmailConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SCHEDULE_NOTIFICATION_FROM
  );
}

function getTransporter() {
  if (!cachedTransporter) {
    const port = normalizePort(process.env.SMTP_PORT);
    const maxConnections = normalizePositiveInteger(
      process.env.SMTP_MAX_CONNECTIONS,
      DEFAULT_MAX_CONNECTIONS
    );
    const maxMessages = normalizePositiveInteger(
      process.env.SMTP_MAX_MESSAGES,
      DEFAULT_MAX_MESSAGES
    );

    cachedTransporter = nodemailer.createTransport({
      pool: true,
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      maxConnections,
      maxMessages,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  return cachedTransporter;
}

export async function sendEmail({ to, subject, html, text, replyTo }) {
  if (!isEmailConfigured()) {
    return {
      ok: false,
      skipped: true,
      reason: 'not_configured',
    };
  }

  const transporter = getTransporter();
  const info = await transporter.sendMail({
    from: process.env.SCHEDULE_NOTIFICATION_FROM,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    html,
    text,
    replyTo: replyTo || process.env.SCHEDULE_NOTIFICATION_REPLY_TO || undefined,
  });

  return {
    ok: true,
    id: info.messageId ?? null,
  };
}

export function getEmailConfigurationStatus() {
  return {
    configured: isEmailConfigured(),
  };
}
