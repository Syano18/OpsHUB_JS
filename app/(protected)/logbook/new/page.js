import { getRegisteredUserDisplayNames } from '@/lib/user-permissions';
import { getLogbookModes, getLogbookSections } from '@/lib/logbook-options';
import NewRecordForm from './new-record-form';
import styles from './new-record-form.module.css';

export default async function NewLogbookRecordPage() {
  const [transmitterOptions, sectionOptions, modeOptions] = await Promise.all([
    getRegisteredUserDisplayNames(),
    getLogbookSections(),
    getLogbookModes(),
  ]);

  return (
    <section className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Digital Logbook</p>
            <h1 className={styles.title}>New Record</h1>
            <p className={styles.subtitle}>
              Capture the routing details, choose the transmitter, and assign one
              or more modes of transmittal before saving.
            </p>
          </div>
        </div>

        <NewRecordForm
          transmitterOptions={transmitterOptions}
          sectionOptions={sectionOptions}
          modeOptions={modeOptions}
        />
      </div>
    </section>
  );
}
