import { verifySession } from '@/lib/auth-session';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  const session = await verifySession();

  redirect(session ? '/event' : '/login');
}
