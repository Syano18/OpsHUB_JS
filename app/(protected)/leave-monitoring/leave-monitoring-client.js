'use client';

import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiActivity,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiCompass,
  FiGrid,
  FiPlus,
  FiShield,
  FiUsers,
  FiX,
} from 'react-icons/fi';
import ToastStack from '@/components/shared/toast-stack';
import styles from './leave-monitoring.module.css';

const leavePresentation = {
  vacation: {
    eyebrow: 'Usage Tracking',
    tone: 'vacation',
    icon: FiCompass,
    metrics: ['Used', 'Balance'],
  },
  sick: {
    eyebrow: 'Usage Tracking',
    tone: 'sick',
    icon: FiActivity,
    metrics: ['Used', 'Balance'],
  },
  forced: {
    eyebrow: 'Usage Tracking',
    tone: 'forced',
    icon: FiShield,
    metrics: ['Used', 'Balance'],
  },
  social: {
    eyebrow: 'Usage Tracking',
    tone: 'social',
    icon: FiUsers,
    metrics: ['Used', 'Balance'],
  },
  use_leave: {
    eyebrow: 'Usage Tracking',
    tone: 'use',
    icon: FiClock,
    metrics: ['Used', 'Balance'],
  },
  wellness: {
    eyebrow: 'Usage Tracking',
    tone: 'wellness',
    icon: FiGrid,
    metrics: ['Used', 'Balance'],
  },
};

const leaveTypeOptions = [
  { value: 'vacation', label: 'Vacation Leave' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'forced', label: 'Forced Leave' },
  { value: 'social', label: 'Social Leave' },
  { value: 'use_leave', label: 'USE Leave' },
  { value: 'wellness', label: 'Wellness Leave' },
];

const DEFAULT_FORM_DATA = {
  leaveType: '',
  leaveDates: [],
  locationScope: '',
  locationDetails: '',
  sickLeaveMode: '',
  illnessDetails: '',
  reason: '',
};

const CALENDAR_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function createDateValue(year, monthIndex, dayOfMonth) {
  return [
    String(year).padStart(4, '0'),
    String(monthIndex + 1).padStart(2, '0'),
    String(dayOfMonth).padStart(2, '0'),
  ].join('-');
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftMonth(date, offset) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function formatCalendarMonth(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function getTodayDateValue() {
  const today = new Date();
  return createDateValue(today.getFullYear(), today.getMonth(), today.getDate());
}

function buildCalendarDays(viewDate) {
  const monthStart = startOfMonth(viewDate);
  const monthIndex = monthStart.getMonth();
  const monthYear = monthStart.getFullYear();
  const leadingEmptyDays = monthStart.getDay();
  const lastDayOfMonth = new Date(monthYear, monthIndex + 1, 0).getDate();
  const calendarDays = [];

  for (let index = 0; index < leadingEmptyDays; index += 1) {
    calendarDays.push({
      key: `empty-start-${index}`,
      isPlaceholder: true,
    });
  }

  for (let dayOfMonth = 1; dayOfMonth <= lastDayOfMonth; dayOfMonth += 1) {
    const dateValue = createDateValue(monthYear, monthIndex, dayOfMonth);

    calendarDays.push({
      key: dateValue,
      dateValue,
      dayOfMonth,
      isWeekend: isWeekendDate(dateValue),
      isPlaceholder: false,
    });
  }

  while (calendarDays.length % 7 !== 0) {
    calendarDays.push({
      key: `empty-end-${calendarDays.length}`,
      isPlaceholder: true,
    });
  }

  return calendarDays;
}

function normalizeDateValue(value) {
  const normalizedValue = String(value ?? '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return '';
  }

  const parsedDate = new Date(`${normalizedValue}T12:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return normalizedValue;
}

function sortDateValues(left, right) {
  return left.localeCompare(right);
}

function normalizeLeaveDates(leaveDates) {
  return [...new Set((leaveDates ?? []).map(normalizeDateValue).filter(Boolean))].sort(
    sortDateValues
  );
}

function isWeekendDate(dateValue) {
  const parsedDate = new Date(`${dateValue}T12:00:00`);
  const dayOfWeek = parsedDate.getDay();

  return dayOfWeek === 0 || dayOfWeek === 6;
}

function formatLeaveValue(value) {
  if (value === null || value === undefined || value === '') {
    return '--';
  }

  if (typeof value === 'string') {
    return value;
  }

  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return String(value);
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 10,
  }).format(numericValue);
}

function formatFiledDate(value) {
  if (!value) {
    return 'Date not set';
  }

  if (value.includes(' to ')) {
    const [dateFrom, dateTo] = value.split(' to ');
    return `${formatSingleDate(dateFrom)} to ${formatSingleDate(dateTo)}`;
  }

  return formatSingleDate(value);
}

function formatSingleDate(value) {
  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function buildLeaveSummary(leave) {
  const presentation = leavePresentation[leave.key];

  if (!presentation) {
    return null;
  }

  return {
    key: leave.key,
    name: leave.name,
    eyebrow: presentation.eyebrow,
    tone: presentation.tone,
    icon: presentation.icon,
    filedHistory: Array.isArray(leave.filedHistory) ? leave.filedHistory : [],
    metrics: presentation.metrics.map((label) => ({
      label,
      value: label === 'Used' ? leave.used : leave.balance,
    })),
  };
}

function requiresLocationDetails(leaveType) {
  return leaveType === 'vacation' || leaveType === 'social';
}

function requiresIllnessDetails(leaveType) {
  return leaveType === 'sick';
}

function buildSubmittedReason({
  leaveType,
  locationScope,
  locationDetails,
  sickLeaveMode,
  illnessDetails,
  reason,
}) {
  const normalizedReason = reason.trim();
  const detailSections = [];

  if (requiresLocationDetails(leaveType)) {
    const locationLabel =
      locationScope === 'within_philippines' ? 'Within the Philippines' : 'Abroad';

    detailSections.push(`Location: ${locationLabel}`);
    detailSections.push(`Specified Place: ${locationDetails.trim()}`);
  }

  if (requiresIllnessDetails(leaveType)) {
    const illnessLabel = sickLeaveMode === 'in_hospital' ? 'In Hospital' : 'Out Patient';

    detailSections.push(`Sick Leave Type: ${illnessLabel}`);
    detailSections.push(`Illness: ${illnessDetails.trim()}`);
  }

  if (!detailSections.length) {
    return normalizedReason;
  }

  if (!normalizedReason) {
    return detailSections.join('\n');
  }

  return `${normalizedReason}\n\n${detailSections.join('\n')}`;
}

function FieldLabel({ children, required = false }) {
  return (
    <span className={styles.fieldLabel}>
      {children}
      {required ? <span className={styles.requiredMark}> *</span> : null}
    </span>
  );
}

function LeaveCard({ leave }) {
  const Icon = leave.icon;

  return (
    <article className={styles.leaveCard} data-tone={leave.tone}>
      <div className={styles.cardHeader}>
        <div className={styles.cardIdentity}>
          <span className={styles.iconBadge}>
            <Icon />
          </span>
          <div>
            <p className={styles.cardEyebrow}>{leave.eyebrow}</p>
            <h3 className={styles.cardTitle}>{leave.name}</h3>
          </div>
        </div>
        <span className={styles.cardCount}>
          {leave.filedHistory.length} filed
        </span>
      </div>

      <div className={styles.metricGrid}>
        {leave.metrics.map((metric) => (
          <div key={metric.label} className={styles.metricCard}>
            <span className={styles.metricLabel}>{metric.label}</span>
            <strong className={styles.metricValue}>
              {formatLeaveValue(metric.value)}
            </strong>
          </div>
        ))}
      </div>

      <div className={styles.historySection}>
        <p className={styles.historyLabel}>Filed Leave Dates</p>
        {leave.filedHistory.length ? (
          <div className={styles.historyList}>
            {leave.filedHistory.map((filedDate, index) => (
              <span key={`${filedDate}-${index}`} className={styles.historyChip}>
                {formatFiledDate(filedDate)}
              </span>
            ))}
          </div>
        ) : (
          <p className={styles.historyEmpty}>No filed leave dates yet.</p>
        )}
      </div>
    </article>
  );
}

export default function LeaveMonitoringClient({ initialLeaveSummaries }) {
  const router = useRouter();
  const dialogRef = useRef(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));

  const leaveSummaries = useMemo(
    () => initialLeaveSummaries.map(buildLeaveSummary).filter(Boolean),
    [initialLeaveSummaries]
  );
  const balanceOnlyLeaveTypes = leaveSummaries.filter((leave) => leave.metrics.length === 2);
  const requestedDays = formData.leaveDates.length;
  const selectedLeaveSummary =
    leaveSummaries.find((leave) => leave.key === formData.leaveType) ?? null;
  const showLocationFields = requiresLocationDetails(formData.leaveType);
  const showIllnessFields = requiresIllnessDetails(formData.leaveType);
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);
  const todayDateValue = useMemo(() => getTodayDateValue(), []);

  useEffect(() => {
    if (!isDialogOpen) {
      return undefined;
    }

    function handleEscape(event) {
      if (event.key === 'Escape' && !isSubmitting) {
        setIsDialogOpen(false);
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isDialogOpen, isSubmitting]);

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

  const closeDialog = () => {
    if (isSubmitting) {
      return;
    }

    setIsDialogOpen(false);
    setFormData(DEFAULT_FORM_DATA);
    setFormError('');
    setCalendarMonth(startOfMonth(new Date()));
  };

  const toggleLeaveDate = (dateValue) => {
    if (!dateValue || isWeekendDate(dateValue)) {
      return;
    }

    setFormData((current) => {
      const nextLeaveDates = current.leaveDates.includes(dateValue)
        ? current.leaveDates.filter((leaveDate) => leaveDate !== dateValue)
        : normalizeLeaveDates([...current.leaveDates, dateValue]);

      return {
        ...current,
        leaveDates: nextLeaveDates,
      };
    });
    setFormError('');
  };

  const removeLeaveDate = (dateValue) => {
    setFormData((current) => ({
      ...current,
      leaveDates: current.leaveDates.filter((leaveDate) => leaveDate !== dateValue),
    }));
    setFormError('');
  };

  const handleLeaveTypeChange = (event) => {
    const nextLeaveType = event.target.value;

    setFormData((current) => ({
      ...current,
      leaveType: nextLeaveType,
      locationScope: '',
      locationDetails: '',
      sickLeaveMode: '',
      illnessDetails: '',
    }));
    setFormError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.leaveType || !formData.leaveDates.length) {
      setFormError('Leave type and leave dates are required.');
      return;
    }

    if (showLocationFields && (!formData.locationScope || !formData.locationDetails.trim())) {
      setFormError(
        'For Vacation and Social leave, choose Within the Philippines or Abroad and specify the place.'
      );
      return;
    }

    if (showIllnessFields && (!formData.sickLeaveMode || !formData.illnessDetails.trim())) {
      setFormError(
        'For Sick Leave, choose In Hospital or Out Patient and specify the illness.'
      );
      return;
    }

    if (formData.leaveDates.some(isWeekendDate)) {
      setFormError('Weekend dates cannot be submitted as leave dates.');
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      const response = await fetch('/api/leaves', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leaveType: formData.leaveType,
          leaveDates: formData.leaveDates,
          reason: buildSubmittedReason(formData),
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to submit the leave request right now.');
      }

      setIsDialogOpen(false);
      setFormData(DEFAULT_FORM_DATA);
      showToast('success', payload?.message || 'Leave request submitted for HR review.');
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      const message = error.message || 'Unable to submit the leave request right now.';
      setFormError(message);
      showToast('error', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <section className={styles.page}>
        <div className={styles.toolbarCard}>
          <div className={styles.headingRow}>
            <div className={styles.headingBlock}>
              <h1 className={styles.title}>Leave Monitoring</h1>
            </div>

            <div className={styles.actionGroup}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => setIsDialogOpen(true)}
              >
                <FiPlus aria-hidden="true" />
                <span>File Leave</span>
              </button>
            </div>
          </div>
        </div>

        <div className={styles.contentGrid}>
          <div className={styles.mainColumn}>
            <section className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Usage and Balance</h2>
                </div>
              </div>

              <div className={styles.compactGrid}>
                {balanceOnlyLeaveTypes.map((leave) => (
                  <LeaveCard key={leave.key} leave={leave} />
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>

      {isDialogOpen ? (
        <div className={styles.dialogBackdrop} onMouseDown={closeDialog}>
          <div
            ref={dialogRef}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-label="File leave request"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.dialogHeader}>
              <div>
                <p className={styles.dialogEyebrow}>Leave Request</p>
                <h2 className={styles.dialogTitle}>File Leave</h2>
                <p className={styles.dialogText}>
                  Choose the leave type, add each leave date you plan to file, and include a short reason for HR review.
                </p>
              </div>
              <button
                type="button"
                className={styles.dialogClose}
                onClick={closeDialog}
                aria-label="Close leave filing dialog"
              >
                <FiX />
              </button>
            </div>

            <div className={styles.dialogBody}>
              <form className={styles.form} onSubmit={handleSubmit}>
                <div className={styles.formGrid}>
                  <label className={styles.fieldGroup}>
                    <FieldLabel required>Leave Type</FieldLabel>
                    <select
                      className={styles.selectInput}
                      value={formData.leaveType}
                      onChange={handleLeaveTypeChange}
                      required
                    >
                      <option value="">Select leave type</option>
                      {leaveTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className={styles.fieldGroup}>
                    <FieldLabel required>Requested Days</FieldLabel>
                    <div className={styles.readOnlyValue}>
                      {requestedDays > 0 ? `${requestedDays}` : '--'}
                    </div>
                  </div>

                  {showLocationFields ? (
                    <>
                      <label className={styles.fieldGroup}>
                        <FieldLabel required>Location</FieldLabel>
                        <select
                          className={styles.selectInput}
                          value={formData.locationScope}
                          onChange={(event) =>
                            setFormData((current) => ({
                              ...current,
                              locationScope: event.target.value,
                            }))
                          }
                          required
                        >
                          <option value="">Select location</option>
                          <option value="within_philippines">Within the Philippines</option>
                          <option value="abroad">Abroad</option>
                        </select>
                      </label>

                      <label className={styles.fieldGroup}>
                        <FieldLabel required>Please Specify</FieldLabel>
                        <input
                          type="text"
                          className={styles.textInput}
                          value={formData.locationDetails}
                          onChange={(event) =>
                            setFormData((current) => ({
                              ...current,
                              locationDetails: event.target.value,
                            }))
                          }
                          placeholder="Enter the place or destination"
                          required
                        />
                      </label>
                    </>
                  ) : null}

                  {showIllnessFields ? (
                    <>
                      <label className={styles.fieldGroup}>
                        <FieldLabel required>Sick Leave Type</FieldLabel>
                        <select
                          className={styles.selectInput}
                          value={formData.sickLeaveMode}
                          onChange={(event) =>
                            setFormData((current) => ({
                              ...current,
                              sickLeaveMode: event.target.value,
                            }))
                          }
                          required
                        >
                          <option value="">Select type</option>
                          <option value="in_hospital">In Hospital</option>
                          <option value="out_patient">Out Patient</option>
                        </select>
                      </label>

                      <label className={styles.fieldGroup}>
                        <FieldLabel required>Specify Illness</FieldLabel>
                        <input
                          type="text"
                          className={styles.textInput}
                          value={formData.illnessDetails}
                          onChange={(event) =>
                            setFormData((current) => ({
                              ...current,
                              illnessDetails: event.target.value,
                            }))
                          }
                          placeholder="Enter the illness or condition"
                          required
                        />
                      </label>
                    </>
                  ) : null}
                </div>

                <div className={styles.fieldGroup}>
                  <div className={styles.calendarHeader}>
                    <FieldLabel required>Leave Dates</FieldLabel>
                    <div className={styles.calendarNav}>
                      <button
                        type="button"
                        className={styles.calendarNavButton}
                        onClick={() => setCalendarMonth((current) => shiftMonth(current, -1))}
                        aria-label="Previous month"
                      >
                        <FiChevronLeft />
                      </button>
                      <strong className={styles.calendarMonthLabel}>
                        {formatCalendarMonth(calendarMonth)}
                      </strong>
                      <button
                        type="button"
                        className={styles.calendarNavButton}
                        onClick={() => setCalendarMonth((current) => shiftMonth(current, 1))}
                        aria-label="Next month"
                      >
                        <FiChevronRight />
                      </button>
                    </div>
                  </div>

                  <div className={styles.calendarCard}>
                    <div className={styles.calendarWeekdays}>
                      {CALENDAR_WEEKDAYS.map((weekday) => (
                        <span key={weekday} className={styles.calendarWeekday}>
                          {weekday}
                        </span>
                      ))}
                    </div>

                    <div className={styles.calendarGrid}>
                      {calendarDays.map((day) => {
                        if (day.isPlaceholder) {
                          return <span key={day.key} className={styles.calendarPlaceholder} />;
                        }

                        const isSelected = formData.leaveDates.includes(day.dateValue);
                        const isToday = day.dateValue === todayDateValue;

                        return (
                          <button
                            key={day.key}
                            type="button"
                            className={styles.calendarDay}
                            data-selected={isSelected ? 'true' : 'false'}
                            data-weekend={day.isWeekend ? 'true' : 'false'}
                            data-today={isToday ? 'true' : 'false'}
                            onClick={() => toggleLeaveDate(day.dateValue)}
                            aria-pressed={isSelected}
                            disabled={day.isWeekend}
                          >
                            {day.dayOfMonth}
                          </button>
                        );
                      })}
                    </div>

                    <p className={styles.calendarHint}>
                      Click weekdays to add or remove them. Weekends are unavailable.
                    </p>
                  </div>
                </div>

                <div className={styles.fieldGroup}>
                  <FieldLabel required>Selected Leave Dates</FieldLabel>
                  {formData.leaveDates.length ? (
                    <div className={styles.selectedDatesList}>
                      {formData.leaveDates.map((leaveDate) => (
                        <span key={leaveDate} className={styles.selectedDateChip}>
                          <span>{formatSingleDate(leaveDate)}</span>
                          <button
                            type="button"
                            className={styles.removeDateButton}
                            onClick={() => removeLeaveDate(leaveDate)}
                            aria-label={`Remove ${formatSingleDate(leaveDate)}`}
                          >
                            <FiX />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.selectedDatesEmpty}>
                      No leave dates selected yet.
                    </p>
                  )}
                </div>

                <label className={styles.fieldGroup}>
                  <FieldLabel>Reason (Optional)</FieldLabel>
                  <textarea
                    className={styles.textArea}
                    rows={4}
                    value={formData.reason}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        reason: event.target.value,
                      }))
                    }
                    placeholder="Explain the leave request if needed."
                  />
                </label>

                {selectedLeaveSummary ? (
                  <div className={styles.previewCard}>
                    <p className={styles.previewLabel}>Current Balance</p>
                    <strong className={styles.previewValue}>
                      {selectedLeaveSummary.name}: {formatLeaveValue(
                        selectedLeaveSummary.metrics.find((metric) => metric.label === 'Balance')?.value
                      )}
                    </strong>
                  </div>
                ) : null}

                {formError ? <p className={styles.formError}>{formError}</p> : null}

                <div className={styles.dialogActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={closeDialog}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.primaryButton}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit Leave'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
