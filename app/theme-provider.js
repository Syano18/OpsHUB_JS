'use client';

import { useEffect } from 'react';

export default function ThemeProvider({ children }) {
  useEffect(() => {
    // Restore theme from localStorage on mount
    if (typeof localStorage !== 'undefined') {
      const savedTheme = localStorage.getItem('theme-preference');
      if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
      }
    }
  }, []);

  // Also restore synchronously to prevent flash of wrong theme
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const savedTheme = localStorage.getItem('theme-preference');
    if (savedTheme && document.documentElement.getAttribute('data-theme') !== savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  }

  return <>{children}</>;
}
