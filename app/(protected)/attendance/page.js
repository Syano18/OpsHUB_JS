export default function AttendancePage() {
  return (
    <section
      style={{
        width: '100%',
        maxWidth: '920px',
        padding: '32px',
        border: '1px solid var(--color-border)',
        borderRadius: '28px',
        background: 'var(--color-surface)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.12)',
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
        Module
      </p>
      <h1
        style={{
          margin: '12px 0 10px',
          color: 'var(--color-text)',
          fontSize: '36px',
          lineHeight: 1.1,
        }}
      >
        Attendance Monitoring
      </h1>
      <p
        style={{
          margin: 0,
          maxWidth: '60ch',
          color: 'var(--color-text-muted)',
          fontSize: '16px',
          lineHeight: 1.7,
        }}
      >
        This area is prepared for attendance tracking, daily monitoring, and
        status updates for your workforce.
      </p>
    </section>
  );
}
