'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useEffect, useId, useRef, useState } from 'react';
import {
  FiArrowLeft,
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

function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
  required = false,
  error = '',
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
              setQuery(value);
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
              ))
            ) : (
              <p className={styles.optionEmpty}>No matching options.</p>
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
            {filteredOptions.length ? (
              filteredOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={styles.optionButton}
                  onClick={() => addValue(option)}
                >
                  <span>{option}</span>
                  <FiPlusBadge />
                </button>
              ))
            ) : (
              <p className={styles.optionEmpty}>
                {values.length === options.length
                  ? 'All modes selected.'
                  : 'No matching modes.'}
              </p>
            )}
          </div>
        ) : null}
      </div>

      <p className={styles.fieldHint}>
        {values.length
          ? `${values.length} mode${values.length === 1 ? '' : 's'} selected`
          : 'Choose one or more modes of transmittal.'}
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

  if (!formData.addressee.trim()) {
    nextErrors.addressee = 'Addressee is required.';
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

  return nextErrors;
}

export default function NewRecordForm({
  transmitterOptions,
  sectionOptions,
  modeOptions,
  initialFormData,
  submitUrl = '/api/logbook',
  submitMethod = 'POST',
  submitLabel = 'Save Record',
  successMessage = 'The logbook record was saved successfully.',
  successRedirectUrl = null,
}) {
  const defaultFormData = {
    particulars: '',
    addressee: '',
    transmitter: '',
    section: '',
    modeOfTransmittal: [],
    remarks: '',
  };
  const resolvedInitialFormData = {
    particulars: String(initialFormData?.particulars ?? defaultFormData.particulars),
    addressee: String(initialFormData?.addressee ?? defaultFormData.addressee),
    transmitter: String(initialFormData?.transmitter ?? defaultFormData.transmitter),
    section: String(initialFormData?.section ?? defaultFormData.section),
    modeOfTransmittal: Array.isArray(initialFormData?.modeOfTransmittal)
      ? initialFormData.modeOfTransmittal
          .map((value) => String(value ?? '').trim())
          .filter(Boolean)
      : defaultFormData.modeOfTransmittal,
    remarks: String(initialFormData?.remarks ?? defaultFormData.remarks),
  };
  const [formData, setFormData] = useState({
    ...resolvedInitialFormData,
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    setFormData({
      ...resolvedInitialFormData,
    });
    setErrors({});
  }, [initialFormData]);

  const handleCreateAnother = () => {
    setFormData(resolvedInitialFormData);
    setErrors({});
  };

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

  const handleSubmit = async (event) => {
    event.preventDefault();

    const nextErrors = buildErrors(formData);

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

      setFormData(resolvedInitialFormData);
      setErrors({});

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

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <form className={styles.form} onSubmit={handleSubmit}>
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

          <div className={styles.fieldGroup}>
            <label htmlFor="addressee" className={styles.fieldLabel}>
              Addressee
              <span className={styles.required}>*</span>
            </label>
            <textarea
              id="addressee"
              value={formData.addressee}
              onChange={(event) => updateField('addressee', event.target.value)}
              className={`${styles.textArea} ${
                errors.addressee ? styles.textAreaError : ''
              }`}
              rows={4}
              placeholder="Enter the office, unit, or recipient."
            />
            {errors.addressee ? (
              <p className={styles.fieldError}>{errors.addressee}</p>
            ) : null}
          </div>

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
            options={sectionOptions}
            onChange={(value) => updateField('section', value)}
            placeholder="Search section"
            required
            error={errors.section}
          />
        </div>

        <MultiSelectDropdown
          label="Mode of Transmittal"
          values={formData.modeOfTransmittal}
          options={modeOptions}
          onChange={(value) => updateField('modeOfTransmittal', value)}
          placeholder="Search mode of transmittal"
          required
          error={errors.modeOfTransmittal}
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
          <Link href="/logbook" className={styles.secondaryButton}>
            <FiArrowLeft />
            <span>Back to Logbook</span>
          </Link>

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
