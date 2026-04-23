import { verifySession } from '@/lib/auth-session';
import { getLeaveMonitoringData } from '@/lib/leaves';
import { getUserPermissionByEmail } from '@/lib/user-permissions';
import LeaveMonitoringClient from './leave-monitoring-client';

export const dynamic = 'force-dynamic';

export default async function LeaveMonitoringPage() {
  const session = await verifySession();
  const currentYear = new Date().getFullYear();
  let leaveSummaries = [];
  let currentUser = null;

  if (session?.email) {
    try {
      const [liveLeaveData, liveUser] = await Promise.all([
        getLeaveMonitoringData(session.email, currentYear),
        getUserPermissionByEmail(session.email),
      ]);
      leaveSummaries = liveLeaveData;
      currentUser = liveUser;
    } catch (error) {
      console.error('Failed to load leave monitoring data.', error);
    }
  }

  return (
    <LeaveMonitoringClient
      initialLeaveSummaries={leaveSummaries}
      currentUser={
        currentUser ?? (session?.email ? { email: session.email, name: session.name ?? null } : null)
      }
    />
  );
}
