'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FiBell, FiCheck, FiX } from 'react-icons/fi';
import ToastStack from '@/components/shared/toast-stack';
import styles from './notifications-bell.module.css';

const LEAVE_APPROVER_ROLES = new Set(['admin', 'super_admin']);

function normalizeRole(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isLeaveApprover(role) {
  return LEAVE_APPROVER_ROLES.has(normalizeRole(role));
}

function formatNotificationTimestamp(value) {
  if (!value) {
    return '';
  }

  const normalizedValue = String(value).replace(' ', 'T');
  const parsedDate = new Date(normalizedValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsedDate);
}

function formatLeaveTypeLabel(value) {
  const normalizedValue = String(value ?? '').trim();

  if (!normalizedValue) {
    return 'Leave';
  }

  return normalizedValue
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatLeaveRange(firstDate, lastDate) {
  if (!firstDate && !lastDate) {
    return 'Dates unavailable';
  }

  const formatDate = (value) => {
    const parsedDate = new Date(`${value}T00:00:00`);

    if (Number.isNaN(parsedDate.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(parsedDate);
  };

  if (firstDate && lastDate && firstDate !== lastDate) {
    return `${formatDate(firstDate)} to ${formatDate(lastDate)}`;
  }

  return formatDate(firstDate || lastDate);
}

export default function NotificationsBell({ currentUser }) {
  const router = useRouter();
  const notificationRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [pendingLeaveRequests, setPendingLeaveRequests] = useState([]);
  const [activeLeaveActionId, setActiveLeaveActionId] = useState('');
  const [toasts, setToasts] = useState([]);
  const canApproveLeaveRequests = isLeaveApprover(currentUser?.role);
  const unreadNotificationCount = notifications.filter((notification) => !notification.isRead).length;
  const pendingLeaveRequestsByGroupId = useMemo(
    () =>
      new Map(
        pendingLeaveRequests
          .map((request) => [String(request?.requestGroupId ?? '').trim(), request])
          .filter(([requestGroupId]) => requestGroupId)
      ),
    [pendingLeaveRequests]
  );

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!notificationRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isOpen]);

  useEffect(() => {
    let isActive = true;

    const loadNotificationData = async () => {
      if (!currentUser?.email) {
        return;
      }

      try {
        setIsLoading(true);

        const [notificationsResponse, pendingResponse] = await Promise.all([
          fetch('/api/notifications?limit=20', { cache: 'no-store' }),
          canApproveLeaveRequests
            ? fetch('/api/leaves/pending', { cache: 'no-store' })
            : Promise.resolve(null),
        ]);

        if (!isActive) {
          return;
        }

        const notificationsPayload = notificationsResponse?.ok
          ? await notificationsResponse.json()
          : { notifications: [] };
        const pendingPayload =
          pendingResponse && pendingResponse.ok
            ? await pendingResponse.json()
            : { requests: [] };

        setNotifications(
          Array.isArray(notificationsPayload?.notifications)
            ? notificationsPayload.notifications
            : []
        );
        setPendingLeaveRequests(
          Array.isArray(pendingPayload?.requests) ? pendingPayload.requests : []
        );
      } catch {
        if (isActive) {
          setNotifications([]);
          setPendingLeaveRequests([]);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadNotificationData();
    const intervalId = setInterval(loadNotificationData, 30000);

    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [canApproveLeaveRequests, currentUser?.email]);

  const dismissToast = (toastId) => {
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
      { id: toastId, type, message, duration },
    ]);
  };

  const reloadNotificationData = async () => {
    try {
      const [notificationsResponse, pendingResponse] = await Promise.all([
        fetch('/api/notifications?limit=20', { cache: 'no-store' }),
        canApproveLeaveRequests
          ? fetch('/api/leaves/pending', { cache: 'no-store' })
          : Promise.resolve(null),
      ]);

      const notificationsPayload = notificationsResponse?.ok
        ? await notificationsResponse.json()
        : { notifications: [] };
      const pendingPayload =
        pendingResponse && pendingResponse.ok
          ? await pendingResponse.json()
          : { requests: [] };

      setNotifications(
        Array.isArray(notificationsPayload?.notifications)
          ? notificationsPayload.notifications
          : []
      );
      setPendingLeaveRequests(
        Array.isArray(pendingPayload?.requests) ? pendingPayload.requests : []
      );
    } catch {
      // Keep current bell state if refresh fails.
    }
  };

  const markNotificationRead = async (notificationId) => {
    if (!notificationId) {
      return;
    }

    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: notificationId }),
      });

      setNotifications((currentNotifications) =>
        currentNotifications.map((notification) =>
          notification.id === notificationId
            ? { ...notification, isRead: true }
            : notification
        )
      );
    } catch {
      // Ignore read failures for now.
    }
  };

  const handleLeaveDecision = async (groupId, decision, notificationId) => {
    if (!groupId) {
      return;
    }

    setActiveLeaveActionId(groupId);

    try {
      const response = await fetch(`/api/leaves/${encodeURIComponent(groupId)}/${decision}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to update the leave request right now.');
      }

      if (notificationId) {
        await markNotificationRead(notificationId);
      }

      await reloadNotificationData();
      router.refresh();
      showToast('success', payload?.message || `Leave request ${decision} successfully.`);
    } catch (error) {
      showToast('error', error.message || 'Unable to update the leave request right now.');
    } finally {
      setActiveLeaveActionId('');
    }
  };

  return (
    <div className={styles.notificationShell} ref={notificationRef}>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <button
        type="button"
        className={styles.triggerButton}
        onClick={() => setIsOpen((current) => !current)}
        aria-label="Open notifications"
        title="Open notifications"
      >
        <FiBell />
        {unreadNotificationCount ? (
          <span className={styles.notificationBadge}>
            {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className={styles.notificationPanel}>
          <div className={styles.notificationHeader}>
            <div>
              <p className={styles.notificationEyebrow}>Notifications</p>
              <h3 className={styles.notificationTitle}>Leave Updates</h3>
            </div>
          </div>

          <div className={styles.notificationList}>
            {isLoading ? (
              <p className={styles.notificationEmpty}>Loading notifications...</p>
            ) : notifications.length ? (
              notifications.map((notification) => {
                const relatedRequest = pendingLeaveRequestsByGroupId.get(
                  String(notification.relatedEntityId ?? '').trim()
                );
                const showApprovalActions =
                  canApproveLeaveRequests &&
                  notification.type === 'leave_request' &&
                  relatedRequest;

                return (
                  <article
                    key={notification.id ?? `${notification.relatedEntityId}-${notification.createdAt}`}
                    className={styles.notificationCard}
                    data-unread={notification.isRead ? 'false' : 'true'}
                  >
                    <div className={styles.notificationCardHeader}>
                      <div>
                        <p className={styles.notificationCardTitle}>{notification.title}</p>
                        <p className={styles.notificationCardTime}>
                          {formatNotificationTimestamp(notification.createdAt)}
                        </p>
                      </div>
                      {!notification.isRead ? (
                        <button
                          type="button"
                          className={styles.notificationLink}
                          onClick={() => markNotificationRead(notification.id)}
                        >
                          Mark read
                        </button>
                      ) : null}
                    </div>

                    <p className={styles.notificationMessage}>{notification.message}</p>

                    {showApprovalActions ? (
                      <div className={styles.leaveApprovalCard}>
                        <p className={styles.leaveApprovalMeta}>
                          {relatedRequest.employeeName || relatedRequest.employeeEmail}
                        </p>
                        <p className={styles.leaveApprovalDetails}>
                          {formatLeaveTypeLabel(relatedRequest.leaveType)} ·{' '}
                          {formatLeaveRange(relatedRequest.firstDate, relatedRequest.lastDate)} ·{' '}
                          {relatedRequest.requestedDays}
                        </p>

                        <div className={styles.leaveApprovalActions}>
                          <button
                            type="button"
                            className={styles.approveButton}
                            onClick={() =>
                              handleLeaveDecision(
                                relatedRequest.requestGroupId,
                                'approve',
                                notification.id
                              )
                            }
                            disabled={activeLeaveActionId === relatedRequest.requestGroupId}
                          >
                            <FiCheck />
                            <span>
                              {activeLeaveActionId === relatedRequest.requestGroupId
                                ? 'Working...'
                                : 'Approve'}
                            </span>
                          </button>
                          <button
                            type="button"
                            className={styles.rejectButton}
                            onClick={() =>
                              handleLeaveDecision(
                                relatedRequest.requestGroupId,
                                'reject',
                                notification.id
                              )
                            }
                            disabled={activeLeaveActionId === relatedRequest.requestGroupId}
                          >
                            <FiX />
                            <span>Reject</span>
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })
            ) : (
              <p className={styles.notificationEmpty}>No notifications yet.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
