'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FcGoogle } from 'react-icons/fc';
import { FiEye, FiEyeOff, FiInfo, FiMoon, FiSun } from 'react-icons/fi';
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { auth, googleProvider, prepareAuth } from '@/lib/firebase-client';
import packageJson from '../../package.json';
import styles from './login.module.css';

export default function LoginPage() {
  const [isDark, setIsDark] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [toasts, setToasts] = useState([]);
  const aboutPopoverRef = useRef(null);
  const updatesTimeoutRef = useRef(null);
  const toastTimeoutsRef = useRef(new Map());
  const appVersion = `v${packageJson.version}`;
  const router = useRouter();

  useEffect(() => {
    if (!showAbout) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!aboutPopoverRef.current?.contains(event.target)) {
        setShowAbout(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowAbout(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showAbout]);

  useEffect(() => {
    const toastTimeouts = toastTimeoutsRef.current;

    return () => {
      if (updatesTimeoutRef.current) {
        clearTimeout(updatesTimeoutRef.current);
      }

      toastTimeouts.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      toastTimeouts.clear();
    };
  }, []);

  useEffect(() => {
    if (!showResetModal) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowResetModal(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showResetModal]);

  const toggleTheme = () => {
    const nextTheme = !isDark;
    setIsDark(nextTheme);

    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute(
        'data-theme',
        nextTheme ? 'dark' : 'light'
      );
    }
  };

  const createServerSession = async (idToken) => {
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ idToken }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        payload?.error || 'Unable to start a secure session right now.'
      );
    }
  };

  const getFirebaseErrorMessage = (error, fallbackMessage) => {
    switch (error?.code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Incorrect email or password.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/user-disabled':
        return 'This account has been disabled.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a moment and try again.';
      case 'auth/missing-email':
        return 'Please enter your email address first.';
      case 'auth/popup-closed-by-user':
        return 'Google sign-in was canceled before it finished.';
      default:
        return error?.message || fallbackMessage;
    }
  };

  const dismissToast = (toastId) => {
    const timeoutId = toastTimeoutsRef.current.get(toastId);

    if (timeoutId) {
      clearTimeout(timeoutId);
      toastTimeoutsRef.current.delete(toastId);
    }

    setToasts((currentToasts) =>
      currentToasts.filter((toast) => toast.id !== toastId)
    );
  };

  const showToast = (type, message, duration = 4200) => {
    const toastId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    setToasts((currentToasts) => [
      ...currentToasts,
      { id: toastId, message, type },
    ]);

    const timeoutId = setTimeout(() => {
      dismissToast(toastId);
    }, duration);

    toastTimeoutsRef.current.set(toastId, timeoutId);
  };

  const openResetModal = () => {
    setResetEmail(email);
    setShowResetModal(true);
  };

  const closeResetModal = () => {
    setShowResetModal(false);
  };

  const finishSignIn = async (firebaseUser) => {
    const idToken = await firebaseUser.getIdToken();
    await createServerSession(idToken);
    router.push('/event');
    router.refresh();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setIsEmailLoading(true);

    try {
      await prepareAuth();
      const credential = await signInWithEmailAndPassword(auth, email, password);
      await finishSignIn(credential.user);
    } catch (error) {
      console.error('Email/password sign in failed.', error);
      showToast(
        'error',
        getFirebaseErrorMessage(
          error,
          'Email/password sign-in failed. Please try again.'
        )
      );
    } finally {
      setIsEmailLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);

    try {
      await prepareAuth();
      const result = await signInWithPopup(auth, googleProvider);
      await finishSignIn(result.user);
    } catch (error) {
      console.error('Google sign in failed.', error);
      showToast(
        error?.code === 'auth/popup-closed-by-user' ? 'warning' : 'error',
        getFirebaseErrorMessage(
          error,
          'Google sign-in failed. Please try again.'
        )
      );
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleCheckUpdates = () => {
    if (updatesTimeoutRef.current) {
      clearTimeout(updatesTimeoutRef.current);
    }

    setIsCheckingUpdates(true);
    showToast('warning', 'Checking for updates...', 1600);

    updatesTimeoutRef.current = setTimeout(() => {
      setIsCheckingUpdates(false);
      showToast(
        'success',
        `You are using the latest installed version: ${appVersion}.`
      );
    }, 900);
  };

  const handlePasswordReset = async (event) => {
    event.preventDefault();

    setIsResetLoading(true);

    try {
      await prepareAuth();
      await sendPasswordResetEmail(auth, resetEmail.trim());
      showToast(
        'success',
        'If that email is registered, a password reset link has been sent.'
      );
      setShowResetModal(false);
    } catch (error) {
      console.error('Password reset failed.', error);
      showToast(
        'error',
        getFirebaseErrorMessage(
          error,
          'Unable to send a password reset email right now.'
        )
      );
    } finally {
      setIsResetLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      {toasts.length ? (
        <div className={styles.toastStack} aria-live="polite" aria-atomic="true">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`${styles.toast} ${
                toast.type === 'success'
                  ? styles.toastSuccess
                  : toast.type === 'warning'
                    ? styles.toastWarning
                    : styles.toastError
              }`}
              role="status"
            >
              <p className={styles.toastMessage}>{toast.message}</p>
              <button
                type="button"
                className={styles.toastClose}
                aria-label="Dismiss notification"
                onClick={() => dismissToast(toast.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className={styles.card}>
        <div className={styles.topActions}>
          <button
            type="button"
            className={styles.themeSwitch}
            aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
            aria-pressed={isDark}
            title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
            onClick={toggleTheme}
          >
            <span
              className={`${styles.themeTrackIcon} ${styles.themeTrackIconSun} ${
                !isDark ? styles.themeTrackIconHidden : ''
              }`}
              aria-hidden="true"
            >
              <FiSun className={`${styles.buttonIcon} ${styles.themeGlyphSun}`} />
            </span>
            <span
              className={`${styles.themeTrackIcon} ${styles.themeTrackIconMoon} ${
                isDark ? styles.themeTrackIconHidden : ''
              }`}
              aria-hidden="true"
            >
              <FiMoon className={`${styles.buttonIcon} ${styles.themeGlyphMoon}`} />
            </span>
            <span
              className={`${styles.themeThumb} ${isDark ? styles.themeThumbDark : ''}`}
              aria-hidden="true"
            >
              {isDark ? (
                <FiMoon
                  className={`${styles.themeThumbIcon} ${styles.themeGlyphMoon}`}
                />
              ) : (
                <FiSun
                  className={`${styles.themeThumbIcon} ${styles.themeGlyphSun}`}
                />
              )}
            </span>
          </button>

          <div className={styles.aboutPopover} ref={aboutPopoverRef}>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="About app"
              aria-expanded={showAbout}
              aria-controls="about-app-card"
              title="About"
              onClick={() => setShowAbout((prev) => !prev)}
            >
              <FiInfo className={styles.buttonIcon} aria-hidden="true" />
            </button>

            {showAbout ? (
              <div
                id="about-app-card"
                className={styles.aboutCard}
                role="dialog"
                aria-label="About this app"
              >
                <h4 className={styles.aboutTitle}>About This App</h4>
                <p className={styles.aboutText}>
                  The PSA Kalinga Hired Tracking System streamlines personnel
                  management for Contract of Service Workers (COSWs). It
                  centralizes monitoring, automates employment and training
                  certificates, and features a performance evaluation tool.
                  Supervisor ratings are used as a reference for future hiring,
                  ensuring a fair, transparent, and efficient system that
                  reduces paperwork and speeds up hiring for field surveys.
                </p>
                <hr className={styles.aboutDivider} />
                <div className={styles.aboutFooterRow}>
                  <p className={styles.aboutVersion}>App version: {appVersion}</p>
                  <button
                    type="button"
                    className={styles.updateButton}
                    onClick={handleCheckUpdates}
                    disabled={isCheckingUpdates}
                  >
                    {isCheckingUpdates ? 'Checking...' : 'Check for updates'}
                  </button>
                </div>
                <hr className={styles.aboutDivider} />
                <p className={styles.aboutMeta}>Developer: ISA II</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className={styles.brandBlock}>
          <div>
            <Image
              src="/icons/Logo.png"
              alt="Kalinga OpsHUB logo"
              width={90}
              height={90}
              className={styles.logoImage}
              priority
            />
          </div>
          <h1 className={styles.title}>Kalinga Operations HUB</h1>
          <p className={styles.subtitle}>Please sign in to continue</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.fieldGroup}>
            <div className={styles.floatingField}>
              <input
                id="email"
                name="email"
                type="email"
                placeholder=" "
                required
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
                className={styles.input}
              />
              <label htmlFor="email" className={styles.label}>
                Email Address
              </label>
            </div>

            <div className={styles.floatingField}>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder=" "
                required
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
                className={styles.input}
              />
              <label htmlFor="password" className={styles.label}>
                Password
              </label>

              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <FiEyeOff className={styles.buttonIcon} aria-hidden="true" />
                ) : (
                  <FiEye className={styles.buttonIcon} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <div className={styles.forgotRow}>
            <button
              type="button"
              className={styles.linkButton}
              onClick={openResetModal}
            >
              Forgot password?
            </button>
          </div>

          <button
            type="submit"
            className={styles.primaryButton}
            disabled={isEmailLoading || isGoogleLoading}
          >
            {isEmailLoading ? 'Signing in...' : 'Sign in'}
          </button>

          <div className={styles.divider}>
            <span>Or continue with</span>
          </div>

          <button
            type="button"
            className={styles.googleButton}
            onClick={handleGoogleLogin}
            disabled={isEmailLoading || isGoogleLoading}
          >
            <span className={styles.googleIcon} aria-hidden="true">
              <FcGoogle className={styles.googleBrandIcon} />
            </span>
            <span>
              {isGoogleLoading ? 'Signing in with Google...' : 'Sign in with Google'}
            </span>
          </button>
        </form>
      </div>

      {showResetModal ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeResetModal}
        >
          <div
            className={styles.resetModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-password-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="reset-password-title" className={styles.resetTitle}>
              Reset Password
            </h2>
            <p className={styles.resetText}>
              Enter your email address and we&apos;ll send you a reset link.
            </p>

            <form className={styles.resetForm} onSubmit={handlePasswordReset}>
              <label htmlFor="reset-email" className={styles.resetLabel}>
                Email Address
              </label>
              <input
                id="reset-email"
                name="reset-email"
                type="email"
                autoComplete="email"
                required
                value={resetEmail}
                onChange={(event) => {
                  setResetEmail(event.target.value);
                }}
                className={styles.resetInput}
              />

              <div className={styles.resetActions}>
                <button
                  type="button"
                  className={styles.resetSecondaryButton}
                  onClick={closeResetModal}
                  disabled={isResetLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.resetPrimaryButton}
                  disabled={isResetLoading}
                >
                  {isResetLoading ? 'Sending...' : 'Send reset link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
