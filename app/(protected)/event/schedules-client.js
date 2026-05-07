'use client';

import { useCallback, useDeferredValue, useEffect, useId, useRef, useState } from 'react';
import {
  FiCheck,
  FiChevronDown,
  FiEdit2,
  FiPlus,
  FiSave,
  FiSearch,
  FiTrash2,
  FiX,
} from 'react-icons/fi';
import ToastStack from '@/components/shared/toast-stack';
import styles from './schedules.module.css';

const DEFAULT_FORM_DATA = {
  title: '',
  startDate: '',
  endDate: '',
  assignedTo: [],
  remarks: '',
};
const ALL_EMPLOYEES_OPTION = 'All employees';
const DEFAULT_SCHEDULE_FILTER = 'upcoming';

function buildFormDataFromSchedule(schedule) {
  return {
    title: String(schedule?.title ?? ''),
    startDate: String(schedule?.startDate ?? ''),
    endDate: String(schedule?.endDate ?? ''),
    assignedTo: String(schedule?.assignedTo ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    remarks: String(schedule?.remarks ?? ''),
  };
}

function useCloseOnOutsideClick(containerRef, onClose) {
  useEffect(() => {
    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) {
        onClose();
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [containerRef, onClose]);
}

function formatDateLabel(value) {
  if (!value) {
    return 'Date not set';
  }

  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function formatDateRange(startDate, endDate) {
  if (startDate && endDate) {
    if (startDate === endDate) {
      return formatDateLabel(startDate);
    }

    return `${formatDateLabel(startDate)} to ${formatDateLabel(endDate)}`;
  }

  if (startDate) {
    return `Starts ${formatDateLabel(startDate)}`;
  }

  if (endDate) {
    return `Until ${formatDateLabel(endDate)}`;
  }

  return 'Schedule date not set';
}

function formatComparableDate(value) {
  return String(value ?? '').trim();
}

function getComparableScheduleDate(schedule) {
  return (
    formatComparableDate(schedule.startDate) ||
    formatComparableDate(schedule.endDate) ||
    formatComparableDate(schedule.createdAt)
  );
}

function sortSchedules(schedules) {
  return [...schedules].sort((first, second) => {
    const firstDate = getComparableScheduleDate(first);
    const secondDate = getComparableScheduleDate(second);

    if (firstDate !== secondDate) {
      return firstDate.localeCompare(secondDate);
    }

    return String(first.createdAt ?? '').localeCompare(String(second.createdAt ?? ''));
  });
}

function getTodayComparableDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isUpcomingSchedule(schedule, today = getTodayComparableDate()) {
  const startDate = formatComparableDate(schedule.startDate);
  
  if (startDate) {
    return startDate > today;
  }

  return false;
}

function isOngoingSchedule(schedule, today = getTodayComparableDate()) {
  const startDate = formatComparableDate(schedule.startDate);
  const endDate = formatComparableDate(schedule.endDate);

  if (startDate && startDate > today) {
    return false;
  }

  if (endDate) {
    return endDate >= today && (!startDate || startDate <= today);
  }

  return startDate === today;
}

function isPastSchedule(schedule, today = getTodayComparableDate()) {
  const startDate = formatComparableDate(schedule.startDate);
  const endDate = formatComparableDate(schedule.endDate);

  if (endDate) {
    return endDate < today;
  }

  if (startDate) {
    return startDate < today;
  }

  return false;
}

function buildNotificationFailureMessage(failures) {
  if (!Array.isArray(failures) || !failures.length) {
    return '';
  }

  const labels = failures.map(
    (failure) => failure.name || failure.email || 'Unknown recipient'
  );
  const preview = labels.slice(0, 3).join(', ');
  const remainingCount = labels.length - 3;

  return remainingCount > 0
    ? `Email did not send to: ${preview}, and ${remainingCount} more.`
    : `Email did not send to: ${preview}.`;
}

function buildNotificationFailureTitle(failures) {
  const count = Array.isArray(failures) ? failures.length : 0;
  return `Email failed for ${count} ${count === 1 ? 'recipient' : 'recipients'}`;
}

function MultiSelectDropdown({
  label,
  required = false,
  values,
  options,
  onChange,
  placeholder,
  error = '',
}) {
  const listId = useId();
  const containerRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  useCloseOnOutsideClick(containerRef, () => {
    setIsOpen(false);
    setQuery('');
  });

  const filteredOptions = options
    .filter((option) => !values.includes(option))
    .filter((option) =>
      values.includes(ALL_EMPLOYEES_OPTION) ? option === ALL_EMPLOYEES_OPTION : true
    )
    .filter((option) =>
      option.toLowerCase().includes(deferredQuery.trim().toLowerCase())
    );

  const addValue = (option) => {
    if (values.includes(option)) {
      return;
    }

    if (option === ALL_EMPLOYEES_OPTION) {
      onChange([ALL_EMPLOYEES_OPTION]);
    } else if (values.includes(ALL_EMPLOYEES_OPTION)) {
      onChange([option]);
    } else {
      onChange([...values, option]);
    }

    setQuery('');
    setIsOpen(true);
  };

  const removeValue = (valueToRemove) => {
    onChange(values.filter((value) => value !== valueToRemove));
  };

  return (
    <div className={styles.fieldGroup}>
      <label className={styles.fieldLabel}>
        {label}
        {required ? <span className={styles.required}>*</span> : null}
      </label>

      <div ref={containerRef} className={styles.dropdownShell}>
        <div
          className={`${styles.multiSelectBox} ${
            isOpen ? styles.searchableControlOpen : ''
          } ${error ? styles.searchableControlError : ''}`}
        >
          {values.length ? (
            <div className={styles.tagList}>
              {values.map((value) => (
                <span key={value} className={styles.tag}>
                  {value}
                  <button
                    type="button"
                    className={styles.tagRemove}
                    onClick={() => removeValue(value)}
                    aria-label={`Remove ${value}`}
                  >
                    <FiX />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className={styles.multiInputRow}>
            <FiSearch className={styles.controlIcon} />
            <input
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setIsOpen(true);
              }}
              onFocus={() => {
                setQuery('');
                setIsOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();

                  if (filteredOptions[0]) {
                    addValue(filteredOptions[0]);
                  }
                }

                if (event.key === 'Backspace' && !query && values.length) {
                  removeValue(values[values.length - 1]);
                }

                if (event.key === 'Escape') {
                  setIsOpen(false);
                }
              }}
              placeholder={placeholder}
              className={styles.controlInput}
            />
            <button
              type="button"
              className={styles.controlToggle}
              onClick={() => {
                setIsOpen((open) => !open);
                setQuery('');
              }}
              aria-label={`Toggle ${label} options`}
            >
              <FiChevronDown />
            </button>
          </div>
        </div>

        {isOpen ? (
          <div id={listId} className={styles.optionsPanel}>
            {filteredOptions.length ? (
              filteredOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={styles.optionButton}
                  onClick={() => addValue(option)}
                >
                  <span>{option}</span>
                  <FiCheck />
                </button>
              ))
            ) : (
              <p className={styles.optionEmpty}>No matching active users.</p>
            )}
          </div>
        ) : null}
      </div>

      {error ? <p className={styles.fieldError}>{error}</p> : null}
    </div>
  );
}

export default function SchedulesClient({
  initialSchedules,
  activeUserNames,
}) {
  const assignableUserOptions = [ALL_EMPLOYEES_OPTION, ...activeUserNames];
  const [schedules, setSchedules] = useState(() => sortSchedules(initialSchedules));
  const [searchTerm, setSearchTerm] = useState('');
  const [scheduleFilter, setScheduleFilter] = useState(DEFAULT_SCHEDULE_FILTER);
  const [editingScheduleId, setEditingScheduleId] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [formErrors, setFormErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitLabel, setSubmitLabel] = useState('Saving...');
  const [deletingScheduleId, setDeletingScheduleId] = useState(null);
  const [deleteCandidateSchedule, setDeleteCandidateSchedule] = useState(null);
  const [notificationFailures, setNotificationFailures] = useState([]);
  const [toasts, setToasts] = useState([]);
  const abortControllerRef = useRef(null);

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

  const closeNotificationFailureDialog = useCallback(() => {
    setNotificationFailures([]);
  }, []);

  const openNotificationFailureDialog = useCallback((failures) => {
    if (Array.isArray(failures) && failures.length) {
      setNotificationFailures(failures);
    }
  }, []);

  const closeDeleteScheduleDialog = useCallback(() => {
    if (deletingScheduleId) {
      return;
    }

    setDeleteCandidateSchedule(null);
  }, [deletingScheduleId]);

  const resetDialog = useCallback(() => {
    setFormData(DEFAULT_FORM_DATA);
    setFormErrors({});
    setSubmitError('');
    setIsSubmitting(false);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const closeDialog = useCallback(() => {
    setIsCreateOpen(false);
    setEditingScheduleId(null);
    resetDialog();
  }, [resetDialog]);

  const openDialog = useCallback(() => {
    setEditingScheduleId(null);
    setFormData(DEFAULT_FORM_DATA);
    setIsCreateOpen(true);
    setFormErrors({});
    setSubmitError('');
  }, []);

  const openEditDialog = useCallback((schedule) => {
    setEditingScheduleId(schedule.id);
    setFormData(buildFormDataFromSchedule(schedule));
    setFormErrors({});
    setSubmitError('');
    setIsCreateOpen(true);
  }, []);

  useEffect(() => {
    setSchedules(sortSchedules(initialSchedules));
  }, [initialSchedules]);

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const todayComparableDate = getTodayComparableDate();
  
  const upcomingCount = schedules.filter((schedule) => isUpcomingSchedule(schedule, todayComparableDate)).length;
  const ongoingCount = schedules.filter((schedule) => isOngoingSchedule(schedule, todayComparableDate)).length;

  const filteredSchedules = schedules.filter((schedule) => {
    let matchesSelectedFilter = true;

    if (scheduleFilter === 'past') {
      matchesSelectedFilter = isPastSchedule(schedule, todayComparableDate);
    } else if (scheduleFilter === 'upcoming') {
      matchesSelectedFilter = isUpcomingSchedule(schedule, todayComparableDate);
    } else if (scheduleFilter === 'ongoing') {
      matchesSelectedFilter = isOngoingSchedule(schedule, todayComparableDate);
    }

    if (!matchesSelectedFilter) {
      return false;
    }

    const matchesSearch = [
      schedule.title,
      schedule.assignedTo,
      schedule.remarks,
      schedule.encodedBy,
      schedule.startDate,
      schedule.endDate,
    ].some((value) =>
      String(value ?? '').toLowerCase().includes(normalizedSearchTerm)
    );

    return normalizedSearchTerm ? matchesSearch : true;
  });

  const validateForm = () => {
    const nextErrors = {};

    if (!formData.title.trim()) {
      nextErrors.title = 'Schedule title is required.';
    }

    if (!formData.startDate) {
      nextErrors.startDate = 'Start date is required.';
    }

    if (!formData.endDate) {
      nextErrors.endDate = 'End date is required.';
    }

    if (
      formData.startDate &&
      formData.endDate &&
      formData.endDate < formData.startDate
    ) {
      nextErrors.endDate = 'End date cannot be earlier than start date.';
    }

    if (!formData.assignedTo.length) {
      nextErrors.assignedTo = 'Assigned to is required.';
    }

    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validateForm() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    setSubmitLabel('Saving schedule...');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(
        editingScheduleId ? `/api/schedules/${editingScheduleId}` : '/api/schedules',
        {
          method: editingScheduleId ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData),
          signal: controller.signal,
        }
      );

      const isJson = response.headers.get('content-type')?.includes('application/json');
      
      let payload = null;

      if (!response.ok) {
        payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error ||
            (editingScheduleId
              ? 'Unable to update schedule right now.'
              : 'Unable to add schedule right now.')
        );
      }

      if (isJson) {
        payload = await response.json().catch(() => null);
      } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\\n');
          buffer = lines.pop(); // keep the last partial line if any

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              if (data.type === 'progress') {
                setSubmitLabel(data.message);
              } else if (data.type === 'success') {
                payload = data;
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (err) {
              if (err.message && err.message !== 'Unexpected end of JSON input') {
                throw err;
              }
            }
          }
        }
      }

      if (payload?.schedule) {
        setSchedules((currentSchedules) => {
          if (editingScheduleId) {
            return sortSchedules(
              currentSchedules.map((schedule) =>
                schedule.id === payload.schedule.id ? payload.schedule : schedule
              )
            );
          }

          return sortSchedules([...currentSchedules, payload.schedule]);
        });
      }

      closeDialog();
      showToast(
        'success',
        payload?.message ||
          (editingScheduleId
            ? 'Schedule updated successfully.'
            : 'Schedule added successfully.')
      );
      if (payload?.notificationFailures?.length) {
        openNotificationFailureDialog(payload.notificationFailures);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        showToast('error', 'Request cancelled.', 3000);
        return;
      }
      
      setSubmitError(
        error.message ||
          (editingScheduleId
            ? 'Unable to update schedule right now.'
            : 'Unable to add schedule right now.')
      );
    } finally {
      setIsSubmitting(false);
      abortControllerRef.current = null;
    }
  };

  const openDeleteScheduleDialog = (schedule) => {
    if (!schedule?.id || deletingScheduleId || isSubmitting) {
      return;
    }

    setDeleteCandidateSchedule(schedule);
  };

  const handleConfirmDeleteSchedule = async () => {
    const schedule = deleteCandidateSchedule;

    if (!schedule?.id || deletingScheduleId || isSubmitting) {
      return;
    }

    setDeletingScheduleId(schedule.id);

    try {
      const response = await fetch(`/api/schedules/${schedule.id}`, {
        method: 'DELETE',
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to delete schedule right now.');
      }

      setSchedules((currentSchedules) =>
        currentSchedules.filter((currentSchedule) => currentSchedule.id !== schedule.id)
      );
      setDeleteCandidateSchedule(null);
      showToast('success', payload?.message || 'Schedule deleted successfully.');
    } catch (error) {
      showToast('error', error.message || 'Unable to delete schedule right now.', 5200);
    } finally {
      setDeletingScheduleId(null);
    }
  };

  return (
    <>
      <section className={styles.page}>
        <div className={styles.toolbarCard}>
          <div className={styles.headingRow}>
            <div className={styles.headingBlock}>
              <h1 className={styles.title}>
                {scheduleFilter === 'upcoming' 
                  ? 'Upcoming Schedule' 
                  : scheduleFilter === 'ongoing' 
                    ? 'Ongoing Schedule' 
                    : 'Past Schedule'}
              </h1>
            </div>
          </div>
          <div className={styles.toolbarFilters}>
            <div className={styles.searchWrap}>
              <label className={styles.searchField}>
                <FiSearch className={styles.searchIcon} aria-hidden="true" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className={styles.searchInput}
                  placeholder="Search schedules"
                />
              </label>
            </div>
            <div className={styles.actionGroup}>
              <div className={styles.filterToggle} role="group" aria-label="Schedule visibility">
                <button
                  type="button"
                  className={`${styles.filterButton} ${
                    scheduleFilter === 'upcoming' ? styles.filterButtonActive : ''
                  }`}
                  onClick={() => setScheduleFilter('upcoming')}
                  aria-pressed={scheduleFilter === 'upcoming'}
                >
                  {upcomingCount > 0 ? (
                    <span className={styles.filterBadge}>{upcomingCount}</span>
                  ) : null}
                  <span>Upcoming</span>
                </button>
                <button
                  type="button"
                  className={`${styles.filterButton} ${
                    scheduleFilter === 'ongoing' ? styles.filterButtonActive : ''
                  }`}
                  onClick={() => setScheduleFilter('ongoing')}
                  aria-pressed={scheduleFilter === 'ongoing'}
                >
                  {ongoingCount > 0 ? (
                    <span className={styles.filterBadge}>{ongoingCount}</span>
                  ) : null}
                  <span>Ongoing</span>
                </button>
                <button
                  type="button"
                  className={`${styles.filterButton} ${
                    scheduleFilter === 'past' ? styles.filterButtonActive : ''
                  }`}
                  onClick={() => setScheduleFilter('past')}
                  aria-pressed={scheduleFilter === 'past'}
                >
                  <span>Past</span>
                </button>
              </div>
              <button type="button" className={styles.primaryButton} onClick={openDialog}>
                <FiPlus aria-hidden="true" />
                <span>Add Schedule</span>
              </button>
            </div>
          </div>
        </div>

        <div className={styles.contentCard}>
          {filteredSchedules.length ? (
            <div className={styles.scheduleGrid}>
              {filteredSchedules.map((schedule) => {
                return (
                  <article 
                    key={schedule.id} 
                    className={styles.scheduleCard}
                  >
                    <div className={styles.scheduleHeader}>
                      <div className={styles.scheduleHeaderTop}>
                        <h2 className={styles.scheduleTitle}>{schedule.title}</h2>
                          <div className={styles.cardActions}>
                            <button
                              type="button"
                              className={styles.cardActionButton}
                              onClick={() => openEditDialog(schedule)}
                              disabled={deletingScheduleId === schedule.id}
                            >
                              <FiEdit2 aria-hidden="true" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              className={`${styles.cardActionButton} ${styles.cardDeleteButton}`}
                              onClick={() => openDeleteScheduleDialog(schedule)}
                              disabled={deletingScheduleId === schedule.id}
                            >
                              <FiTrash2 aria-hidden="true" />
                              <span>
                                {deletingScheduleId === schedule.id ? 'Deleting...' : 'Delete'}
                              </span>
                            </button>
                          </div>
                      </div>
                      <p className={styles.scheduleDate}>
                        {formatDateRange(schedule.startDate, schedule.endDate)}
                      </p>
                    </div>

                    <dl className={styles.detailsList}>
                      <div>
                        <dt className={styles.detailLabel}>Assigned to</dt>
                        <dd className={styles.detailValue}>
                          {schedule.assignedTo || 'No assignee set'}
                        </dd>
                      </div>
                      <div>
                        <dt className={styles.detailLabel}>Remarks</dt>
                        <dd className={styles.detailValue}>
                          {schedule.remarks || 'No remarks added.'}
                        </dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyInner}>
                <p className={styles.emptyEyebrow}>All clear</p>
                <h2 className={styles.emptyTitle}>
                  {searchTerm.trim()
                    ? 'No schedules match your search'
                    : scheduleFilter === 'past'
                      ? 'No past schedules found'
                      : scheduleFilter === 'ongoing'
                        ? 'No ongoing schedules found'
                        : 'No upcoming schedules found'}
                </h2>
                <p className={styles.emptyText}>
                  {searchTerm.trim()
                    ? 'Try a different title, assignee, or remarks keyword.'
                    : scheduleFilter === 'past'
                      ? 'Past schedules will appear here once an entry ends before today.'
                      : scheduleFilter === 'ongoing'
                        ? 'Ongoing schedules will appear here.'
                        : 'Add a future entry to the `schedules` table and it will appear here automatically.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {isCreateOpen ? (
        <div className={styles.insertDialogBackdrop}>
          <div
            className={styles.insertDialog}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={editingScheduleId ? 'Edit schedule' : 'Add schedule'}
          >
            <div className={styles.insertDialogHeader}>
              <div>
                <p className={styles.insertDialogEyebrow}>Schedules</p>
                <h2 className={styles.insertDialogTitle}>
                  {editingScheduleId ? 'Edit Schedule' : 'Add Schedule'}
                </h2>
                <p className={styles.insertDialogText}>
                  {editingScheduleId
                    ? 'Update the schedule details and save your changes.'
                    : 'Create a new schedule entry using your database schema.'}
                </p>
              </div>
              <button
                type="button"
                className={styles.insertDialogClose}
                onClick={closeDialog}
                aria-label={editingScheduleId ? 'Close edit schedule dialog' : 'Close add schedule dialog'}
              >
                <FiX />
              </button>
            </div>

            <div className={styles.insertDialogBody}>
              <form className={styles.form} onSubmit={handleSubmit}>
                <div className={styles.grid}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel} htmlFor="schedule-title">
                      Title<span className={styles.required}>*</span>
                    </label>
                    <input
                      id="schedule-title"
                      className={styles.textInput}
                      value={formData.title}
                      onChange={(event) =>
                        setFormData((currentForm) => ({
                          ...currentForm,
                          title: event.target.value,
                        }))
                      }
                      placeholder="Enter the schedule title"
                    />
                    {formErrors.title ? (
                      <p className={styles.fieldError}>{formErrors.title}</p>
                    ) : null}
                  </div>

                  <div className={`${styles.fieldGroup} ${styles.dateGroup}`}>
                    <div className={styles.dateGroupInputs}>
                      <div className={styles.dateField}>
                        <label className={styles.fieldLabel} htmlFor="schedule-start-date">
                          Start date<span className={styles.required}>*</span>
                        </label>
                        <input
                          id="schedule-start-date"
                          type="date"
                          className={styles.textInput}
                          value={formData.startDate}
                          onChange={(event) =>
                            setFormData((currentForm) => ({
                              ...currentForm,
                              startDate: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className={styles.dateField}>
                        <label className={styles.fieldLabel} htmlFor="schedule-end-date">
                          End date<span className={styles.required}>*</span>
                        </label>
                        <input
                          id="schedule-end-date"
                          type="date"
                          className={styles.textInput}
                          value={formData.endDate}
                          onChange={(event) =>
                            setFormData((currentForm) => ({
                              ...currentForm,
                              endDate: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                    {formErrors.startDate ? (
                      <p className={styles.fieldError}>{formErrors.startDate}</p>
                    ) : null}
                    {formErrors.endDate ? (
                      <p className={styles.fieldError}>{formErrors.endDate}</p>
                    ) : null}
                  </div>
                </div>

                <MultiSelectDropdown
                  label="Assigned to"
                  required
                  values={formData.assignedTo}
                  options={assignableUserOptions}
                  onChange={(nextValues) =>
                    setFormData((currentForm) => ({
                      ...currentForm,
                      assignedTo: nextValues,
                    }))
                  }
                  placeholder="Search active users"
                  error={formErrors.assignedTo}
                />

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor="schedule-remarks">
                    Remarks
                  </label>
                  <textarea
                    id="schedule-remarks"
                    className={styles.textArea}
                    value={formData.remarks}
                    onChange={(event) =>
                      setFormData((currentForm) => ({
                        ...currentForm,
                        remarks: event.target.value,
                      }))
                    }
                    placeholder="Add optional remarks"
                  />
                </div>

                {submitError ? <p className={styles.submitError}>{submitError}</p> : null}

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={closeDialog}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.primaryButton}
                    disabled={isSubmitting}
                  >
                    <FiSave aria-hidden="true" />
                    <span>
                      {isSubmitting
                        ? submitLabel
                        : editingScheduleId
                          ? 'Update Schedule'
                          : 'Save Schedule'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {deleteCandidateSchedule ? (
        <div className={styles.insertDialogBackdrop} onClick={closeDeleteScheduleDialog}>
          <div
            className={styles.confirmDeleteDialog}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm schedule deletion"
          >
            <div className={styles.insertDialogHeader}>
              <div>
                <p className={styles.insertDialogEyebrow}>Schedules</p>
                <h2 className={styles.insertDialogTitle}>Confirm Delete</h2>
                <p className={styles.insertDialogText}>
                  This will delete the schedule and remove synced personal calendar entries.
                </p>
              </div>
              <button
                type="button"
                className={styles.insertDialogClose}
                onClick={closeDeleteScheduleDialog}
                disabled={Boolean(deletingScheduleId)}
                aria-label="Close delete schedule confirmation dialog"
              >
                <FiX />
              </button>
            </div>

            <div className={styles.confirmDeleteBody}>
              <p className={styles.confirmDeleteMessage}>
                Delete schedule &quot;{deleteCandidateSchedule.title || 'Untitled schedule'}&quot;?
              </p>
              <p className={styles.confirmDeleteWarning}>
                Date: {formatDateRange(deleteCandidateSchedule.startDate, deleteCandidateSchedule.endDate)}
              </p>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={closeDeleteScheduleDialog}
                  disabled={Boolean(deletingScheduleId)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.confirmDeleteButton}
                  onClick={handleConfirmDeleteSchedule}
                  disabled={Boolean(deletingScheduleId)}
                >
                  <FiTrash2 aria-hidden="true" />
                  <span>{deletingScheduleId ? 'Deleting...' : 'Delete Schedule'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {notificationFailures.length ? (
        <div
          className={styles.insertDialogBackdrop}
          onClick={closeNotificationFailureDialog}
        >
          <div
            className={styles.failureDialog}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Email notification failures"
          >
            <div className={styles.insertDialogHeader}>
              <div>
                <p className={styles.insertDialogEyebrow}>Email Notifications</p>
                <h2 className={styles.insertDialogTitle}>
                  {buildNotificationFailureTitle(notificationFailures)}
                </h2>
                <p className={styles.insertDialogText}>
                  {buildNotificationFailureMessage(notificationFailures)} Review the
                  recipient and the exact error below.
                </p>
              </div>
              <button
                type="button"
                className={styles.insertDialogClose}
                onClick={closeNotificationFailureDialog}
                aria-label="Close email notification failures dialog"
              >
                <FiX />
              </button>
            </div>

            <div className={styles.failureDialogBody}>
              <div className={styles.failureList}>
                {notificationFailures.map((failure, index) => (
                  <article
                    key={`${failure.email}-${index}`}
                    className={styles.failureItem}
                  >
                    <p className={styles.failureRecipient}>
                      {failure.name || 'Unknown recipient'}
                    </p>
                    <p className={styles.failureMeta}>
                      {failure.email || 'No email address available'}
                    </p>
                    <p className={styles.failureReason}>
                      {failure.reason || 'Unknown email delivery failure.'}
                    </p>
                  </article>
                ))}
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={closeNotificationFailureDialog}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
