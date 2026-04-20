import { verifySession } from '@/lib/auth-session';
import { getDigitalLogbookEntries } from '@/lib/digital-logbook';
import {
  getRegisteredUserDisplayNames,
  getUserPermissionByEmail,
} from '@/lib/user-permissions';
import {
  getLogbookAddressees,
  getLogbookModes,
  getLogbookSections,
} from '@/lib/logbook-options';
import LogbookClient from './logbook-client';
import styles from './logbook.module.css';

export default async function LogbookPage({ searchParams }) {
  let entries = [];
  let loadError = null;
  let currentUserRole = null;
  let transmitterOptions = [];
  let addresseeOptions = [];
  let sectionOptions = [];
  let modeOptions = [];
  const resolvedSearchParams = await searchParams;
  const toast = resolvedSearchParams?.toast ?? null;

  try {
    entries = await getDigitalLogbookEntries();
  } catch (error) {
    console.error('Failed to load Digital Logbook entries.', error);
    loadError = 'Unable to load Digital Logbook entries right now.';
  }

  try {
    const session = await verifySession();

    if (session?.email) {
      const allowedUser = await getUserPermissionByEmail(session.email);
      currentUserRole = allowedUser?.role ?? null;
    }
  } catch (error) {
    console.error('Failed to resolve current user role for Digital Logbook.', error);
  }

  try {
    [transmitterOptions, addresseeOptions, sectionOptions, modeOptions] =
      await Promise.all([
        getRegisteredUserDisplayNames(),
        getLogbookAddressees(),
        getLogbookSections(),
        getLogbookModes(),
      ]);
  } catch (error) {
    console.error('Failed to load Digital Logbook form options.', error);
  }

  return (
    <section className={styles.page}>
      <LogbookClient
        entries={entries}
        loadError={loadError}
        toast={toast}
        currentUserRole={currentUserRole}
        transmitterOptions={transmitterOptions}
        addresseeOptions={addresseeOptions}
        sectionOptions={sectionOptions}
        modeOptions={modeOptions}
      />
    </section>
  );
}
