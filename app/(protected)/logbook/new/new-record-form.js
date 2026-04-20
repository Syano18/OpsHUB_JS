'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useEffect, useId, useRef, useState } from 'react';
import {
  FiArrowLeft,
  FiCheck,
  FiChevronDown,
  FiSave,
  FiSearch,
  FiX,
} from 'react-icons/fi';
import styles from './new-record-form.module.css';
import ToastStack from '@/components/shared/toast-stack';

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

const MULTI_SELECT_MEMORY_LIMIT = 12;
const DEFAULT_FORM_DATA = {
  referenceNumber: '',
  timestamp: '',
  particulars: '',
  addressee: [],
  transmitter: '',
  section: '',
  modeOfTransmittal: [],
  remarks: '',
};

function buildComboStorageKey(memoryKey) {
  return `logbook-multiselect-memory:${memoryKey}`;
}

function loadStoredCombos(memoryKey) {
  if (typeof window === 'undefined' || !memoryKey) {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(buildComboStorageKey(memoryKey));

    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .filter(Array.isArray)
      .map((combo) =>
        combo.map((value) => String(value ?? '').trim()).filter(Boolean)
      )
      .filter((combo) => combo.length > 1);
  } catch {
    return [];
  }
}

function saveStoredCombo(memoryKey, values) {
  if (typeof window === 'undefined' || !memoryKey || !Array.isArray(values)) {
    return;
  }

  const normalizedValues = values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);

  if (normalizedValues.length < 2) {
    return;
  }

  const normalizedKey = normalizedValues.map((value) => value.toLowerCase()).join('||');
  const existingCombos = loadStoredCombos(memoryKey);
  const nextCombos = [
    normalizedValues,
    ...existingCombos.filter(
      (combo) =>
        combo.map((value) => value.toLowerCase()).join('||') !== normalizedKey
    ),
  ].slice(0, MULTI_SELECT_MEMORY_LIMIT);

  try {
    window.localStorage.setItem(
      buildComboStorageKey(memoryKey),
      JSON.stringify(nextCombos)
    );
  } catch {
    // Ignore storage issues and continue without saved combinations.
  }
}

function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
  required = false,
  error = '',
  createLabel = '',
  onCreateOption = null,
  isCreatingOption = false,
  createOptionHint = '',
}) {
  const listId = useId();
  const containerRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const deferredQuery = useDeferredValue(query);
  const inputValue = isOpen ? query : value;

  useCloseOnOutsideClick(containerRef, () => {
    setIsOpen(false);
    setQuery(value);
  });

  const filteredOptions = options
    .filter((option) =>
      option.toLowerCase().includes(deferredQuery.trim().toLowerCase())
    );
  const trimmedQuery = query.trim();
  const canCreateOption =
    Boolean(onCreateOption) &&
    Boolean(trimmedQuery) &&
    !options.some((option) => option.toLowerCase() === trimmedQuery.toLowerCase());

  const selectOption = (option) => {
    onChange(option);
    setQuery(option);
    setIsOpen(false);
  };

  return (
    <div className={styles.fieldGroup}>
      <label className={styles.fieldLabel}>
        {label}
        {required ? <span className={styles.required}>*</span> : null}
      </label>

      <div ref={containerRef} className={styles.dropdownShell}>
        <div
          className={`${styles.searchableControl} ${
            isOpen ? styles.searchableControlOpen : ''
          } ${error ? styles.searchableControlError : ''}`}
        >
          <FiSearch className={styles.controlIcon} />
          <input
            type="text"
            value={inputValue}
            onChange={(event) => {
              const nextValue = event.target.value;

              setQuery(nextValue);
              setIsOpen(true);

              if (!nextValue.trim()) {
                onChange('');
              } else if (options.includes(nextValue)) {
                onChange(nextValue);
              } else if (value) {
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
              <>
                {filteredOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`${styles.optionButton} ${
                      option === value ? styles.optionButtonSelected : ''
                    }`}
                    onClick={() => selectOption(option)}
                  >
                    <span>{option}</span>
                    {option === value ? <FiCheck /> : null}
                  </button>
                ))}
                {canCreateOption ? (
                  <button
                    type="button"
                    className={`${styles.optionButton} ${styles.createOptionButton}`}
                    onClick={() => onCreateOption(trimmedQuery)}
                    disabled={isCreatingOption}
                  >
                    <span>
                      {isCreatingOption
                        ? `Adding ${createLabel || label}...`
                        : `Add ${createLabel || label}: ${trimmedQuery}`}
                    </span>
                    <FiPlusBadge />
                  </button>
                ) : null}
              </>
            ) : (
              <>
                {canCreateOption ? (
                  <button
                    type="button"
                    className={`${styles.optionButton} ${styles.createOptionButton}`}
                    onClick={() => onCreateOption(trimmedQuery)}
                    disabled={isCreatingOption}
                  >
                    <span>
                      {isCreatingOption
                        ? `Adding ${createLabel || label}...`
                        : `Add ${createLabel || label}: ${trimmedQuery}`}
                    </span>
                    <FiPlusBadge />
                  </button>
                ) : (
                  <p className={styles.optionEmpty}>No matching options.</p>
                )}
                {createOptionHint ? (
                  <p className={styles.optionHint}>{createOptionHint}</p>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>

      {error ? <p className={styles.fieldError}>{error}</p> : null}
    </div>
  );
}

function MultiSelectDropdown({
  label,
  values,
  options,
  onChange,
  placeholder,
  required = false,
  error = '',
  createLabel = '',
  onCreateOption = null,
  isCreatingOption = false,
  createOptionHint = '',
  selectionLabel = 'option',
  emptyHint = '',
  comboSuggestions = [],
  onApplyComboSuggestion = null,
  comboSuggestionLabel = 'Saved combinations',
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
      option.toLowerCase().includes(deferredQuery.trim().toLowerCase())
    );
  const trimmedQuery = query.trim();
  const canCreateOption =
    Boolean(onCreateOption) &&
    Boolean(trimmedQuery) &&
    !options.some((option) => option.toLowerCase() === trimmedQuery.toLowerCase());
  const filteredComboSuggestions = trimmedQuery
    ? comboSuggestions.filter((combo) => {
        const comboKey = combo.map((value) => value.toLowerCase()).join('||');
        const currentKey = values.map((value) => value.toLowerCase()).join('||');

        if (!combo.length || comboKey === currentKey) {
          return false;
        }

        return combo.some((option) =>
          option.toLowerCase().includes(trimmedQuery.toLowerCase())
        );
      })
    : [];

  const addValue = (option) => {
    if (!values.includes(option)) {
      onChange([...values, option]);
    }

    setQuery('');
    setIsOpen(true);
  };

  const removeValue = (optionToRemove) => {
    onChange(values.filter((option) => option !== optionToRemove));
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
              onFocus={() => setIsOpen(true)}
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
            {filteredComboSuggestions.length ? (
              <div className={styles.comboSuggestionGroup}>
                <p className={styles.comboSuggestionLabel}>{comboSuggestionLabel}</p>
                {filteredComboSuggestions.map((combo) => (
                  <button
                    key={combo.join('||')}
                    type="button"
                    className={styles.comboSuggestionButton}
                    onClick={() => onApplyComboSuggestion?.(combo)}
                  >
                    <span>{combo.join(', ')}</span>
                    <span className={styles.comboSuggestionBadge}>Use</span>
                  </button>
                ))}
              </div>
            ) : null}

            {filteredOptions.length ? (
              <>
                {filteredOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={styles.optionButton}
                    onClick={() => addValue(option)}
                  >
                    <span>{option}</span>
                    <FiPlusBadge />
                  </button>
                ))}
                {canCreateOption ? (
                  <button
                    type="button"
                    className={`${styles.optionButton} ${styles.createOptionButton}`}
                    onClick={() => onCreateOption(trimmedQuery)}
                    disabled={isCreatingOption}
                  >
                    <span>
                      {isCreatingOption
                        ? `Adding ${createLabel || label}...`
                        : `Add ${createLabel || label}: ${trimmedQuery}`}
                    </span>
                    <FiPlusBadge />
                  </button>
                ) : null}
              </>
            ) : (
              <>
                {canCreateOption ? (
                  <button
                    type="button"
                    className={`${styles.optionButton} ${styles.createOptionButton}`}
                    onClick={() => onCreateOption(trimmedQuery)}
                    disabled={isCreatingOption}
                  >
                    <span>
                      {isCreatingOption
                        ? `Adding ${createLabel || label}...`
                        : `Add ${createLabel || label}: ${trimmedQuery}`}
                    </span>
                    <FiPlusBadge />
                  </button>
                ) : (
                  <p className={styles.optionEmpty}>
                    {values.length === options.length
                      ? 'All modes selected.'
                      : 'No matching modes.'}
                  </p>
                )}
                {createOptionHint ? (
                  <p className={styles.optionHint}>{createOptionHint}</p>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>

      <p className={styles.fieldHint}>
        {values.length
          ? `${values.length} ${selectionLabel}${values.length === 1 ? '' : 's'} selected`
          : emptyHint || `Choose one or more ${label.toLowerCase()} values.`}
      </p>
      {error ? <p className={styles.fieldError}>{error}</p> : null}
    </div>
  );
}

function FiPlusBadge() {
  return <span className={styles.plusBadge}>+</span>;
}

function buildErrors(formData) {
  const nextErrors = {};

  if (!formData.particulars.trim()) {
    nextErrors.particulars = 'Particulars is required.';
  }

  if (!formData.addressee.length) {
    nextErrors.addressee = 'Select at least one addressee.';
  }

  if (!formData.transmitter.trim()) {
    nextErrors.transmitter = 'Please choose a transmitter.';
  }

  if (!formData.section.trim()) {
    nextErrors.section = 'Please choose a section.';
  }

  if (!formData.modeOfTransmittal.length) {
    nextErrors.modeOfTransmittal = 'Select at least one mode of transmittal.';
  }

  if (formData.referenceNumberEnabled && !formData.referenceNumber.trim()) {
    nextErrors.referenceNumber = 'Reference Number is required.';
  }

  if (formData.timestampEnabled) {
    const trimmedTimestamp = formData.timestamp.trim();

    if (!trimmedTimestamp) {
      nextErrors.timestamp = 'Timestamp is required.';
    } else if (Number.isNaN(new Date(trimmedTimestamp).getTime())) {
      nextErrors.timestamp = 'Please enter a valid timestamp.';
    }
  }

  return nextErrors;
}

function resolveInitialFormData(initialFormData) {
  return {
    referenceNumber: String(
      initialFormData?.referenceNumber ?? DEFAULT_FORM_DATA.referenceNumber
    ),
    timestamp: String(initialFormData?.timestamp ?? DEFAULT_FORM_DATA.timestamp),
    particulars: String(
      initialFormData?.particulars ?? DEFAULT_FORM_DATA.particulars
    ),
    addressee: Array.isArray(initialFormData?.addressee)
      ? initialFormData.addressee
          .map((value) => String(value ?? '').trim())
          .filter(Boolean)
      : DEFAULT_FORM_DATA.addressee,
    transmitter: String(
      initialFormData?.transmitter ?? DEFAULT_FORM_DATA.transmitter
    ),
    section: String(initialFormData?.section ?? DEFAULT_FORM_DATA.section),
    modeOfTransmittal: Array.isArray(initialFormData?.modeOfTransmittal)
      ? initialFormData.modeOfTransmittal
          .map((value) => String(value ?? '').trim())
          .filter(Boolean)
      : DEFAULT_FORM_DATA.modeOfTransmittal,
    remarks: String(initialFormData?.remarks ?? DEFAULT_FORM_DATA.remarks),
  };
}

export default function NewRecordForm({
  transmitterOptions = [],
  addresseeOptions = [],
  sectionOptions = [],
  modeOptions = [],
  initialFormData,
  submitUrl = '/api/logbook',
  submitMethod = 'POST',
  submitLabel = 'Save Record',
  successMessage = 'The logbook record was saved successfully.',
  successRedirectUrl = null,
  onSuccess = null,
  onCancel = null,
  cancelLabel = 'Cancel',
  showBackLink = true,
  backHref = '/logbook',
  showBackdatingFields = false,
}) {
  const [formData, setFormData] = useState(() =>
    resolveInitialFormData(initialFormData)
  );
  const [localAddresseeOptions, setLocalAddresseeOptions] =
    useState(addresseeOptions);
  const [localSectionOptions, setLocalSectionOptions] = useState(sectionOptions);
  const [localModeOptions, setLocalModeOptions] = useState(modeOptions);
  const [savedAddresseeCombos, setSavedAddresseeCombos] = useState([]);
  const [savedModeCombos, setSavedModeCombos] = useState([]);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddingAddressee, setIsAddingAddressee] = useState(false);
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [pendingCreateOption, setPendingCreateOption] = useState(null);
  const [toasts, setToasts] = useState([]);
  const toastTimeoutsRef = useRef(new Map());
  const router = useRouter();

  useEffect(() => {
    const toastTimeouts = toastTimeoutsRef.current;

    return () => {
      toastTimeouts.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });

      toastTimeouts.clear();
    };
  }, []);

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

  useEffect(() => {
    setFormData(resolveInitialFormData(initialFormData));
    setErrors({});
  }, [initialFormData]);

  useEffect(() => {
    setLocalAddresseeOptions(addresseeOptions);
  }, [addresseeOptions]);

  useEffect(() => {
    setLocalSectionOptions(sectionOptions);
  }, [sectionOptions]);

  useEffect(() => {
    setLocalModeOptions(modeOptions);
  }, [modeOptions]);

  useEffect(() => {
    setSavedAddresseeCombos(loadStoredCombos('addressee'));
    setSavedModeCombos(loadStoredCombos('mode_of_transmittal'));
  }, []);

  const updateField = (name, value) => {
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));

    setErrors((current) => {
      if (!current[name]) {
        return current;
      }

      return {
        ...current,
        [name]: '',
      };
    });
  };

  const appendModeValue = (value) => {
    setFormData((current) => {
      if (current.modeOfTransmittal.includes(value)) {
        return current;
      }

      return {
        ...current,
        modeOfTransmittal: [...current.modeOfTransmittal, value],
      };
    });

    setErrors((current) => {
      if (!current.modeOfTransmittal) {
        return current;
      }

      return {
        ...current,
        modeOfTransmittal: '',
      };
    });
  };

  const appendAddresseeValue = (value) => {
    setFormData((current) => {
      if (current.addressee.includes(value)) {
        return current;
      }

      return {
        ...current,
        addressee: [...current.addressee, value],
      };
    });

    setErrors((current) => {
      if (!current.addressee) {
        return current;
      }

      return {
        ...current,
        addressee: '',
      };
    });
  };

  const applyAddresseeComboSuggestion = (combo) => {
    updateField('addressee', combo);
  };

  const applyModeComboSuggestion = (combo) => {
    updateField('modeOfTransmittal', combo);
  };

  const requestCreateOption = (optionType, optionValue, onConfirm) => {
    const normalizedOptionValue = String(optionValue ?? '').trim();

    if (!normalizedOptionValue) {
      return;
    }

    setPendingCreateOption({
      type: optionType,
      value: normalizedOptionValue,
      onConfirm,
    });
  };

  const closeCreateOptionModal = () => {
    setPendingCreateOption(null);
  };

  const confirmCreateOption = async () => {
    if (!pendingCreateOption) {
      return;
    }

    const { onConfirm, value } = pendingCreateOption;
    setPendingCreateOption(null);
    await onConfirm(value);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const nextErrors = buildErrors({
      ...formData,
      referenceNumberEnabled: showBackdatingFields,
      timestampEnabled: showBackdatingFields,
    });

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      showToast('warning', 'Please complete the required logbook fields.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(submitUrl, {
        method: submitMethod,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || 'Unable to save the logbook record right now.'
        );
      }

      if (submitMethod === 'POST') {
        saveStoredCombo('addressee', formData.addressee);
        saveStoredCombo('mode_of_transmittal', formData.modeOfTransmittal);
        setSavedAddresseeCombos(loadStoredCombos('addressee'));
        setSavedModeCombos(loadStoredCombos('mode_of_transmittal'));
      }

      setFormData(resolveInitialFormData(initialFormData));
      setErrors({});

      if (typeof onSuccess === 'function') {
        onSuccess(data);
        router.refresh();
        return;
      }

      if (successRedirectUrl) {
        router.push(successRedirectUrl);
        router.refresh();
        return;
      }

      showToast('success', successMessage);
    } catch (error) {
      showToast(
        'error',
        error.message || 'Unable to save the logbook record right now.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateSection = async (sectionName) => {
    const normalizedSectionName = String(sectionName ?? '').trim();

    if (!normalizedSectionName || isAddingSection) {
      return;
    }

    setIsAddingSection(true);

    try {
      const response = await fetch('/api/logbook/sections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ section: normalizedSectionName }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Unable to add the section right now.');
      }

      if (Array.isArray(data.sections)) {
        setLocalSectionOptions(data.sections);
      } else {
        setLocalSectionOptions((current) => {
          const nextOptions = [...current, normalizedSectionName];
          return [...new Set(nextOptions)].sort((left, right) =>
            left.localeCompare(right)
          );
        });
      }

      updateField('section', data.section || normalizedSectionName);
      showToast('success', data.message || 'Section added successfully.');
    } catch (error) {
      showToast(
        'error',
        error.message || 'Unable to add the section right now.'
      );
    } finally {
      setIsAddingSection(false);
    }
  };

  const handleCreateAddressee = async (addresseeName) => {
    const normalizedAddresseeName = String(addresseeName ?? '').trim();

    if (!normalizedAddresseeName || isAddingAddressee) {
      return;
    }

    setIsAddingAddressee(true);

    try {
      const response = await fetch('/api/logbook/addressees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ addressee: normalizedAddresseeName }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Unable to add the addressee right now.');
      }

      if (Array.isArray(data.addressees)) {
        setLocalAddresseeOptions(data.addressees);
      } else {
        setLocalAddresseeOptions((current) => {
          const nextOptions = [...current, normalizedAddresseeName];
          return [...new Set(nextOptions)].sort((left, right) =>
            left.localeCompare(right)
          );
        });
      }

      appendAddresseeValue(data.addressee || normalizedAddresseeName);
      showToast('success', data.message || 'Addressee added successfully.');
    } catch (error) {
      showToast(
        'error',
        error.message || 'Unable to add the addressee right now.'
      );
    } finally {
      setIsAddingAddressee(false);
    }
  };

  const handleCreateMode = async (modeName) => {
    const normalizedModeName = String(modeName ?? '').trim();

    if (!normalizedModeName || isAddingMode) {
      return;
    }

    setIsAddingMode(true);

    try {
      const response = await fetch('/api/logbook/modes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: normalizedModeName }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || 'Unable to add the mode of transmittal right now.'
        );
      }

      if (Array.isArray(data.modes)) {
        setLocalModeOptions(data.modes);
      } else {
        setLocalModeOptions((current) => {
          const nextOptions = [...current, normalizedModeName];
          return [...new Set(nextOptions)].sort((left, right) =>
            left.localeCompare(right)
          );
        });
      }

      appendModeValue(data.mode || normalizedModeName);
      showToast(
        'success',
        data.message || 'Mode of transmittal added successfully.'
      );
    } catch (error) {
      showToast(
        'error',
        error.message || 'Unable to add the mode of transmittal right now.'
      );
    } finally {
      setIsAddingMode(false);
    }
  };

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {pendingCreateOption ? (
        <div
          className={styles.confirmDialogBackdrop}
          role="presentation"
          onMouseDown={closeCreateOptionModal}
        >
          <div
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-create-option-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className={styles.confirmDialogEyebrow}>Confirm New Option</p>
            <h2
              id="confirm-create-option-title"
              className={styles.confirmDialogTitle}
            >
              Add this {pendingCreateOption.type}?
            </h2>
            <p className={styles.confirmDialogText}>
              <strong>{pendingCreateOption.value}</strong> will be added to the{' '}
              {pendingCreateOption.type} list for future records.
            </p>

            <div className={styles.confirmDialogActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={closeCreateOptionModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={confirmCreateOption}
              >
                Confirm Add
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <form className={styles.form} onSubmit={handleSubmit}>
        {showBackdatingFields ? (
          <div className={styles.grid}>
            <div className={styles.fieldGroup}>
              <label htmlFor="referenceNumber" className={styles.fieldLabel}>
                Reference Number
                <span className={styles.required}>*</span>
              </label>
              <input
                id="referenceNumber"
                type="text"
                value={formData.referenceNumber}
                onChange={(event) =>
                  updateField('referenceNumber', event.target.value)
                }
                className={`${styles.textInput} ${
                  errors.referenceNumber ? styles.textAreaError : ''
                }`}
                placeholder="Enter the reference number."
              />
              {errors.referenceNumber ? (
                <p className={styles.fieldError}>{errors.referenceNumber}</p>
              ) : null}
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="timestamp" className={styles.fieldLabel}>
                Timestamp
                <span className={styles.required}>*</span>
              </label>
              <input
                id="timestamp"
                type="datetime-local"
                value={formData.timestamp}
                onChange={(event) => updateField('timestamp', event.target.value)}
                className={`${styles.textInput} ${
                  errors.timestamp ? styles.textAreaError : ''
                }`}
              />
              {errors.timestamp ? (
                <p className={styles.fieldError}>{errors.timestamp}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className={styles.grid}>
          <div className={styles.fieldGroup}>
            <label htmlFor="particulars" className={styles.fieldLabel}>
              Particulars
              <span className={styles.required}>*</span>
            </label>
            <textarea
              id="particulars"
              value={formData.particulars}
              onChange={(event) => updateField('particulars', event.target.value)}
              className={`${styles.textArea} ${
                errors.particulars ? styles.textAreaError : ''
              }`}
              rows={4}
              placeholder="Enter the document or activity details."
            />
            {errors.particulars ? (
              <p className={styles.fieldError}>{errors.particulars}</p>
            ) : null}
          </div>

          <MultiSelectDropdown
            label="Addressee"
            values={formData.addressee}
            options={localAddresseeOptions}
            onChange={(value) => updateField('addressee', value)}
            placeholder="Search addressee"
            required
            error={errors.addressee}
            createLabel="addressee"
            onCreateOption={(value) =>
              requestCreateOption('addressee', value, handleCreateAddressee)
            }
            isCreatingOption={isAddingAddressee}
            createOptionHint="Can't find the addressee? Add it here and it will be saved to the Addresse list."
            selectionLabel="addressee"
            emptyHint="Choose one or more addressees."
            comboSuggestions={savedAddresseeCombos}
            onApplyComboSuggestion={applyAddresseeComboSuggestion}
            comboSuggestionLabel="Suggested previous combinations"
          />

          <SearchableSelect
            label="Transmitter"
            value={formData.transmitter}
            options={transmitterOptions}
            onChange={(value) => updateField('transmitter', value)}
            placeholder="Search registered users"
            required
            error={errors.transmitter}
          />

          <SearchableSelect
            label="Section"
            value={formData.section}
            options={localSectionOptions}
            onChange={(value) => updateField('section', value)}
            placeholder="Search section"
            required
            error={errors.section}
            createLabel="section"
            onCreateOption={(value) =>
              requestCreateOption('section', value, handleCreateSection)
            }
            isCreatingOption={isAddingSection}
            createOptionHint="Can't find the section? Add it here and it will be saved to the Section list."
          />
        </div>

        <MultiSelectDropdown
          label="Mode of Transmittal"
          values={formData.modeOfTransmittal}
          options={localModeOptions}
          onChange={(value) => updateField('modeOfTransmittal', value)}
          placeholder="Search mode of transmittal"
          required
          error={errors.modeOfTransmittal}
          createLabel="mode"
          onCreateOption={(value) =>
            requestCreateOption(
              'mode of transmittal',
              value,
              handleCreateMode
            )
          }
          isCreatingOption={isAddingMode}
          createOptionHint="Can't find the mode? Add it here and it will be saved to the Mode list."
          selectionLabel="mode"
          emptyHint="Choose one or more modes of transmittal."
          comboSuggestions={savedModeCombos}
          onApplyComboSuggestion={applyModeComboSuggestion}
          comboSuggestionLabel="Suggested previous combinations"
        />

        <div className={styles.fieldGroup}>
          <label htmlFor="remarks" className={styles.fieldLabel}>
            Remarks
          </label>
          <textarea
            id="remarks"
            value={formData.remarks}
            onChange={(event) => updateField('remarks', event.target.value)}
            className={styles.textArea}
            rows={4}
            placeholder="Add any optional notes or remarks."
          />
        </div>

        <div className={styles.actions}>
          {showBackLink ? (
            <Link href={backHref} className={styles.secondaryButton}>
              <FiArrowLeft />
              <span>Back to Logbook</span>
            </Link>
          ) : onCancel ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onCancel}
            >
              <span>{cancelLabel}</span>
            </button>
          ) : <span />}

          <button
            type="submit"
            className={styles.primaryButton}
            disabled={isSubmitting}
          >
            <FiSave />
            <span>{isSubmitting ? 'Saving...' : submitLabel}</span>
          </button>
        </div>
      </form>
    </>
  );
}
