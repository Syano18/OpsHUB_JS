import { notFound, redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth-session';
import { getDigitalLogbookEntryById } from '@/lib/digital-logbook';
import { getRegisteredUserDisplayNames } from '@/lib/user-permissions';
import {
  getLogbookAddressees,
  getLogbookModes,
  getLogbookSections,
} from '@/lib/logbook-options';
import NewRecordForm from '../../new/new-record-form';
import styles from '../../new/new-record-form.module.css';

function splitModeValues(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitAddresseeValues(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

export default async function EditLogbookRecordPage({ params }) {
  const session = await verifySession();

  if (!session?.email) {
    redirect('/login');
  }

  const { id } = await params;
  const entryId = Number(id);

  if (!Number.isInteger(entryId) || entryId < 1) {
    notFound();
  }

  const [entry, transmitterOptions, addresseeOptions, sectionOptions, modeOptions] =
    await Promise.all([
      getDigitalLogbookEntryById(entryId),
      getRegisteredUserDisplayNames(),
      getLogbookAddressees(),
      getLogbookSections(),
      getLogbookModes(),
    ]);

  if (!entry) {
    notFound();
  }

  if (normalizeEmail(entry.encodedBy) !== normalizeEmail(session.email)) {
    redirect('/logbook?toast=edit-restricted');
  }

  const initialFormData = {
    particulars: entry.particulars ?? '',
    addressee: splitAddresseeValues(entry.addressee),
    transmitter: entry.transmitter ?? '',
    section: entry.section ?? '',
    modeOfTransmittal: splitModeValues(entry.modeOfTransmittal),
    remarks: entry.remarks ?? '',
  };

  return (
    <section className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Digital Logbook</p>
            <h1 className={styles.title}>Edit Record</h1>
            <p className={styles.subtitle}>
              Update the existing routing details below and save your changes.
            </p>
          </div>
        </div>

        <NewRecordForm
          transmitterOptions={transmitterOptions}
          addresseeOptions={addresseeOptions}
          sectionOptions={sectionOptions}
          modeOptions={modeOptions}
          initialFormData={initialFormData}
          submitUrl={`/api/logbook/${entryId}`}
          submitMethod="PUT"
          submitLabel="Update Record"
          successRedirectUrl="/logbook?toast=record-updated"
        />
      </div>
    </section>
  );
}
