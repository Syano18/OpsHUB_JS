import { verifySession } from '@/lib/auth-session';
import { getUserPermissionByEmail } from '@/lib/user-permissions';
import PersonalEventsCalendar from './personal-events-calendar';

export default async function PersonalEventsPage() {
  const session = await verifySession();
  const userObj = session?.email ? await getUserPermissionByEmail(session.email) : null;

  return (
    <PersonalEventsCalendar
      displayName={userObj?.name || session?.name || session?.email || 'User'}
    />
  );
}
