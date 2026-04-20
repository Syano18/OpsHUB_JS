import { verifySession } from '@/lib/auth-session';
import { getUpcomingSchedules } from '@/lib/schedules';
import { getRegisteredUserDisplayNames } from '@/lib/user-permissions';
import SchedulesClient from './schedules-client';

export const dynamic = 'force-dynamic';

export default async function EventPage() {
  const [session, schedules, activeUserNames] = await Promise.all([
    verifySession(),
    getUpcomingSchedules(),
    getRegisteredUserDisplayNames(),
  ]);

  return (
    <SchedulesClient
      initialSchedules={schedules}
      activeUserNames={activeUserNames}
      currentUserEmail={session?.email ?? ''}
    />
  );
}
