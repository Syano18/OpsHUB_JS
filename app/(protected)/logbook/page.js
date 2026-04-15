import { getDigitalLogbookEntries } from '@/lib/digital-logbook';
import LogbookClient from './logbook-client';
import styles from './logbook.module.css';

export default async function LogbookPage({ searchParams }) {
  let entries = [];
  let loadError = null;
  const resolvedSearchParams = await searchParams;
  const toast = resolvedSearchParams?.toast ?? null;

  try {
    entries = await getDigitalLogbookEntries();
  } catch (error) {
    console.error('Failed to load Digital Logbook entries.', error);
    loadError = 'Unable to load Digital Logbook entries right now.';
  }

  return (
    <section className={styles.page}>
      <LogbookClient entries={entries} loadError={loadError} toast={toast} />
    </section>
  );
}
