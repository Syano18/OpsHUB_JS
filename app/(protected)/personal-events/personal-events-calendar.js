'use client';

import { useState, useEffect } from 'react';
import { FiChevronLeft, FiChevronRight, FiX } from 'react-icons/fi';
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

export default function PersonalEventsCalendar({ displayName }) {
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
    } finally {
      setIsSubmitting(false);
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
            const startDayEvents = eventsData.filter(e => e.date === day.isoDate);

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
                {startDayEvents.length > 0 && (
                  <span className={styles.eventCountBadge}>
                    {startDayEvents.length}
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
        <div className={styles.modalBackdrop} onClick={() => setSelectedDate(null)}>
          <div className={styles.modalSurface} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Events for {selectedDate.isoDate}</h3>
              <button type="button" className={styles.ghostButton} onClick={() => { setSelectedDate(null); setNewEventText(''); setNewEventEndDate(''); setNewEventStartDate(''); setEditingEventId(null); }}>
                <FiX aria-label="Close" />
              </button>
            </div>
            
            <div className={styles.eventList}>
              {eventsData.filter(e => e.date === selectedDate.isoDate).map((e, idx) => (
                <div key={idx} className={styles.eventItem}>
                  <div className={styles.eventTextWrapper}>
                    <span>{e.events}</span>
                    <button 
                      type="button" 
                      className={styles.editButtonSmall}
                      onClick={() => {
                         setEditingEventId(e.id);
                         setNewEventText(e.events);
                         setNewEventStartDate(e.date);
                         setNewEventEndDate(e.end_date === e.date ? '' : e.end_date);
                         setIsFormModalOpen(true);
                      }}
                    >
                      Edit
                    </button>
                  </div>
                  {e.end_date && e.end_date !== e.date && (
                    <div className={styles.eventDateRange}>{e.date} to {e.end_date}</div>
                  )}
                </div>
              ))}
              {eventsData.filter(e => e.date === selectedDate.isoDate).length === 0 && (
                <p className={styles.noEvents}>No events starting on this date.</p>
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
    </section>
  );
}
