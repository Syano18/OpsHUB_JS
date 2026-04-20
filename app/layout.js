import './globals.css';

export const metadata = {
  title: 'Kalinga OpsHUB',
  description: 'Operations platform for logbook, attendance, notifications, and monitoring',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
