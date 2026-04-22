import { verifySession } from '@/lib/auth-session';
import { getLeaveMonitoringData } from '@/lib/leaves';
import LeaveMonitoringClient from './leave-monitoring-client';

export const dynamic = 'force-dynamic';

export default async function LeaveMonitoringPage() {
  const session = await verifySession();
  const currentYear = new Date().getFullYear();
  let leaveSummaries = [];

  if (session?.email) {
    try {
      const liveLeaveData = await getLeaveMonitoringData(session.email, currentYear);
      leaveSummaries = liveLeaveData;
    } catch (error) {
      console.error('Failed to load leave monitoring data.', error);
    }
  }

  return <LeaveMonitoringClient initialLeaveSummaries={leaveSummaries} />;
}
