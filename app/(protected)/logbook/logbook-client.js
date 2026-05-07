'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useDeferredValue, useEffect, useId, useRef, useState } from 'react';
import {
  FiChevronDown,
  FiDownload,
  FiLoader,
  FiPlus,
  FiSearch,
} from 'react-icons/fi';
import ToastStack from '@/components/shared/toast-stack';
import NewRecordForm from './new/new-record-form';
import styles from './logbook.module.css';

const BACKDATED_INSERT_ROLES = new Set(['super_admin', 'admin', 'pacd']);
const CSV_HEADERS = [
  'Timestamp',
  'Reference Number',
  'Particulars',
  'Addressee',
  'Transmitter',
  'Section',
  'Mode of Transmittal',
  'Remarks',
  'Encoded By',
];

function matchesSearch(entry, term) {
  const normalizedTerm = term.trim().toLowerCase();

  if (!normalizedTerm) {
    return true;
  }

  return [
    entry.timestamp,
    entry.referenceNumber,
    entry.particulars,
    entry.addressee,
    entry.transmitter,
    entry.section,
    entry.modeOfTransmittal,
    entry.remarks,
    entry.encodedBy,
  ].some((value) => String(value ?? '').toLowerCase().includes(normalizedTerm));
}

function escapeCsvValue(value) {
  const text = String(value ?? '');

  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function getEntryDateParts(timestamp) {
  const rawTimestamp = String(timestamp ?? '').trim();

  if (!rawTimestamp) {
    return null;
  }

  const isoMatch = rawTimestamp.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoMatch) {
    return {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
    };
  }

  const parsedDate = new Date(rawTimestamp);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return {
    year: parsedDate.getFullYear(),
    month: parsedDate.getMonth() + 1,
  };
}

function formatMonthValue(month) {
  return String(month).padStart(2, '0');
}

function buildExportFileName(mode, year, month) {
  if (mode === 'year' && year) {
    return `digital-logbook-year-${year}.csv`;
  }

  if (mode === 'month' && year && month) {
    return `digital-logbook-${year}-${month}.csv`;
  }

  return 'digital-logbook-all-records.csv';
}

function canBackdate(role) {
  return BACKDATED_INSERT_ROLES.has(String(role ?? '').trim().toLowerCase());
}

function splitStoredListValue(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function DropdownField({ label, value, options, onChange, placeholder }) {
  const listId = useId();
  const containerRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const selectedOption = options.find((option) => option.value === value);
  const inputValue = isOpen ? query : selectedOption?.label ?? '';
  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(deferredQuery.trim().toLowerCase())
  );

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

      const handlePointerDown = (event) => {
        if (!containerRef.current?.contains(event.target)) {
          setIsOpen(false);
          setQuery('');
        }
      };

      const handleEscape = (event) => {
        if (event.key === 'Escape') {
          setIsOpen(false);
          setQuery('');
        }
      };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  return (
      <div ref={containerRef} className={styles.exportDropdownField}>
        <span className={styles.exportFilterLabel}>{label}</span>

        <div className={styles.exportDropdownButton}>
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
                  onChange(filteredOptions[0].value);
                  setIsOpen(false);
                  setQuery('');
                }
              }

              if (event.key === 'Escape') {
                setIsOpen(false);
                setQuery('');
              }
            }}
            placeholder={placeholder}
            className={styles.exportDropdownInput}
          />
          <button
            type="button"
            className={styles.exportDropdownToggle}
            onClick={() => {
              setIsOpen((open) => !open);
              setQuery('');
            }}
            aria-label={`Toggle ${label} options`}
          >
          <FiChevronDown className={styles.exportDropdownIcon} />
          </button>
        </div>

        {isOpen ? (
          <div id={listId} className={styles.exportDropdownMenu} role="listbox">
            <div className={styles.exportDropdownScroll}>
              {filteredOptions.length ? (
                filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`${styles.exportDropdownOption} ${
                      option.value === value
                        ? styles.exportDropdownOptionSelected
                        : ''
                    }`}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                      setQuery('');
                    }}
                    role="option"
                    aria-selected={option.value === value}
                  >
                    {option.label}
                  </button>
                ))
              ) : (
                <p className={styles.exportDropdownEmpty}>No matching options.</p>
              )}
            </div>
          </div>
        ) : null}
    </div>
  );
}

export default function LogbookClient({
  entries,
  loadError,
  toast,
  currentUserRole,
  transmitterOptions,
  addresseeOptions,
  sectionOptions,
  modeOptions,
  }) {
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState('');
    const [filterMonth, setFilterMonth] = useState(() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
  const [contextMenu, setContextMenu] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [isExportFilterOpen, setIsExportFilterOpen] = useState(false);
  const [activeDialog, setActiveDialog] = useState(null);
  const [editEntryId, setEditEntryId] = useState(null);
  const [editInitialFormData, setEditInitialFormData] = useState(null);
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [editLoadError, setEditLoadError] = useState('');
  const [exportMode, setExportMode] = useState('all');
  const [exportYear, setExportYear] = useState('');
  const [exportMonth, setExportMonth] = useState('');
  const isBackdatingAllowed = canBackdate(currentUserRole);

  const entriesInView = searchTerm.trim()
    ? entries
    : filterMonth
      ? entries.filter((entry) => {
          const dateParts = getEntryDateParts(entry.timestamp);
          if (!dateParts) return false;
          const entryMonthStr = `${dateParts.year}-${String(dateParts.month).padStart(2, '0')}`;
          return entryMonthStr === filterMonth;
        })
      : entries;

  const filteredEntries = entriesInView.filter((entry) =>
    matchesSearch(entry, searchTerm)
  );
  const exportYears = Array.from(
    new Set(
      entries
        .map((entry) => getEntryDateParts(entry.timestamp)?.year)
        .filter(Boolean)
    )
  ).sort((left, right) => right - left);

  const exportableEntries = filteredEntries.filter((entry) => {
    if (exportMode === 'all') {
      return true;
    }

    const dateParts = getEntryDateParts(entry.timestamp);

    if (!dateParts) {
      return false;
    }

    if (exportMode === 'year') {
      return exportYear && String(dateParts.year) === exportYear;
    }

    if (exportMode === 'month') {
      return (
        exportYear &&
        exportMonth &&
        String(dateParts.year) === exportYear &&
        formatMonthValue(dateParts.month) === exportMonth
      );
    }

    return true;
  });

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

  const showToastOnce = useCallback(
    (type, message, duration = 4200) => {
      const storageKey = `logbook-toast:${type}:${message}`;

      try {
        if (typeof window !== 'undefined') {
          const lastToast = window.sessionStorage.getItem(storageKey);

          if (lastToast === 'shown') {
            return;
          }

          window.sessionStorage.setItem(storageKey, 'shown');
          window.setTimeout(() => {
            window.sessionStorage.removeItem(storageKey);
          }, 1500);
        }
      } catch {
        // Ignore storage access issues and fall back to showing the toast.
      }

      showToast(type, message, duration);
    },
    [showToast]
  );

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const closeMenu = () => {
      setContextMenu(null);
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    window.addEventListener('click', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!loadError) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      showToastOnce('error', loadError);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadError, showToastOnce]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (toast === 'edit-restricted') {
        showToastOnce('error', 'You can only edit records that you encoded.');
      } else if (toast === 'record-updated') {
        showToastOnce(
          'success',
          'The logbook record was updated successfully.'
        );
      }
    }, 0);

    router.replace('/logbook');

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [router, showToastOnce, toast]);

  const dismissToast = useCallback((toastId) => {
    setToasts((currentToasts) =>
      currentToasts.filter((item) => item.id !== toastId)
    );
  }, []);

  const closeRecordDialog = useCallback(() => {
    setActiveDialog(null);
    setEditEntryId(null);
    setEditInitialFormData(null);
    setEditLoadError('');
    setIsEditLoading(false);
  }, []);

  const handleExport = () => {
    const rows = exportableEntries.map((entry) => [
      entry.timestamp ?? '',
      entry.referenceNumber ?? '',
      entry.particulars ?? '',
      entry.addressee ?? '',
      entry.transmitter ?? '',
      entry.section ?? '',
      entry.modeOfTransmittal ?? '',
      entry.remarks ?? '',
      entry.encodedBy ?? '',
    ]);

    const csvContent = [
      CSV_HEADERS.map(escapeCsvValue).join(','),
      ...rows.map((row) => row.map(escapeCsvValue).join(',')),
    ].join('\n');

    const csvBlob = new Blob([csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const downloadUrl = URL.createObjectURL(csvBlob);
    const link = document.createElement('a');

    link.href = downloadUrl;
    link.download = buildExportFileName(exportMode, exportYear, exportMonth);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  };

  const openExportFilter = () => {
    setIsExportFilterOpen(true);
  };

  const closeExportFilter = () => {
    resetExportFilter();
    setIsExportFilterOpen(false);
  };

  const resetExportFilter = () => {
    setExportMode('all');
    setExportYear('');
    setExportMonth('');
  };

  const handleExportModeChange = (nextMode) => {
    setExportMode(nextMode);

    if (nextMode === 'all') {
      setExportYear('');
      setExportMonth('');
      return;
    }

    if (nextMode === 'year') {
      setExportMonth('');
      return;
    }

    if (nextMode === 'month') {
      setExportMonth('');
    }
  };

  const handleConfirmExport = () => {
    if (exportMode !== 'all' && !exportYear) {
      showToastOnce('warning', 'Please select a year for the export filter.');
      return;
    }

    if (exportMode === 'month' && !exportMonth) {
      showToastOnce('warning', 'Please select a month for the export filter.');
      return;
    }

    if (!exportableEntries.length) {
      showToastOnce('warning', 'No records match the selected export filter.');
      return;
    }

    handleExport();
    closeExportFilter();
  };

  const handleRowContextMenu = (event, entry) => {
    event.preventDefault();

    setContextMenu({
      entryId: entry.id,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const openNewDialog = () => {
    setActiveDialog('new');
    setContextMenu(null);
    setEditEntryId(null);
    setEditInitialFormData(null);
    setEditLoadError('');
    setIsEditLoading(false);
  };

  const handleEditClick = async () => {
    if (!contextMenu?.entryId || isEditLoading) {
      return;
    }

    const nextEntryId = contextMenu.entryId;

    setContextMenu(null);
    setActiveDialog('edit');
    setEditEntryId(nextEntryId);
    setEditInitialFormData(null);
    setEditLoadError('');
    setIsEditLoading(true);

    try {
      const response = await fetch(`/api/logbook/${nextEntryId}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || 'Unable to load the logbook record right now.'
        );
      }

      const entry = data.entry;

      setEditInitialFormData({
        particulars: entry?.particulars ?? '',
        addressee: splitStoredListValue(entry?.addressee),
        transmitter: entry?.transmitter ?? '',
        section: entry?.section ?? '',
        modeOfTransmittal: splitStoredListValue(entry?.modeOfTransmittal),
        remarks: entry?.remarks ?? '',
      });
    } catch (error) {
      const errorMessage =
        error.message || 'Unable to load the logbook record right now.';

      setEditLoadError(errorMessage);
      showToast('error', errorMessage);
    } finally {
      setIsEditLoading(false);
    }
  };

  const handleInsertClick = () => {
    if (!isBackdatingAllowed) {
      return;
    }

    setActiveDialog('insert');
    setContextMenu(null);
    setEditEntryId(null);
    setEditInitialFormData(null);
    setEditLoadError('');
    setIsEditLoading(false);
  };

  const handleCreateSuccess = (data) => {
    closeRecordDialog();
    showToast(
      'success',
      data?.message || 'The logbook record was saved successfully.'
    );
  };

  const handleUpdateSuccess = (data) => {
    closeRecordDialog();
    showToast(
      'success',
      data?.message || 'The logbook record was updated successfully.'
    );
  };

  const isRecordDialogOpen =
    activeDialog === 'new' ||
    activeDialog === 'insert' ||
    activeDialog === 'edit';
  const isInsertDialog = activeDialog === 'insert';
  const isEditDialog = activeDialog === 'edit';
  const dialogTitle = isInsertDialog
    ? 'Insert Backdated Record'
    : isEditDialog
      ? 'Edit Record'
      : 'New Record';
  const dialogText = isInsertDialog
    ? 'Add a missing earlier logbook entry with a custom reference number and timestamp.'
    : isEditDialog
      ? 'Update the selected routing details.'
      : 'Capture the routing details and save a new logbook entry.';

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {isRecordDialogOpen ? (
        <div
          className={styles.insertDialogBackdrop}
          role="presentation"
        >
          <div
            className={styles.insertDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-dialog-title"
          >
            <div className={styles.insertDialogHeader}>
              <div>
                <p className={styles.insertDialogEyebrow}>Digital Logbook</p>
                <h2 id="record-dialog-title" className={styles.insertDialogTitle}>
                  {dialogTitle}
                </h2>
                <p className={styles.insertDialogText}>{dialogText}</p>
              </div>
              <button
                type="button"
                className={styles.exportDialogClose}
                onClick={closeRecordDialog}
              >
                &times;
              </button>
            </div>

            <div className={styles.insertDialogBody}>
              {isEditDialog && isEditLoading ? (
                <div className={styles.recordDialogState}>
                  <FiLoader className={styles.recordDialogSpinner} />
                  <p className={styles.recordDialogStateTitle}>Loading record</p>
                  <p className={styles.recordDialogStateText}>
                    Fetching the selected logbook entry for editing.
                  </p>
                </div>
              ) : isEditDialog && editLoadError ? (
                <div className={styles.recordDialogState}>
                  <p className={styles.recordDialogStateTitle}>
                    Unable to open record
                  </p>
                  <p className={styles.recordDialogStateText}>{editLoadError}</p>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={closeRecordDialog}
                  >
                    Close
                  </button>
                </div>
              ) : isEditDialog && !editInitialFormData ? null : (
                <NewRecordForm
                  transmitterOptions={transmitterOptions}
                  addresseeOptions={addresseeOptions}
                  sectionOptions={sectionOptions}
                  modeOptions={modeOptions}
                  initialFormData={isEditDialog ? editInitialFormData : undefined}
                  submitUrl={
                    isInsertDialog
                      ? '/api/logbook/backdated'
                      : isEditDialog
                        ? `/api/logbook/${editEntryId}`
                        : '/api/logbook'
                  }
                  submitMethod={isEditDialog ? 'PUT' : 'POST'}
                  submitLabel={
                    isInsertDialog
                      ? 'Insert Record'
                      : isEditDialog
                        ? 'Update Record'
                        : 'Save Record'
                  }
                  showBackdatingFields={isInsertDialog}
                  showBackLink={false}
                  onCancel={closeRecordDialog}
                  cancelLabel="Close"
                  onSuccess={
                    isEditDialog ? handleUpdateSuccess : handleCreateSuccess
                  }
                />
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className={styles.tableCard} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'radial-gradient(circle at top right, rgba(16, 185, 129, 0.16), transparent 34%), linear-gradient(180deg, rgba(20, 184, 166, 0.08), transparent 50%), var(--color-surface)' }}>
        <div style={{ padding: '24px 24px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <div className={styles.headingBlock}>
            <h1 className={styles.title}>Digital Logbook</h1>
          </div>

          <div className={styles.toolbarFilters} style={{ marginTop: '16px' }}>
          <div className={styles.searchWrap}>
            <label className={styles.searchField}>
              <FiSearch className={styles.searchIcon} />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by reference, particulars, addressee, section..."
                className={styles.searchInput}
              />
            </label>
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className={styles.monthField}
              aria-label="Filter by month"
            />
          </div>

          <div className={styles.actionGroup}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={openExportFilter}
              disabled={loadError || !filteredEntries.length}
            >
              <FiDownload />
              <span>Export</span>
            </button>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={openNewDialog}
            >
              <FiPlus />
              <span>New Record</span>
            </button>
          </div>
        </div>
        </div>

      {isExportFilterOpen ? (
        <div
          className={styles.exportDialogBackdrop}
          role="presentation"
          onMouseDown={closeExportFilter}
        >
          <div
            className={styles.exportDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-logbook-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.exportDialogHeader}>
              <div>
                <p className={styles.exportDialogEyebrow}>Export Logbook</p>
                <h2 id="export-logbook-title" className={styles.exportDialogTitle}>
                  Choose a filter before exporting
                </h2>
              </div>
              <button
                type="button"
                className={styles.exportDialogClose}
                onClick={closeExportFilter}
              >
                &times;
              </button>
            </div>

            <div className={styles.exportDialogBody}>
              <DropdownField
                label="Filter type"
                value={exportMode}
                onChange={handleExportModeChange}
                placeholder="Choose filter type"
                options={[
                  { value: 'all', label: 'All records' },
                  { value: 'year', label: 'By year' },
                  { value: 'month', label: 'By month' },
                ]}
              />

              {exportMode !== 'all' ? (
                <DropdownField
                  label="Year"
                  value={exportYear}
                  onChange={setExportYear}
                  placeholder="Select year"
                  options={exportYears.map((year) => ({
                    value: String(year),
                    label: String(year),
                  }))}
                />
              ) : null}

              {exportMode === 'month' ? (
                <DropdownField
                  label="Month"
                  value={exportMonth}
                  onChange={setExportMonth}
                  placeholder="Select month"
                  options={Array.from({ length: 12 }, (_, index) => index + 1).map(
                    (month) => ({
                      value: formatMonthValue(month),
                      label: new Date(2000, month - 1, 1).toLocaleString(
                        'en-US',
                        {
                          month: 'long',
                        }
                      ),
                    })
                  )}
                />
              ) : null}
            </div>

            <div className={styles.exportDialogActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  resetExportFilter();
                  closeExportFilter();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleConfirmExport}
              >
                <FiDownload />
                <span>Export</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {loadError ? (
          <p className={styles.emptyText}>
            Unable to load logbook records right now.
          </p>
        ) : !filteredEntries.length ? (
          <p className={styles.emptyText}>
            {entries.length
              ? 'No records match your search.'
              : 'No logbook records found.'}
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Reference Number</th>
                  <th>Particulars</th>
                  <th>Addressee</th>
                  <th>Transmitter</th>
                  <th>Section</th>
                  <th>Mode of Transmittal</th>
                  <th>Remarks</th>
                  <th>Encoded By</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    onContextMenu={(event) => handleRowContextMenu(event, entry)}
                  >
                    <td>{entry.timestamp || '-'}</td>
                    <td>{entry.referenceNumber || '-'}</td>
                    <td>{entry.particulars || '-'}</td>
                    <td>{entry.addressee || '-'}</td>
                    <td>{entry.transmitter || '-'}</td>
                    <td>{entry.section || '-'}</td>
                    <td>{entry.modeOfTransmittal || '-'}</td>
                    <td>{entry.remarks || '-'}</td>
                    <td>{entry.encodedBy || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {contextMenu ? (
          <div
            className={styles.rowContextMenu}
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
            }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            {isBackdatingAllowed ? (
              <button
                type="button"
                className={styles.rowContextAction}
                onClick={handleInsertClick}
              >
                Insert
              </button>
            ) : null}
            <button
              type="button"
              className={styles.rowContextAction}
              onClick={handleEditClick}
            >
              Edit
            </button>
          </div>
        ) : null}
      </div>
      </div>
    </>
  );
}
