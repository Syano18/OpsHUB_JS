'use client';

import { useEffect } from 'react';
import styles from './toast-stack.module.css';

export default function ToastStack({ toasts, onDismiss }) {
  useEffect(() => {
    if (!toasts.length) {
      return undefined;
    }

    const timeouts = toasts.map((toast) =>
      setTimeout(() => {
        onDismiss(toast.id);
      }, toast.duration ?? 4200)
    );

    return () => {
      timeouts.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
    };
  }, [onDismiss, toasts]);

  if (!toasts.length) {
    return null;
  }

  return (
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
            onClick={() => onDismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}