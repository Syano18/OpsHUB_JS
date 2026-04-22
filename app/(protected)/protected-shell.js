'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  FiBookOpen,
  FiBriefcase,
  FiCalendar,
  FiClock,
  FiChevronLeft,
  FiChevronRight,
  FiClipboard,
  FiLogOut,
  FiMoon,
  FiSun,
} from 'react-icons/fi';
import { onIdTokenChanged, signOut } from 'firebase/auth';
import { auth, prepareAuth } from '@/lib/firebase-client';
import styles from './protected-shell.module.css';

const navLinks = [
  { name: 'Schedules', href: '/event', icon: FiCalendar },
  { name: 'Digital Logbook', href: '/logbook', icon: FiBookOpen },
  { name: 'Attendance Monitoring', href: '/attendance', icon: FiClipboard },
  { name: 'Leave Monitoring', href: '/leave-monitoring', icon: FiBriefcase },
  { name: 'Personal Events', href: '/personal-events', icon: FiClock },
];

function getUserInitials(name, email) {
  const normalizedName = String(name ?? '').trim();

  if (normalizedName) {
    const parts = normalizedName.split(/\s+/).filter(Boolean);

    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
  }

  const normalizedEmail = String(email ?? '').trim();

  if (normalizedEmail) {
    return normalizedEmail.slice(0, 2).toUpperCase();
  }

  return 'U';
}

export default function ProtectedShell({ children, user }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const userInitials = getUserInitials(user?.name, user?.email);

  useEffect(() => {
    // Load theme preference from localStorage first, then fallback to DOM attribute
    const savedTheme = typeof localStorage !== 'undefined' 
      ? localStorage.getItem('theme-preference')
      : null;
    const currentTheme = savedTheme || 
      document.documentElement.getAttribute('data-theme') || 
      'light';
    setIsDarkMode(currentTheme === 'dark');
    document.documentElement.setAttribute('data-theme', currentTheme);
  }, []);

  useEffect(() => {
    // Warm route data for faster transitions between protected pages.
    navLinks.forEach((link) => {
      router.prefetch(link.href);
    });
  }, [router]);

  useEffect(() => {
    let lastVersion = null;
    let isActive = true;

    const checkVersion = async () => {
      try {
        const res = await fetch('/api/status/version');
        if (!res.ok) return;
        const data = await res.json();
        
        if (!isActive) return;

        if (lastVersion === null) {
          lastVersion = data.version;
        } else if (lastVersion !== data.version && data.version !== 'error') {
          lastVersion = data.version;
          router.refresh();
        }
      } catch (err) {
        // Ignore network errors so we don't spam the console
      }
    };

    // Check version every 10 seconds
    const interval = setInterval(checkVersion, 10000);
    checkVersion();

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [router]);

  useEffect(() => {
    let isActive = true;
    let unsubscribe = () => {};

    const renewServerSession = async (firebaseUser) => {
      if (!firebaseUser) {
        return;
      }

      try {
        const idToken = await firebaseUser.getIdToken();
        await fetch('/api/auth/session/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ idToken }),
        });
      } catch (error) {
        console.error('Failed to renew auth session.', error);
      }
    };

    const startRenewal = async () => {
      try {
        await prepareAuth();

        if (!isActive) {
          return;
        }

        unsubscribe = onIdTokenChanged(auth, (firebaseUser) => {
          if (!isActive) {
            return;
          }

          renewServerSession(firebaseUser);
        });
      } catch (error) {
        console.error('Failed to initialize auth session renewal.', error);
      }
    };

    startRenewal();

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, []);

  const toggleTheme = () => {
    const nextDarkMode = !isDarkMode;
    const themeValue = nextDarkMode ? 'dark' : 'light';
    setIsDarkMode(nextDarkMode);
    document.documentElement.setAttribute('data-theme', themeValue);
    // Persist theme preference to localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('theme-preference', themeValue);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      });
      await signOut(auth).catch(() => {});
      router.replace('/login');
      router.refresh();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className={styles.shell}>
      <aside
        className={`${styles.sidebar} ${isCollapsed ? styles.sidebarCollapsed : ''}`}
      >
        <div className={styles.sidebarTop}>
          <div
            className={`${styles.brandRow} ${
              isCollapsed ? styles.brandRowCollapsed : styles.brandRowExpanded
            }`}
          >
            <div className={styles.brandBlock}>
              <div>
                <Image
                  src="/icons/Logo.png"
                  alt="Kalinga OpsHUB logo"
                  width={70}
                  height={70}
                  className={styles.logoImage}
                  priority
                />
              </div>
            </div>
          </div>

          <div className={styles.topButtons}>
            <button
              type="button"
              className={styles.circleButton}
              onClick={toggleTheme}
              aria-label={`Switch to ${isDarkMode ? 'light' : 'dark'} mode`}
              title={`Switch to ${isDarkMode ? 'light' : 'dark'} mode`}
            >
              {isDarkMode ? <FiSun /> : <FiMoon />}
            </button>
            <button
              type="button"
              className={styles.circleButton}
              onClick={() => setIsCollapsed((prev) => !prev)}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? <FiChevronRight /> : <FiChevronLeft />}
            </button>
          </div>
        </div>

        <div
          className={`${styles.profileCard} ${
            isCollapsed ? styles.profileCardCollapsed : ''
          }`}
        >
          <div className={styles.profileAvatar}>
            <span className={styles.profileInitials}>{userInitials}</span>
          </div>
          {!isCollapsed ? (
            <div className={styles.profileText}>
              <p className={styles.profileName}>
                {user?.name || 'Authenticated User'}
              </p>
              {user?.role ? (
                <p className={styles.profileRole}>{user.role}</p>
              ) : null}
              <p className={styles.profileEmail}>{user?.email || 'Signed in'}</p>
            </div>
          ) : null}
        </div>

        <nav className={styles.nav}>
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive =
              pathname === link.href || pathname.startsWith(`${link.href}/`);

            return (
              <Link
                key={link.href}
                href={link.href}
                prefetch
                className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                title={isCollapsed ? link.name : undefined}
              >
                <Icon className={styles.navIcon} />
                {!isCollapsed ? (
                  <span className={styles.navLabel}>{link.name}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          className={styles.logoutButton}
          onClick={handleLogout}
          disabled={isLoggingOut}
          title={isCollapsed ? 'Logout' : undefined}
        >
          <FiLogOut className={styles.navIcon} />
          {!isCollapsed ? (
            <span className={styles.navLabel}>
              {isLoggingOut ? 'Logging out...' : 'Logout'}
            </span>
          ) : null}
        </button>
      </aside>

      <div className={styles.contentArea}>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
