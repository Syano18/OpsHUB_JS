import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth-session';
import { getUserPermissionByEmail } from '@/lib/user-permissions';
import ProtectedShell from './protected-shell';

export default async function ProtectedLayout({ children }) {
  const session = await verifySession();

  if (!session) {
    redirect('/login');
  }

  const userPermission = await getUserPermissionByEmail(session.email);

  if (!userPermission) {
    redirect('/login');
  }

  const user = {
    email: userPermission.email ?? session.email ?? null,
    name: userPermission.name ?? session.name ?? null,
    position: userPermission.position ?? null,
    role: userPermission.role ?? null,
    status: userPermission.status ?? null,
  };

  return <ProtectedShell user={user}>{children}</ProtectedShell>;
}
