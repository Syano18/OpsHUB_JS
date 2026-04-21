# Kalinga OpsHub

Kalinga OpsHub is an internal operations system for:

- Schedule management
- Digital logbook records
- Attendance monitoring
- Personal events calendar

It uses Next.js (App Router), Firebase Authentication, and Turso (LibSQL) for data storage.

## 1. Prerequisites

- Node.js 20+ (LTS recommended)
- npm
- A Turso database
- A Firebase project (Web + Admin credentials)

## 2. Install and Run

Install dependencies:

```bash
npm install
```

Run in development:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## 3. Environment Variables

Create a `.env.local` file in the project root.

### Required for app startup

```bash
# Turso
TURSO_DATABASE_URL=libsql://your-database-url
TURSO_AUTH_TOKEN=your_turso_auth_token

# Firebase Admin (server-side session verification)
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Firebase Web (client-side auth)
NEXT_PUBLIC_FIREBASE_API_KEY=your_web_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### Optional

```bash
# Session cookie name (default: kalinga_opshub_session)
SESSION_COOKIE_NAME=kalinga_opshub_session

# SMTP for schedule email notifications
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@domain.com
SMTP_PASS=your_email_password_or_app_password
SCHEDULE_NOTIFICATION_FROM=Kalinga Ops Hub <your_email@domain.com>
SCHEDULE_NOTIFICATION_REPLY_TO=optional_reply_to@yourdomain.com
```

Notes:

- If SMTP values are not provided, schedule operations still succeed; email notifications are skipped.
- `FIREBASE_PRIVATE_KEY` must preserve newlines (use `\n` if placed on one line).

## 4. Build and Start (Production-like)

Build:

```bash
npm run build
```

Start:

```bash
npm run start
```

Lint:

```bash
npm run lint
```

## 5. System Navigation Guide

After login, the protected shell exposes four core modules:

1. Schedules (`/event`)
2. Digital Logbook (`/logbook`)
3. Attendance Monitoring (`/attendance`)
4. Personal Events (`/personal-events`)

### 5.1 Schedules

Use this module to create, edit, delete, filter, export, and import schedules.

- Supports assignment to specific active users or `All employees`
- Validates date ranges (`endDate >= startDate`)
- Sends assignment email notifications when SMTP is configured
- Syncs created/updated schedules to each assignee's Personal Events calendar

### 5.2 Digital Logbook

Use this module to encode and manage communication records.

- Create record with particulars, addressee(s), transmitter, section, and mode(s)
- Search and export records
- Edit is restricted to the original encoder of the record
- Input values are validated against allowed options and active users

### 5.3 Attendance Monitoring

Use this module to review attendance and punch issues.

- Filter by month/date/employee (role-aware)
- Review attendance rows and punch errors
- Update remarks on attendance entries where permitted

### 5.4 Personal Events

Use this module for user-specific calendar entries.

- Create, update, delete personal events
- Schedule-backed events are recognized and protected from invalid direct deletion
- Supports start and end dates

## 6. Authentication and Access Behavior

- Login uses Firebase Auth (Google/web auth flow)
- API routes validate session cookies via Firebase Admin
- Most data APIs return `401` when no valid session is present
- Some operations require the user to be in the allowed/active users list

## 7. API Surface (High-level)

Core route groups:

- `/api/auth/*` for session and logout
- `/api/schedules/*` for schedule CRUD/import
- `/api/logbook/*` for logbook CRUD/options/export/backdated tools
- `/api/attendance/*` for attendance updates/notes
- `/api/personal` for personal events
- `/api/status/*` for connectivity/version checks

Tip: Use browser dev tools network tab while operating each module to inspect exact request/response payloads.

## 8. Database Migration Script

There is a one-off migration script in the root:

```bash
node run-migration.js
```

Current behavior:

- Adds `end_date` column to `personal`
- Safe to re-run (prints "Column already exists" if already migrated)

## 9. Windows Installer (Inno Setup)

The app is configured to build as a Next.js standalone output so it can be packaged into a Windows installer with Inno Setup.

To build the installer:

1. Install Node.js 20 or newer on the target machine if it is not already present.
2. Run `npm run build` from the project root.
3. Open [installer/kalinga-opshub.iss](installer/kalinga-opshub.iss) in Inno Setup Compiler.
4. Compile the script to generate the installer under `installer/Output`.

The installer copies the standalone server output, `public` assets, and traced static files into the installed app folder and launches the app through the local Node.js runtime.

## 10. Troubleshooting

### App fails on startup with Turso error

- Verify `TURSO_DATABASE_URL`
- Verify `TURSO_AUTH_TOKEN`

### Auth/session errors (`Unauthorized`)

- Verify Firebase Admin variables (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`)
- Ensure web Firebase `NEXT_PUBLIC_*` values match the same Firebase project

### Schedule emails not sent

- Confirm `SMTP_*` and `SCHEDULE_NOTIFICATION_FROM` values
- For Gmail, use an app password when required

## 11. Developer Notes

- Main stack: Next.js 16, React 19, Firebase, LibSQL/Turso, Nodemailer
- Source directories: `app`, `components`, `lib`, `styles`
- Tests directory exists at `tests` (add/update tests as new features are added)
