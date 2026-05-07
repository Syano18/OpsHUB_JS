import { getUpcomingSchedules } from '@/lib/schedules';
import { getRegisteredUserDisplayNames } from '@/lib/user-permissions';
import SchedulesClient from './schedules-client';

export const dynamic = 'force-dynamic';

export default async function EventPage() {
  const [schedules, activeUserNames] = await Promise.all([
    getUpcomingSchedules(),
    getRegisteredUserDisplayNames(),
  ]);

  return (
    <SchedulesClient
      initialSchedules={schedules}
      activeUserNames={activeUserNames}
    />
  );
}
