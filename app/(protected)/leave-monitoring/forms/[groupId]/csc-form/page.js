import { verifySession } from '@/lib/auth-session';
import { getUserPermissionByEmail } from '@/lib/user-permissions';
import { getLeaveRequestGroup } from '@/lib/leaves';
import { getCscForm6ViewData } from '@/lib/csc-form-6-data';
import { getCscForm6Template } from '@/lib/csc-form-6-template';
import PrintActions from './print-actions';
import styles from './csc-form.module.css';

export const dynamic = 'force-dynamic';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeRole(value) {
  return normalizeText(value).toLowerCase();
}

function getTemplateLineClassName(variant) {
  switch (variant) {
    case 'mainTitle':
      return `${styles.templateLine} ${styles.templateLineMainTitle}`;
    case 'agency':
      return `${styles.templateLine} ${styles.templateLineAgency}`;
    case 'italic':
      return `${styles.templateLine} ${styles.templateLineItalic}`;
    case 'bold':
      return `${styles.templateLine} ${styles.templateLineBold}`;
    case 'section':
      return `${styles.templateLine} ${styles.templateLineSection}`;
    default:
      return styles.templateLine;
  }
}

function pushValue(entries, content, config) {
  const normalizedContent = normalizeText(content);

  if (!normalizedContent) {
    return;
  }

  entries.push({
    ...config,
    content: normalizedContent,
  });
}

function pushMark(entries, checked, position) {
  if (!checked) {
    return;
  }

  entries.push(position);
}

function buildDynamicTemplateEntries(formData) {
  const values = [];
  const marks = [];
  const generalReason = (formData.metadata?.generalReason ?? []).join(' ');
  const locationDetail =
    formData.metadata?.specifiedPlace || generalReason || formData.leaveDetails;
  const illnessDetail = formData.metadata?.illness || generalReason;

  pushValue(values, formData.officeDepartment, {
    left: 157,
    top: 125,
    width: 72,
    className: styles.fieldTiny,
  });
  pushValue(values, formData.nameParts?.lastName, {
    left: 279,
    top: 124,
    width: 92,
    className: styles.fieldStandard,
  });
  pushValue(values, formData.nameParts?.firstName, {
    left: 368,
    top: 124,
    width: 92,
    className: styles.fieldStandard,
  });
  pushValue(values, formData.nameParts?.middleName, {
    left: 458,
    top: 124,
    width: 82,
    className: styles.fieldStandard,
  });
  pushValue(values, formData.dateFiled, {
    left: 130,
    top: 156,
    width: 94,
    className: styles.fieldCompact,
  });
  pushValue(values, formData.position, {
    left: 292,
    top: 156,
    width: 120,
    className: styles.fieldCompact,
  });
  pushValue(values, formData.salary, {
    left: 466,
    top: 156,
    width: 95,
    className: styles.fieldCompact,
  });

  pushMark(marks, formData.selections?.vacation, { left: 43.5, top: 220.5 });
  pushMark(marks, formData.selections?.forced, { left: 43.5, top: 236.5 });
  pushMark(marks, formData.selections?.sick, { left: 43.5, top: 252.5 });
  pushMark(marks, formData.selections?.specialPrivilege, {
    left: 43.5,
    top: 304.3,
  });
  pushMark(marks, formData.selections?.others, { left: 43.5, top: 446.6 });
  pushMark(marks, formData.selections?.withinPhilippines, {
    left: 337.2,
    top: 231.2,
  });
  pushMark(marks, formData.selections?.abroad, { left: 337.2, top: 247.3 });
  pushMark(marks, formData.selections?.inHospital, { left: 337.2, top: 282.4 });
  pushMark(marks, formData.selections?.outPatient, { left: 337.2, top: 298.5 });

  if (formData.selections?.others) {
    pushValue(values, 'Wellness Leave', {
      left: 86,
      top: 444.5,
      width: 205,
      className: styles.fieldStandard,
    });
  }

  if (formData.selections?.withinPhilippines) {
    pushValue(values, locationDetail, {
      left: 435,
      top: 228.3,
      width: 142,
      className: styles.fieldCompact,
    });
  }

  if (formData.selections?.abroad) {
    pushValue(values, locationDetail, {
      left: 416,
      top: 244.5,
      width: 162,
      className: styles.fieldCompact,
    });
  }

  if (formData.selections?.inHospital) {
    pushValue(values, illnessDetail, {
      left: 456,
      top: 279.8,
      width: 121,
      className: styles.fieldCompact,
    });
  }

  if (formData.selections?.outPatient) {
    pushValue(values, illnessDetail, {
      left: 458,
      top: 295.8,
      width: 119,
      className: styles.fieldCompact,
    });
  }

  pushValue(values, formData.requestedDays, {
    left: 118,
    top: 487.5,
    width: 150,
    className: `${styles.fieldStrong} ${styles.fieldCentered}`,
  });

  (formData.inclusiveDateLines ?? []).forEach((line, index) => {
    pushValue(values, line, {
      left: 56,
      top: 533 + index * 20,
      width: 205,
      className: styles.fieldCompact,
    });
  });

  return { values, marks };
}

export default async function CscFormPage({ params }) {
  const resolvedParams = await params;
  const groupId = normalizeText(resolvedParams?.groupId);
  const session = await verifySession();

  if (!session?.email || !groupId) {
    return null;
  }

  const [currentUser, leaveRequestGroup, template] = await Promise.all([
    getUserPermissionByEmail(session.email),
    getLeaveRequestGroup(groupId),
    getCscForm6Template(),
  ]);

  if (!leaveRequestGroup) {
    return (
      <section className={styles.screenShell}>
        <div className={styles.errorCard}>Leave request group not found.</div>
      </section>
    );
  }

  const currentRole = normalizeRole(currentUser?.role);
  const canAccess =
    normalizeText(leaveRequestGroup.employeeEmail).toLowerCase() ===
      normalizeText(session.email).toLowerCase() ||
    currentRole === 'admin' ||
    currentRole === 'super_admin';

  if (!canAccess) {
    return (
      <section className={styles.screenShell}>
        <div className={styles.errorCard}>
          You are not allowed to access this CSC Form 6.
        </div>
      </section>
    );
  }

  let formData;

  try {
    formData = await getCscForm6ViewData(groupId);
  } catch (error) {
    return (
      <section className={styles.screenShell}>
        <div className={styles.errorCard}>
          {error.message || 'Unable to build the CSC Form 6 right now.'}
        </div>
      </section>
    );
  }

  const overlayEntries = buildDynamicTemplateEntries(formData);

  return (
    <section className={styles.screenShell}>
      <PrintActions />

      <div className={styles.paperViewport}>
        <article
          className={styles.paper}
          style={{
            '--page-width': `${template.pageWidth}pt`,
            '--page-height': `${template.pageHeight}pt`,
          }}
        >
          <svg
            className={styles.drawingLayer}
            viewBox={`0 0 ${template.pageWidth} ${template.pageHeight}`}
            aria-hidden="true"
          >
            {template.drawings.map((drawing) => (
              <rect
                key={drawing.id}
                x={drawing.x}
                y={drawing.y}
                width={drawing.width}
                height={drawing.height}
                fill={drawing.fill}
                fillOpacity={drawing.fillOpacity}
                stroke={drawing.stroke}
                strokeOpacity={drawing.strokeOpacity}
                strokeWidth={drawing.strokeWidth}
                strokeDasharray={drawing.dashArray ?? undefined}
              />
            ))}
          </svg>

          {template.images.map((image) => (
            <img
              key={image.id}
              src={image.src}
              alt={image.alt}
              className={styles.templateImage}
              style={{
                left: `${image.x}pt`,
                top: `${image.y}pt`,
                width: `${image.width}pt`,
                height: `${image.height}pt`,
              }}
            />
          ))}

          {template.lines.map((line) => (
            <span
              key={line.id}
              className={getTemplateLineClassName(line.variant)}
              style={{
                left: `${line.topX0}pt`,
                top: `${line.topY0}pt`,
                minWidth: `${line.width}pt`,
                fontSize: `${Math.max(8.5, line.height * 0.92)}pt`,
              }}
            >
              {line.text}
            </span>
          ))}

          {overlayEntries.marks.map((mark, index) => (
            <span
              key={`mark-${index}`}
              className={styles.filledMark}
              style={{
                left: `${mark.left}pt`,
                top: `${mark.top}pt`,
              }}
            >
              X
            </span>
          ))}

          {overlayEntries.values.map((entry, index) => (
            <span
              key={`value-${index}`}
              className={`${styles.filledText} ${entry.className ?? ''}`}
              style={{
                left: `${entry.left}pt`,
                top: `${entry.top}pt`,
                width: `${entry.width}pt`,
              }}
            >
              {entry.content}
            </span>
          ))}
        </article>
      </div>
    </section>
  );
}
