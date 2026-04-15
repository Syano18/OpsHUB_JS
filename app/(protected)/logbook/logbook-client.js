'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { FiChevronDown, FiDownload, FiPlus, FiSearch } from 'react-icons/fi';
import ToastStack from '@/components/shared/toast-stack';
import styles from './logbook.module.css';

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

function DropdownField({ label, value, options, onChange, placeholder }) {
  const listId = useId();
  const containerRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
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

      <button
        type="button"
        className={styles.exportDropdownButton}
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={listId}
      >
        <span className={selectedOption ? styles.exportDropdownValue : styles.exportDropdownPlaceholder}>
          {selectedOption?.label ?? placeholder}
        </span>
        <FiChevronDown className={styles.exportDropdownIcon} />
      </button>

      {isOpen ? (
        <div id={listId} className={styles.exportDropdownMenu} role="listbox">
          <div className={styles.exportDropdownScroll}>
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`${styles.exportDropdownOption} ${
                  option.value === value ? styles.exportDropdownOptionSelected : ''
                }`}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                role="option"
                aria-selected={option.value === value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function LogbookClient({ entries, loadError, toast }) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [isExportFilterOpen, setIsExportFilterOpen] = useState(false);
  const [exportMode, setExportMode] = useState('all');
  const [exportYear, setExportYear] = useState('');
  const [exportMonth, setExportMonth] = useState('');

  const filteredEntries = entries.filter((entry) => matchesSearch(entry, searchTerm));
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

    showToastOnce('error', loadError);
  }, [loadError]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    if (toast === 'edit-restricted') {
      showToastOnce('error', 'You can only edit records that you encoded.');
    } else if (toast === 'record-updated') {
      showToastOnce('success', 'The logbook record was updated successfully.');
    }

    router.replace('/logbook');
  }, [router, toast]);

  const dismissToast = useCallback((toastId) => {
    setToasts((currentToasts) =>
      currentToasts.filter((item) => item.id !== toastId)
    );
  }, []);

  const showToast = (type, message, duration = 4200) => {
    const toastId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    setToasts((currentToasts) => [
      ...currentToasts,
      { id: toastId, message, type, duration },
    ]);
  };

  const showToastOnce = (type, message, duration = 4200) => {
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
  };

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
      if (!exportYear && exportYears.length) {
        setExportYear(String(exportYears[0]));
      }
      return;
    }

    if (nextMode === 'month') {
      if (!exportYear && exportYears.length) {
        setExportYear(String(exportYears[0]));
      }

      if (!exportMonth) {
        setExportMonth('01');
      }
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

  const handleEditClick = () => {
    if (!contextMenu?.entryId) {
      return;
    }

    router.push(`/logbook/${contextMenu.entryId}/edit`);
    setContextMenu(null);
  };

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <div className={styles.toolbarCard}>
        <div className={styles.toolbarInfo}>
          <div className={styles.headingBlock}>
            <h1 className={styles.title}>Digital Logbook</h1>
          </div>

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
          </div>
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

          <Link href="/logbook/new" className={styles.primaryButton}>
            <FiPlus />
            <span>New Record</span>
          </Link>
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
              <button type="button" className={styles.exportDialogClose} onClick={closeExportFilter}>
                ×
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
                      label: new Date(2000, month - 1, 1).toLocaleString('en-US', {
                        month: 'long',
                      }),
                    })
                  )}
                />
              ) : null}
            </div>

            <div className={styles.exportDialogActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => {
                resetExportFilter();
                closeExportFilter();
              }}>
                Cancel
              </button>
              <button type="button" className={styles.primaryButton} onClick={handleConfirmExport}>
                <FiDownload />
                <span>Export</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={styles.tableCard}>
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
                  <tr key={entry.id} onContextMenu={(event) => handleRowContextMenu(event, entry)}>
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
            <button type="button" className={styles.rowContextAction} onClick={handleEditClick}>
              Edit
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
