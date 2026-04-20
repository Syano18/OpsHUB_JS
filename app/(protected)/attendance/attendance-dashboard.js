'use client';

import { useDeferredValue, useEffect, useId, useRef, useState } from 'react';
import {
  FiArrowRight,
  FiCalendar,
  FiCheckCircle,
  FiChevronDown,
  FiMessageSquare,
  FiSearch,
  FiX,
} from 'react-icons/fi';
import styles from './attendance.module.css';

const statusOptions = [
  { id: '', label: 'All employees' },
];

const FULL_ATTENDANCE_ROLES = new Set(['admin', 'super_admin']);

const minuteThresholds = {
  amStart: 8 * 60 + 15,
  pmStart: 13 * 60 + 15,
};

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

function SearchableOptionSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
  emptyMessage,
}) {
  const listId = useId();
  const containerRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find((option) => option.id === value) ?? null;
  const [query, setQuery] = useState(selectedOption?.label ?? '');
  const deferredQuery = useDeferredValue(query);
  const inputValue = isOpen ? query : selectedOption?.label ?? '';

  useCloseOnOutsideClick(containerRef, () => {
    setIsOpen(false);
    setQuery(selectedOption?.label ?? '');
  });

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(deferredQuery.trim().toLowerCase())
  );

  const selectOption = (option) => {
    onChange(option.id);
    setQuery(option.label);
    setIsOpen(false);
  };

  return (
    <label className={styles.selectField}>
      <span className={styles.fieldLabel}>{label}</span>
      <div ref={containerRef} className={styles.dropdownShell}>
        <div
          className={`${styles.searchableControl} ${
            isOpen ? styles.searchableControlOpen : ''
          }`}
        >
          <FiSearch className={styles.controlIcon} aria-hidden="true" />
          <input
            type="text"
            value={inputValue}
            onChange={(event) => {
              const nextValue = event.target.value;
              setQuery(nextValue);
              setIsOpen(true);

              if (!nextValue.trim()) {
                onChange('');
              }
            }}
            onFocus={() => {
              setQuery('');
              setIsOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();

                if (filteredOptions[0]) {
                  selectOption(filteredOptions[0]);
                }
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

        {isOpen ? (
          <div id={listId} className={styles.optionsPanel}>
            {filteredOptions.length ? (
              filteredOptions.map((option) => (
                <button
                  key={option.id || `${label}-all`}
                  type="button"
                  className={`${styles.optionButton} ${
                    option.id === value ? styles.optionButtonSelected : ''
                  }`}
                  onClick={() => selectOption(option)}
                >
                  <span>{option.label}</span>
                  {option.id === value ? <FiCheckCircle /> : null}
                </button>
              ))
            ) : (
              <p className={styles.optionEmpty}>{emptyMessage}</p>
            )}
          </div>
        ) : null}
      </div>
    </label>
  );
}

function parseTimeToMinutes(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const [hoursString, minutesString] = value.split(':');
  const hours = Number.parseInt(hoursString, 10);
  const minutes = Number.parseInt(minutesString, 10);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function formatTime(value) {
  const minutes = parseTimeToMinutes(value);

  if (minutes === null) {
    return '--';
  }

  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;

  return `${hours12}:${String(mins).padStart(2, '0')} ${suffix}`;
}

function formatDateLabel(value) {
  if (!value) {
    return 'Unknown date';
  }

  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function formatDateTimeLabel(value) {
  if (!value) {
    return 'Unknown time';
  }

  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function formatMonthLabel(value) {
  if (!value) {
    return 'Unknown month';
  }

  const parsed = new Date(`${value}-01T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(parsed);
}

function getCurrentMonthValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  return `${year}-${month}`;
}

function describeErrorType(message) {
  const normalized = String(message || '').toLowerCase();

  if (normalized.includes('agsapa') && normalized.includes('nagtime in')) {
    return 'AM time in error';
  }

  if (normalized.includes('agsapa') && normalized.includes('nagtime out')) {
    return 'AM time out error';
  }

  if (normalized.includes('malem') && normalized.includes('nagtime in')) {
    return 'PM time in error';
  }

  if (normalized.includes('malem') && normalized.includes('nagtime out')) {
    return 'PM time out error';
  }

  return 'Unknown punch';
}

function buildDashboardRows(attendance, punchErrors) {
  return attendance.map((record) => {
    const rowErrors = punchErrors.filter(
      (error) =>
        error.employeeId === record.employeeId && error.scanDate === record.date
    );

    const amIn = parseTimeToMinutes(record.timeInAm);
    const amOut = parseTimeToMinutes(record.timeOutAm);
    const pmIn = parseTimeToMinutes(record.timeInPm);
    const pmOut = parseTimeToMinutes(record.timeOutPm);

    const workedMinutes =
      (amIn !== null && amOut !== null && amOut > amIn ? amOut - amIn : 0) +
      (pmIn !== null && pmOut !== null && pmOut > pmIn ? pmOut - pmIn : 0);

    const hasRemarks = Boolean(record.remarks?.trim());
    const hasMissingPunch =
      !record.timeInAm ||
      !record.timeOutAm ||
      !record.timeInPm ||
      !record.timeOutPm;
    const isLate =
      (amIn !== null && amIn > minuteThresholds.amStart) ||
      (pmIn !== null && pmIn > minuteThresholds.pmStart);

    let status = 'Complete';

    if (!record.timeInAm && !record.timeOutAm && !record.timeInPm && !record.timeOutPm) {
      status = 'Absent';
    } else if (rowErrors.length) {
      status = 'Has punch error';
    } else if (hasMissingPunch) {
      status = 'Incomplete';
    } else if (isLate) {
      status = 'Late';
    }

    return {
      ...record,
      workedMinutes,
      totalHoursLabel:
        workedMinutes > 0
          ? `${Math.floor(workedMinutes / 60)}h ${String(workedMinutes % 60).padStart(2, '0')}m`
          : '--',
      dateLabel: formatDateLabel(record.date),
      amWindow: `${formatTime(record.timeInAm)} -> ${formatTime(record.timeOutAm)}`,
      pmWindow: `${formatTime(record.timeInPm)} -> ${formatTime(record.timeOutPm)}`,
      errorCount: rowErrors.length,
      errors: rowErrors.map((error) => ({
        ...error,
        errorType: describeErrorType(error.errorMessage),
        createdAtLabel: formatDateTimeLabel(error.createdAt),
      })),
      hasRemarks,
      hasMissingPunch,
      isLate,
      status,
    };
  });
}

export default function AttendanceDashboard({
  initialAttendance,
  initialPunchErrors,
  currentUserRole,
}) {
  const [attendanceRecords, setAttendanceRecords] = useState(initialAttendance);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue);
  const [selectedDate, setSelectedDate] = useState('');
  const [activeRecordId, setActiveRecordId] = useState(
    initialAttendance[0]?.id ?? null
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isEditingRemarks, setIsEditingRemarks] = useState(false);
  const [remarksDraft, setRemarksDraft] = useState('');
  const [isSavingRemarks, setIsSavingRemarks] = useState(false);
  const [remarksError, setRemarksError] = useState('');
  const normalizedRole = String(currentUserRole ?? '').trim().toLowerCase();
  const canFilterByEmployee = FULL_ATTENDANCE_ROLES.has(normalizedRole);

  const dashboardRows = buildDashboardRows(attendanceRecords, initialPunchErrors);
  const employeeOptions = [
    ...statusOptions,
    ...Array.from(
      new Map(
        dashboardRows.map((row) => [
          row.employeeId,
          {
            id: row.employeeId,
            label: `${row.fullName} (${row.employeeId})`,
          },
        ])
      ).values()
    ).sort((first, second) => first.label.localeCompare(second.label)),
  ];
  const availableDates = Array.from(new Set(dashboardRows.map((row) => row.date))).sort(
    (first, second) => second.localeCompare(first)
  );
  const availableMonths = Array.from(
    new Set(dashboardRows.map((row) => row.date?.slice(0, 7)).filter(Boolean))
  ).sort((first, second) => second.localeCompare(first));
  const monthOptions = availableMonths.map((month) => ({
    id: month,
    label: formatMonthLabel(month),
  }));

  const filteredRows = dashboardRows.filter((row) => {
    const matchesDate = selectedDate
      ? row.date === selectedDate
      : selectedMonth
        ? row.date?.startsWith(selectedMonth)
        : true;
    const matchesEmployee =
      !selectedEmployee || row.employeeId === selectedEmployee;

    return matchesDate && matchesEmployee;
  });

  const selectedRecord =
    filteredRows.find((row) => row.id === activeRecordId) ??
    dashboardRows.find((row) => row.id === activeRecordId) ??
    filteredRows[0] ??
    dashboardRows[0] ??
    null;

  const visibleErrors = initialPunchErrors
    .filter((error) =>
      selectedDate
        ? error.scanDate === selectedDate
        : selectedMonth
          ? error.scanDate?.startsWith(selectedMonth)
          : true
    )
    .map((error) => {
      const employeeRow = dashboardRows.find(
        (row) => row.employeeId === error.employeeId && row.date === error.scanDate
      );

      return {
        ...error,
        fullName: employeeRow?.fullName ?? error.fullName ?? 'Unknown employee',
        errorType: describeErrorType(error.errorMessage),
        createdAtLabel: formatDateTimeLabel(error.createdAt),
      };
    })
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt));

  const handleRowSelect = (recordId) => {
    setActiveRecordId(recordId);
    setIsDrawerOpen(true);
  };

  useEffect(() => {
    setRemarksDraft(selectedRecord?.remarks ?? '');
    setIsEditingRemarks(false);
    setRemarksError('');
  }, [selectedRecord?.id, selectedRecord?.remarks]);

  const handleSaveRemarks = async () => {
    if (!selectedRecord || isSavingRemarks) {
      return;
    }

    setIsSavingRemarks(true);
    setRemarksError('');

    try {
      const response = await fetch('/api/attendance/notes', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: selectedRecord.id,
          remarks: remarksDraft,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to save remarks right now.');
      }

      setAttendanceRecords((currentRecords) =>
        currentRecords.map((record) =>
          record.id === selectedRecord.id
            ? { ...record, remarks: payload?.remarks ?? remarksDraft.trim() }
            : record
        )
      );
      setIsEditingRemarks(false);
    } catch (error) {
      setRemarksError(error.message || 'Unable to save remarks right now.');
    } finally {
      setIsSavingRemarks(false);
    }
  };

  return (
    <section className={styles.page}>
      <div className={`${styles.tableCard} ${styles.unifiedCard}`} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'radial-gradient(circle at top right, rgba(16, 185, 129, 0.16), transparent 34%), linear-gradient(180deg, rgba(20, 184, 166, 0.08), transparent 50%), var(--color-surface)' }}>
        <div className={styles.heroCopy} style={{ margin: '0 24px', padding: '24px 0 16px', borderBottom: '1px solid var(--color-border)', marginBottom: '0' }}>
          <h1 className={styles.title}>Attendance Monitoring</h1>
          <div className={styles.heroFilters} style={{ marginTop: '16px' }}>
            <SearchableOptionSelect
              label="Month"
              value={selectedMonth}
              options={monthOptions}
              onChange={(value) => {
                setSelectedMonth(value);
                setSelectedDate('');
              }}
              placeholder="Select month"
              emptyMessage="No matching months."
            />

            <label className={styles.dateField}>
              <span className={styles.fieldLabel}>Date</span>
              <input
                className={styles.dateInput}
                type="date"
                value={selectedDate}
                min={availableDates[availableDates.length - 1] ?? undefined}
                max={availableDates[0] ?? undefined}
                onChange={(event) => {
                  const nextDate = event.target.value;
                  setSelectedDate(nextDate);
                  if (nextDate) {
                    setSelectedMonth(nextDate.slice(0, 7));
                  }
                }}
              />
            </label>

            {canFilterByEmployee ? (
              <SearchableOptionSelect
                label="Employee"
                value={selectedEmployee}
                options={employeeOptions}
                onChange={setSelectedEmployee}
                placeholder="Search employee"
                emptyMessage="No matching employees."
              />
            ) : null}
          </div>
        </div>

        <div className={styles.tableHeader} style={{ paddingTop: '12px', paddingBottom: '12px' }}>
            <div>
              <h2 className={styles.sectionTitle}>Daily Records</h2>
            </div>
            <div className={styles.headerLegend}>
              <span className={styles.legendItem}>
                <span className={`${styles.legendSwatch} ${styles.legendSuccess}`} />
                Complete
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendSwatch} ${styles.legendWarning}`} />
                Needs attention
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendSwatch} ${styles.legendDanger}`} />
                Has error
              </span>
            </div>
          </div>

          <div className={styles.tableScroller}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Morning Record</th>
                  <th>Afternoon Record</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length ? (
                  filteredRows.map((row) => (
                    <tr
                      key={row.id}
                      className={`${styles.tableRow} ${
                        selectedRecord?.id === row.id ? styles.tableRowActive : ''
                      }`}
                      onClick={() => handleRowSelect(row.id)}
                    >
                      <td>
                        <button
                          type="button"
                          className={styles.rowButton}
                          onClick={() => handleRowSelect(row.id)}
                        >
                          <span className={styles.employeeName}>{row.fullName}</span>
                          <span className={styles.employeeMeta}>
                            {row.employeeId} | {row.dateLabel}
                          </span>
                        </button>
                      </td>
                      <td>{row.amWindow}</td>
                      <td>{row.pmWindow}</td>
                      <td>{row.totalHoursLabel}</td>
                      <td>
                        <span
                          className={`${styles.statusPill} ${
                            row.status === 'Complete'
                              ? styles.statusSuccess
                              : row.status === 'Has punch error'
                                ? styles.statusDanger
                                : styles.statusWarning
                          }`}
                        >
                          {row.status}
                          {row.errorCount ? ` | ${row.errorCount}` : ''}
                        </span>
                      </td>
                      <td>
                        <span className={styles.remarksPreview}>
                          {row.remarks ? 'With remarks' : 'No remarks'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className={styles.emptyState} colSpan={6}>
                      No attendance records match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      {selectedRecord && isDrawerOpen ? (
        <div className={styles.drawerBackdrop} onClick={() => setIsDrawerOpen(false)}>
          <aside
            className={styles.drawer}
            onClick={(event) => event.stopPropagation()}
            aria-label="Attendance record details"
          >
            <div className={styles.drawerHeader}>
              <div>
                <p className={styles.eyebrow}>Record Details</p>
                <h2 className={styles.drawerTitle}>{selectedRecord.fullName}</h2>
                <p className={styles.drawerSubtitle}>
                  {selectedRecord.employeeId} | {selectedRecord.dateLabel}
                </p>
              </div>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setIsDrawerOpen(false)}
                aria-label="Close details panel"
              >
                <FiX aria-hidden="true" />
              </button>
            </div>

            <div className={styles.drawerMetrics}>
              <div className={styles.drawerMetric}>
                <span className={styles.drawerMetricLabel}>Status</span>
                <strong>{selectedRecord.status}</strong>
              </div>
              <div className={styles.drawerMetric}>
                <span className={styles.drawerMetricLabel}>Worked hours</span>
                <strong>{selectedRecord.totalHoursLabel}</strong>
              </div>
              <div className={styles.drawerMetric}>
                <span className={styles.drawerMetricLabel}>Punch errors</span>
                <strong>{selectedRecord.errorCount}</strong>
              </div>
            </div>

            <div className={styles.timelineCard}>
              <div className={styles.timelineRow}>
                <span className={styles.timelineLabel}>AM Session</span>
                <strong>{selectedRecord.amWindow}</strong>
              </div>
              <div className={styles.timelineRow}>
                <span className={styles.timelineLabel}>PM Session</span>
                <strong>{selectedRecord.pmWindow}</strong>
              </div>
              <div className={styles.timelineRow}>
                <span className={styles.timelineLabel}>Remarks</span>
                <p className={styles.drawerText}>
                  {selectedRecord.remarks || 'No remarks attached to this record.'}
                </p>
              </div>
            </div>

            <div className={styles.drawerSection}>
              <div className={styles.drawerSectionHeader}>
                <FiMessageSquare aria-hidden="true" />
                <h3>Error History</h3>
              </div>
              {selectedRecord.errors.length ? (
                <div className={styles.drawerErrorList}>
                  {selectedRecord.errors.map((error) => (
                    <article key={error.id} className={styles.drawerErrorCard}>
                      <div className={styles.drawerErrorMeta}>
                        <span>{error.errorType}</span>
                        <span>{error.createdAtLabel}</span>
                      </div>
                      <p className={styles.drawerText}>{error.errorMessage}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className={styles.drawerText}>No punch errors tied to this record.</p>
              )}
            </div>

            <div className={styles.drawerSection}>
              {isEditingRemarks ? (
                <div className={styles.remarksEditor}>
                  <textarea
                    className={styles.remarksTextarea}
                    value={remarksDraft}
                    onChange={(event) => setRemarksDraft(event.target.value)}
                    placeholder="Add remarks for this attendance record."
                  />
                  {remarksError ? (
                    <p className={styles.remarksError}>{remarksError}</p>
                  ) : null}
                  <div className={styles.remarksActions}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={handleSaveRemarks}
                      disabled={isSavingRemarks}
                    >
                      {isSavingRemarks ? 'Saving...' : 'Save remarks'}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => {
                        setRemarksDraft(selectedRecord.remarks ?? '');
                        setIsEditingRemarks(false);
                        setRemarksError('');
                      }}
                      disabled={isSavingRemarks}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => setIsEditingRemarks(true)}
                >
                  {selectedRecord.remarks ? 'Edit remarks' : 'Add remarks'}
                </button>
              )}
            </div>

          </aside>
        </div>
      ) : null}
    </section>
  );
}
