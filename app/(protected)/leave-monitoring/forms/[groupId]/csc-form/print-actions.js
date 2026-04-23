'use client';

import { FiArrowLeft, FiPrinter } from 'react-icons/fi';
import styles from './csc-form.module.css';

export default function PrintActions() {
  return (
    <div className={styles.actionsBar}>
      <button
        type="button"
        className={styles.actionButton}
        onClick={() => window.history.back()}
      >
        <FiArrowLeft />
        <span>Back</span>
      </button>
      <button
        type="button"
        className={styles.primaryActionButton}
        onClick={() => window.print()}
      >
        <FiPrinter />
        <span>Print / Save PDF</span>
      </button>
    </div>
  );
}
