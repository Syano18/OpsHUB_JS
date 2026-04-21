import styles from './loading.module.css';

export default function ProtectedLoading() {
  return (
    <section className={styles.page} aria-label="Loading page content">
      <div className={styles.progressTrack}>
        <div className={styles.progressBar} />
      </div>

      <div className={styles.card}>
        <div className={styles.titleBlock}>
          <div className={styles.titleLine} />
          <div className={styles.metaLine} />
        </div>

        <div className={styles.grid}>
          <div className={styles.cell} />
          <div className={styles.cell} />
          <div className={styles.cell} />
          <div className={styles.cell} />
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.titleBlock}>
          <div className={styles.titleLineShort} />
          <div className={styles.metaLineShort} />
        </div>

        <div className={styles.grid}>
          <div className={styles.cell} />
          <div className={styles.cell} />
          <div className={styles.cell} />
          <div className={styles.cell} />
        </div>
      </div>
    </section>
  );
}
