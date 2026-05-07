'use client';

import { useCallback, useState, useEffect } from 'react';
import { FiChevronLeft, FiChevronRight, FiX } from 'react-icons/fi';
import ToastStack from '@/components/shared/toast-stack';
import styles from './personal-events.module.css';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getCalendarDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const startDate = new Date(firstDayOfMonth);
  startDate.setDate(firstDayOfMonth.getDate() - firstDayOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    return {
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      label: date.getDate(),
      isCurrentMonth: date.getMonth() === month,
      isoDate: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate()
      ).padStart(2, '0')}`,
    };
  });
}

function getTodayIsoDate() {
  const today = new Date();

  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;
}

function extractDateNumber(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return 0;
  const datePart = dateStr.split('T')[0].split(' ')[0];
  const parts = datePart.split('-');
  if (parts.length !== 3) return 0;
  return parseInt(parts[0], 10) * 10000 + parseInt(parts[1], 10) * 100 + parseInt(parts[2], 10);
}

function isDateWithinEvent(dateValue, eventItem) {
  const targetNum = extractDateNumber(dateValue);
  const startNum = extractDateNumber(eventItem?.date);
  const endNum = extractDateNumber(eventItem?.end_date || eventItem?.date);

  if (!targetNum || !startNum || !endNum) {
    return false;
  }

  return targetNum >= startNum && targetNum <= endNum;
}

function formatEventDateRange(eventItem) {
  if (!eventItem?.date) {
    return '';
  }

  if (!eventItem.end_date || eventItem.end_date === eventItem.date) {
    return eventItem.date;
  }

  return `${eventItem.date} to ${eventItem.end_date}`;
}

export default function PersonalEventsCalendar() {
  const [activeMonth, setActiveMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [eventsData, setEventsData] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [newEventText, setNewEventText] = useState('');
  const [newEventStartDate, setNewEventStartDate] = useState('');
  const [newEventEndDate, setNewEventEndDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((type, message, duration = 4200) => {
    const toastId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    setToasts((currentToasts) => [
      ...currentToasts,
      { id: toastId, message, type, duration },
    ]);
  }, []);

  const dismissToast = useCallback((toastId) => {
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== toastId));
  }, []);

  useEffect(() => {
    fetch('/api/personal')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setEventsData(data);
        }
      })
      .catch(console.error);
  }, []);

  const handleAddEvent = async (e) => {
    if (e) e.preventDefault();
    const activeStartDate = newEventStartDate || selectedDate.isoDate;
    if (!newEventText.trim() || !activeStartDate) return;

    setIsSubmitting(true);
    try {
      if (editingEventId) {
        const payload = { id: editingEventId, date: activeStartDate, endDate: newEventEndDate || activeStartDate, events: newEventText };
        const res = await fetch('/api/personal', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          setEventsData(eventsData.map(e => e.id === editingEventId ? { ...e, date: activeStartDate, end_date: newEventEndDate || activeStartDate, events: newEventText } : e));
          setNewEventText('');
          setNewEventEndDate('');
          setNewEventStartDate('');
          setEditingEventId(null);
          setIsFormModalOpen(false);
          showToast('success', 'Event updated successfully.');
        } else {
          showToast('error', 'Unable to update event right now.');
        }
      } else {
        const payload = { date: activeStartDate, endDate: newEventEndDate || activeStartDate, events: newEventText };
        const res = await fetch('/api/personal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          // Refresh list to get real IDs, or just append placeholder id for now
          // We'll fully refresh to get the precise ID from db to support immediate editing again
          const getRes = await fetch('/api/personal');
          const data = await getRes.json();
          setEventsData(data);
          setNewEventText('');
          setNewEventEndDate('');
          setNewEventStartDate('');
          setIsFormModalOpen(false);
        }
      }
    } catch (err) {
      console.error(err);
      if (editingEventId) {
        showToast('error', 'Unable to update event right now.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEvent = (eventItem) => {
    if (!eventItem?.id || deletingEventId || eventItem?.is_schedule_event) return;
    setDeleteCandidate(eventItem);
  };

  const handleEditEvent = (eventItem) => {
    if (!eventItem?.id || eventItem?.is_schedule_event) return;

    setEditingEventId(eventItem.id);
    setNewEventText(eventItem.events);
    setNewEventStartDate(eventItem.date);
    setNewEventEndDate(eventItem.end_date === eventItem.date ? '' : eventItem.end_date);
    setIsFormModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteCandidate?.id || deletingEventId) return;

    const eventId = deleteCandidate.id;
    setDeletingEventId(eventId);
    try {
      const res = await fetch('/api/personal', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: eventId }),
      });

      if (res.ok) {
        setEventsData((currentEvents) => currentEvents.filter((eventItem) => eventItem.id !== eventId));
        if (editingEventId === eventId) {
          setEditingEventId(null);
          setIsFormModalOpen(false);
          setNewEventText('');
          setNewEventStartDate('');
          setNewEventEndDate('');
        }
        setDeleteCandidate(null);
        showToast('success', 'Event deleted successfully.');
      } else {
        showToast('error', 'Unable to delete event right now.');
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Unable to delete event right now.');
    } finally {
      setDeletingEventId(null);
    }
  };

  const calendarDays = getCalendarDays(activeMonth);
  const todayIsoDate = getTodayIsoDate();
  const activeMonthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(activeMonth);

  const moveMonth = (offset) => {
    setActiveMonth((currentMonth) => {
      const nextMonth = new Date(currentMonth);
      nextMonth.setMonth(currentMonth.getMonth() + offset, 1);
      return nextMonth;
    });
  };

  const jumpToCurrentMonth = () => {
    const now = new Date();
    setActiveMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  return (
    <section className={styles.page}>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className={styles.calendarShell}>
        <div className={styles.header}>
          <div className={styles.headingBlock}>
            <h1 className={styles.title}>Personal Events</h1>
          </div>

          <div className={styles.controls}>
            <input 
              type="month" 
              className={styles.monthPicker} 
              aria-label="Jump to month"
              value={`${activeMonth.getFullYear()}-${String(activeMonth.getMonth() + 1).padStart(2, '0')}`}
              onChange={(e) => {
                if (e.target.value) {
                  const [year, month] = e.target.value.split('-');
                  setActiveMonth(new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1));
                }
              }}
            />
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => moveMonth(-1)}
              aria-label="Show previous month"
            >
              <FiChevronLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.todayButton}
              onClick={jumpToCurrentMonth}
            >
              Today
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => moveMonth(1)}
              aria-label="Show next month"
            >
              <FiChevronRight aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className={styles.monthBar}>
          <h2 className={styles.monthTitle}>{activeMonthLabel}</h2>
        </div>

        <div className={styles.weekdays} aria-hidden="true">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className={styles.weekday}>
              {label}
            </span>
          ))}
        </div>

        <div className={styles.calendarGrid} role="grid" aria-label={activeMonthLabel}>
          {calendarDays.map((day) => {
            const isToday = day.isoDate === todayIsoDate;
            const dayEvents = eventsData.filter((eventItem) => isDateWithinEvent(day.isoDate, eventItem));

            return (
              <article
                key={day.key}
                className={`${styles.dayCell} ${
                  day.isCurrentMonth ? styles.dayCellCurrent : styles.dayCellMuted
                } ${isToday ? styles.dayCellToday : ''} ${styles.clickableCell}`}
                role="gridcell"
                aria-selected={isToday}
                onClick={() => setSelectedDate(day)}
              >
                {dayEvents.length > 0 && (
                  <span className={styles.eventCountBadge}>
                    {dayEvents.length}
                  </span>
                )}

                <div className={styles.dayNumberRow}>
                  <span className={styles.dayNumber}>{day.label}</span>
                  {isToday ? <span className={styles.todayBadge}>Today</span> : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <div className={styles.modalBackdrop} onClick={() => { setSelectedDate(null); setDeleteCandidate(null); }}>
          <div className={styles.modalSurface} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Events for {selectedDate.isoDate}</h3>
              <button type="button" className={styles.ghostButton} onClick={() => { setSelectedDate(null); setNewEventText(''); setNewEventEndDate(''); setNewEventStartDate(''); setEditingEventId(null); setDeleteCandidate(null); }}>
                <FiX aria-label="Close" />
              </button>
            </div>
            
            <div className={styles.eventList}>
              {eventsData
                .filter((eventItem) => isDateWithinEvent(selectedDate.isoDate, eventItem))
                .map((e, idx) => (
                <div
                  key={`${e.id ?? e.date ?? 'event'}-${e.end_date ?? e.date ?? 'single'}-${idx}`}
                  className={styles.eventItem}
                >
                  <div className={styles.eventTextWrapper}>
                    <span>{e.events}</span>
                    <div className={styles.eventActions}>
                      {(!e.is_schedule_event && !e.events?.endsWith(' (Approved)')) ? (
                        <button
                          type="button"
                          className={styles.editButtonSmall}
                          onClick={() => handleEditEvent(e)}
                        >
                          Edit
                        </button>
                      ) : null}
                      {(!e.is_schedule_event && !e.events?.endsWith(' (Approved)')) ? (
                        <button
                          type="button"
                          className={styles.deleteButtonSmall}
                          onClick={() => handleDeleteEvent(e)}
                          disabled={deletingEventId === e.id}
                        >
                          {deletingEventId === e.id ? 'Deleting...' : 'Delete'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {e.end_date && e.end_date !== e.date && (
                    <div className={styles.eventDateRange}>{formatEventDateRange(e)}</div>
                  )}
                </div>
              ))}
              {eventsData.filter((eventItem) => isDateWithinEvent(selectedDate.isoDate, eventItem)).length === 0 && (
                <p className={styles.noEvents}>No events on this date.</p>
              )}
            </div>

            <button 
              type="button" 
              className={styles.todayButton} 
              style={{ width: '100%', marginTop: '16px', height: '46px' }}
              onClick={() => {
                setEditingEventId(null);
                setNewEventText('');
                setNewEventEndDate('');
                setNewEventStartDate(selectedDate.isoDate);
                setIsFormModalOpen(true);
              }}
            >
              + Add New Event
            </button>
          </div>
        </div>
      )}

      {isFormModalOpen && selectedDate && (
        <div className={styles.modalBackdrop} style={{ zIndex: 60 }} onClick={() => setIsFormModalOpen(false)}>
          <div className={styles.modalSurface} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>{editingEventId ? 'Edit Event' : 'Add New Event'}</h3>
              <button type="button" className={styles.ghostButton} onClick={() => setIsFormModalOpen(false)}>
                <FiX aria-label="Close" />
              </button>
            </div>

            <form onSubmit={handleAddEvent} className={styles.addEventForm}>
              <div className={styles.formRow}>
                <input 
                  type="text" 
                  value={newEventText} 
                  onChange={(e) => setNewEventText(e.target.value)} 
                  placeholder="Event Name..." 
                  className={styles.eventInput}
                  disabled={isSubmitting}
                  autoFocus
                />
              </div>
              {editingEventId && (
                <div className={styles.formRow}>
                  <span className={styles.inputLabel}>Start Date:</span>
                  <input 
                    type="date" 
                    value={newEventStartDate || selectedDate.isoDate} 
                    onChange={(e) => setNewEventStartDate(e.target.value)} 
                    className={styles.dateInput}
                    disabled={isSubmitting}
                  />
                </div>
              )}
              <div className={styles.formRow}>
                <span className={styles.inputLabel}>End Date (Optional):</span>
                <input 
                  type="date" 
                  value={newEventEndDate} 
                  onChange={(e) => setNewEventEndDate(e.target.value)} 
                  className={styles.dateInput}
                  disabled={isSubmitting}
                  min={newEventStartDate || selectedDate.isoDate}
                />
              </div>
              <div className={styles.formRow} style={{ marginTop: '12px' }}>
                <button type="submit" className={styles.todayButton} style={{ flex: 1 }} disabled={isSubmitting || !newEventText.trim()}>
                  {editingEventId ? 'Save Changes' : 'Create Event'}
                </button>
                <button 
                  type="button" 
                  className={styles.ghostButton} 
                  onClick={() => setIsFormModalOpen(false)}
                  style={{ minWidth: '46px', minHeight: '46px' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteCandidate && (
        <div
          className={styles.modalBackdrop}
          style={{ zIndex: 70 }}
          onClick={() => {
            if (!deletingEventId) {
              setDeleteCandidate(null);
            }
          }}
        >
          <div className={styles.confirmModalSurface} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Confirm Delete</h3>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => setDeleteCandidate(null)}
                disabled={Boolean(deletingEventId)}
              >
                <FiX aria-label="Close" />
              </button>
            </div>

            <p className={styles.confirmDeleteText}>
              Delete event "{deleteCandidate.events}"? This action cannot be undone.
            </p>

            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => setDeleteCandidate(null)}
                disabled={Boolean(deletingEventId)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmDeleteButton}
                onClick={handleConfirmDelete}
                disabled={Boolean(deletingEventId)}
              >
                {deletingEventId === deleteCandidate.id ? 'Deleting...' : 'Delete Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
