import './globals.css';
import ThemeProvider from './theme-provider';

export const metadata = {
  title: 'Kalinga OpsHUB',
  description: 'Operations platform for logbook, attendance, notifications, and monitoring',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
