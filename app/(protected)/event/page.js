import { verifySession } from '@/lib/auth-session';
import UnderConstructionLottie from './under-construction-lottie';

export default async function EventPage() {
  const session = await verifySession();
  const displayName = session?.name || session?.email || 'User';

  return (
    <section
      style={{
        flex: 1,
        width: '100%',
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        border: '1px solid var(--color-border)',
        borderRadius: '28px',
        background:
          'linear-gradient(180deg, rgba(20, 184, 166, 0.08), transparent 28%), var(--color-surface)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.12)',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          margin: 0,
          color: '#0f766e',
          fontSize: '14px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        Events
      </p>
      <h1
        style={{
          margin: '12px 0 10px',
          color: 'var(--color-text)',
          fontSize: '36px',
          lineHeight: 1.1,
        }}
      >
        Welcome, {displayName}
      </h1>
      <p
        style={{
          margin: 0,
          maxWidth: '58ch',
          color: 'var(--color-text-muted)',
          fontSize: '16px',
          lineHeight: 1.7,
        }}
      >
        This page is under construction.
      </p>

      <div
        style={{
          width: '100%',
          maxWidth: '1200px',
          marginTop: '36px',
          display: 'flex',
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            minHeight: 'min(720px, 100%)',
            padding: '36px',
            border: '1px solid var(--color-border)',
            borderRadius: '24px',
            background: 'rgba(255, 255, 255, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <UnderConstructionLottie />
        </div>
      </div>
    </section>
  );
}
