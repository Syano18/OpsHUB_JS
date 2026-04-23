'use client';

import { useEffect } from 'react';

export default function ThemeProvider({ children }) {
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      const savedTheme = localStorage.getItem('theme-preference');
      if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
      }
    }
  }, []);

  return <>{children}</>;
}
