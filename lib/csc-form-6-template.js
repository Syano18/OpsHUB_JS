import { promises as fs } from 'fs';
import path from 'path';
import { cache } from 'react';

const TEMPLATE_DIRECTORY = path.join(
  process.cwd(),
  'public',
  'templates',
  'csc-coordinates'
);

const LINES_CSV_PATH = path.join(
  TEMPLATE_DIRECTORY,
  'printed_lines_coordinates.csv'
);

const GRAPHICS_JSON_PATH = path.join(
  TEMPLATE_DIRECTORY,
  'printed_graphics_coordinates.json'
);

const TEMPLATE_CALIBRATION = {
  scaleX: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
};

const SIX_A_LEAVE_TYPE_TEXTS = [
  'Vacation Leave (Sec. 51, Rule XVI, Omnibus Rules Implementing E.O. No. 292)',
  'Mandatory/Forced Leave (Sec. 25, Rule XVI, Omnibus Rules Implementing E.O. No. 292)',
  'Sick Leave (Sec. 43, Rule XVI, Omnibus Rules Implementing E.O. No. 292)',
  'Maternity Leave (RA No. 11210/IRR issued by CSC, DOLE and SSS)',
  'Paternity Leave (RA No. 8187/CSC MC No. 71, s. 1998, as amended)',
  'Special Privilege Leave (Sec. 21, Rule XVI, Omnibus Rules Implementing E.O. No. 292)',
  'Solo Parent Leave (RA No. 8972/CSC MC No. 8, s. 2004)',
  'Study Leave (Sec. 68, Rule XVI, Omnibus Rules Implementing E.O. No. 292)',
  '10-Day VAWC Leave (RA No. 9262/CSC MC No. 15, s. 2005)',
  'Rehabilitation Privilege (Sec. 55, Rule XVI, Omnibus Rules Implementing E.O. No. 292)',
  'Special Leave Benefits for Women (RA No. 9710/CSC MC No. 25, s. 2010)',
  'Special Emergency (Calamity) Leave (CSC MC No. 2, s. 2012, as amended)',
  'Adoption Leave (RA No. 8552)',
];

const LEFT_COLUMN_CHECKBOX_KEYS = [
  'vacation',
  'forced',
  'sick',
  'maternity',
  'paternity',
  'specialPrivilege',
  'soloParent',
  'study',
  'vawc',
  'rehabilitation',
  'specialLeaveBenefits',
  'specialEmergency',
  'adoption',
];

const RIGHT_COLUMN_CHECKBOX_KEYS = [
  'withinPhilippines',
  'abroad',
  'inHospital',
  'outPatient',
  'completionMasters',
  'barReview',
  'monetization',
  'terminal',
  'requestedCommutation',
  'notRequestedCommutation',
  'recommendApproval',
  'recommendDisapproval',
];

const UNIFORM_OPTION_LABEL_TEXTS = new Set([
  'Within the Philippines',
  'Abroad (Specify)',
  'In Hospital (Specify Illness)',
  'Out Patient (Specify Illness)',
  'Completion of Master’s Degree',
  'BAR/Board Examination Review',
  'Monetization of Leave Credits',
  'Terminal Leave',
]);

const RIGHT_COLUMN_LABEL_KEY_BY_TEXT = {
  'Within the Philippines': 'withinPhilippines',
  'Abroad (Specify)': 'abroad',
  'In Hospital (Specify Illness)': 'inHospital',
  'Out Patient (Specify Illness)': 'outPatient',
  'Completion of Master’s Degree': 'completionMasters',
  'BAR/Board Examination Review': 'barReview',
  'Monetization of Leave Credits': 'monetization',
  'Terminal Leave': 'terminal',
};

function calibrateX(value) {
  return value * TEMPLATE_CALIBRATION.scaleX + TEMPLATE_CALIBRATION.offsetX;
}

function calibrateY(value) {
  return value * TEMPLATE_CALIBRATION.scaleY + TEMPLATE_CALIBRATION.offsetY;
}

function calibrateWidth(value) {
  return value * TEMPLATE_CALIBRATION.scaleX;
}

function calibrateHeight(value) {
  return value * TEMPLATE_CALIBRATION.scaleY;
}

function calibrateLine(line) {
  return {
    ...line,
    topX0: calibrateX(line.topX0),
    topX1: calibrateX(line.topX1),
    topY0: calibrateY(line.topY0),
    topY1: calibrateY(line.topY1),
    width: calibrateWidth(line.width),
    height: calibrateHeight(line.height),
  };
}

function calibrateDrawing(drawing) {
  return {
    ...drawing,
    x: calibrateX(drawing.x),
    y: calibrateY(drawing.y),
    width: calibrateWidth(drawing.width),
    height: calibrateHeight(drawing.height),
  };
}

function calibrateImage(image) {
  return {
    ...image,
    x: calibrateX(image.x),
    y: calibrateY(image.y),
    width: calibrateWidth(image.width),
    height: calibrateHeight(image.height),
  };
}

function getSixALeaveTypeIndex(text) {
  return SIX_A_LEAVE_TYPE_TEXTS.indexOf(text);
}

function getRenderedLineHeight(line) {
  if (line.fixedFontSize) {
    return line.fixedFontSize;
  }

  return Math.max(8.5, line.height * 0.92);
}

function adjustDetailsOfLeaveUnderline(drawing) {
  const roundedX = Math.round(drawing.x * 10) / 10;
  const roundedY = Math.round(drawing.y * 10) / 10;

  if (
    roundedY >= 695 &&
    roundedY <= 705 &&
    drawing.width >= 230 &&
    drawing.width <= 260 &&
    roundedX >= 340 &&
    roundedX <= 360
  ) {
    return {
      ...drawing,
      y: drawing.y + 28,
    };
  }

  if (roundedX === 435.5 && roundedY === 239.4) {
    return {
      ...drawing,
      x: 425,
      width: drawing.width + 10.5,
    };
  }

  if (roundedX === 417 && roundedY === 256.2) {
    return {
      ...drawing,
      x: 415,
      width: 135.3,
    };
  }

  if (roundedX === 457.9 && roundedY === 291.9) {
    return {
      ...drawing,
      x: 430,
      width: drawing.width + 27.9,
    };
  }

  if (roundedX === 460.5 && roundedY === 308.1) {
    return {
      ...drawing,
      x: 433,
      width: drawing.width + 27.5,
    };
  }

  if (roundedY === 694.9) {
    return { ...drawing, y: drawing.y + 1 };
  }

  if (roundedY === 586.0) {
    return { ...drawing, height: drawing.height + 8 };
  }

  if (
    roundedY >= 615 &&
    roundedY <= 760 &&
    drawing.width >= 100 &&
    !(drawing.width >= 230 && drawing.width <= 260 && roundedY >= 695 && roundedY <= 705)
  ) {
    return {
      ...drawing,
      y: drawing.y + 4,
    };
  }

  if (roundedY === 696.4) {
    return { ...drawing, y: drawing.y + 1 };
  }

  if (roundedY === 749.9) {
    return { ...drawing, y: drawing.y + 1 };
  }

  if (roundedY === 750.4) {
    return { ...drawing, y: drawing.y + 1, height: drawing.height - 8 };
  }

  if (roundedX === 322.8 && roundedY >= 650 && roundedY <= 760) {
    return {
      ...drawing,
      y: drawing.y + 6,
      height: drawing.height - 6,
    };
  }

  return drawing;
}

function parseCsvLine(line) {
  const values = [];
  let currentValue = '';
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (insideQuotes && line[index + 1] === '"') {
        currentValue += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (character === ',' && !insideQuotes) {
      values.push(currentValue);
      currentValue = '';
      continue;
    }

    currentValue += character;
  }

  values.push(currentValue);
  return values;
}

function decodeTemplateText(value) {
  return String(value ?? '')
    .replaceAll('â€™', '’')
    .replaceAll('â€œ', '“')
    .replaceAll('â€\u009d', '”')
    .replaceAll('â€', '”')
    .replaceAll('â€“', '–')
    .replaceAll('â€”', '—')
    .trim();
}

function isStampReceiptText(text) {
  return text === 'Stamp of Date of Receipt';
}

function isStampReceiptDrawing(drawing) {
  const roundedX = Math.round(drawing.x * 10) / 10;
  const roundedY = Math.round(drawing.y * 10) / 10;
  const roundedWidth = Math.round(drawing.width * 10) / 10;
  const roundedHeight = Math.round(drawing.height * 10) / 10;

  return (
    roundedX === 480.4 &&
    roundedY === 54.3 &&
    roundedWidth === 104.8 &&
    roundedHeight === 18.3
  );
}

function toNumber(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function getLineVariant(text) {
  if (
    text === '1. OFFICE/DEPARTMENT' ||
    text === '2. NAME: (Last) (First) (Middle)' ||
    text === '3. DATE OF FILING:' ||
    text === '4. POSITION' ||
    text === '5. SALARY'
  ) {
    return 'default';
  }

  if (text === 'APPLICATION FOR LEAVE') {
    return 'mainTitle';
  }

  if (text === 'PHILIPPINE STATISTICS AUTHORITY') {
    return 'agency';
  }

  if (
    text === 'Civil Service Form No. 6' ||
    text === 'Revised 2020' ||
    text.startsWith('In case of ') ||
    text === '(Specify Illness)' ||
    text === 'Other purposes:'
  ) {
    return 'italic';
  }

  if (
    text === 'Republic of the Philippines' ||
    text === 'DONAH GRACE C. CAPULAC' ||
    text === 'RANDOLF M. LADERAS' ||
    text === 'MARIBEL M. DALAYDAY'
  ) {
    return 'bold';
  }

  if (
    text.startsWith('1. ') ||
    text.startsWith('2. ') ||
    text.startsWith('3. ') ||
    text.startsWith('4. ') ||
    text.startsWith('5. ') ||
    text === '6. DETAILS OF APPLICATION' ||
    text === '7. DETAILS OF ACTION ON APPLICATION'
  ) {
    return 'section';
  }

  return 'default';
}

function buildLeaveTypeParts(text) {
  const separatorIndex = text.indexOf(' (');

  if (separatorIndex === -1 || !text.endsWith(')')) {
    return null;
  }

  return [
    {
      text: text.slice(0, separatorIndex),
      variant: 'default',
      fontScale: 1.18,
    },
    {
      text: text.slice(separatorIndex),
      variant: 'default',
      fontScale: 0.82,
    },
  ];
}

function buildOptionLabelParts(text) {
  if (!UNIFORM_OPTION_LABEL_TEXTS.has(text)) {
    return null;
  }

  const separatorIndex = text.indexOf(' (');

  if (separatorIndex === -1 || !text.endsWith(')')) {
    return [
      {
        text,
        variant: 'default',
        fontScale: 1.18,
      },
    ];
  }

  return [
    {
      text: text.slice(0, separatorIndex),
      variant: 'default',
      fontScale: 1.18,
    },
    {
      text: text.slice(separatorIndex),
      variant: 'default',
      fontScale: 0.82,
    },
  ];
}

function buildTemplateLine(row) {
  const topX0 = toNumber(row.top_x0_pt);
  const topY0 = toNumber(row.top_y0_pt);
  const topX1 = toNumber(row.top_x1_pt);
  const topY1 = toNumber(row.top_y1_pt);
  const text = decodeTemplateText(row.text);

  if (isStampReceiptText(text)) {
    return [];
  }

  if (text === 'PHILIPPINE STATISTICS AUTHORITY') {
    const centeredLeft = 36;
    const centeredRight = 559;

    return [
      {
        id: toNumber(row.line_id),
        text,
        topX0: centeredLeft,
        topY0,
        topX1: centeredRight,
        topY1,
        width: centeredRight - centeredLeft,
        height: topY1 - topY0,
        variant: getLineVariant(text),
        align: 'center',
      },
    ];
  }

  if (text === 'Within the Philippines') {
    return [
      {
        id: toNumber(row.line_id),
        text,
        topX0,
        topY0,
        topX1,
        topY1,
        width: topX1 - topX0,
        height: topY1 - topY0,
        variant: getLineVariant(text),
        align: 'left',
        fixedFontSize: 8.2,
        yOffset: 1,
      },
    ];
  }

  if (text === 'Abroad (Specify)') {
    return [
      {
        id: toNumber(row.line_id),
        text,
        topX0,
        topY0,
        topX1: 442,
        topY1,
        width: 442 - topX0,
        height: topY1 - topY0,
        variant: getLineVariant(text),
        align: 'left',
        fixedFontSize: 8.2,
      },
    ];
  }

  if (
    text === 'Total Earned' ||
    text === 'Less this application' ||
    text === 'Balance'
  ) {
    return [
      {
        id: toNumber(row.line_id),
        text,
        topX0,
        topY0,
        topX1,
        topY1,
        width: topX1 - topX0,
        height: topY1 - topY0,
        variant: getLineVariant(text),
        align: 'center',
        fixedFontSize: 8.2,
        disableAutoSize: true,
        padding: 0,
        yOffset: -2.2,
      },
    ];
  }

  if (
    text === 'For approval' ||
    text === 'For disapproval due to _________________' ||
    text === '_______days with pay' ||
    text === '_______days without pay' ||
    text === '_______others (Specify)'
  ) {
    return [
      {
        id: toNumber(row.line_id),
        text,
        topX0,
        topY0,
        topX1,
        topY1,
        width: topX1 - topX0,
        height: topY1 - topY0,
        variant: getLineVariant(text),
        align: 'left',
        yOffset: -1,
      },
    ];
  }

  if (
    text === 'DONAH GRACE C. CAPULAC' ||
    text === 'RANDOLF M. LADERAS'
  ) {
    return [
      {
        id: toNumber(row.line_id),
        text,
        topX0,
        topY0,
        topX1,
        topY1,
        width: topX1 - topX0,
        height: topY1 - topY0,
        variant: getLineVariant(text),
        align: 'left',
        yOffset: 1,
      },
    ];
  }

  if (
    text === 'Administrative Officer I, Designated HR' ||
    text === 'Supervising Statistical Specialist' ||
    text === '(Authorized Officer)'
  ) {
    return [
      {
        id: toNumber(row.line_id),
        text,
        topX0,
        topY0,
        topX1,
        topY1,
        width: topX1 - topX0,
        height: topY1 - topY0,
        variant: getLineVariant(text),
        align: 'left',
        yOffset: 1,
      },
    ];
  }

  if (text === '2. NAME: (Last) (First) (Middle)') {
    return [
      {
        id: `${toNumber(row.line_id)}-label`,
        text: '2. NAME:',
        topX0,
        topY0,
        topX1: 279,
        topY1,
        width: 279 - topX0,
        height: topY1 - topY0,
        variant: getLineVariant(text),
        align: 'left',
      },
      {
        id: `${toNumber(row.line_id)}-last`,
        text: '(Last)',
        topX0: 279,
        topY0,
        topX1: 371,
        topY1,
        width: 92,
        height: topY1 - topY0,
        variant: 'default',
        align: 'center',
      },
      {
        id: `${toNumber(row.line_id)}-first`,
        text: '(First)',
        topX0: 368,
        topY0,
        topX1: 460,
        topY1,
        width: 92,
        height: topY1 - topY0,
        variant: 'default',
        align: 'center',
      },
      {
        id: `${toNumber(row.line_id)}-middle`,
        text: '(Middle)',
        topX0: 458,
        topY0,
        topX1: 540,
        topY1,
        width: 82,
        height: topY1 - topY0,
        variant: 'default',
        align: 'center',
      },
    ];
  }

  if (UNIFORM_OPTION_LABEL_TEXTS.has(text)) {
    const optionLabelParts = buildOptionLabelParts(text);

    return [
      {
        id: toNumber(row.line_id),
        text,
        topX0,
        topY0,
        topX1,
        topY1,
        width: topX1 - topX0,
        height: topY1 - topY0,
        variant: 'default',
        align: 'left',
        parts: optionLabelParts,
        fixedFontSize: 6.95,
        disablePartFit: true,
      },
    ];
  }

  const leaveTypeParts = buildLeaveTypeParts(text);

  if (leaveTypeParts) {
    return [
      {
        id: toNumber(row.line_id),
        text,
        topX0,
        topY0,
        topX1,
        topY1,
        width: topX1 - topX0,
        height: topY1 - topY0,
        variant: 'default',
        align: 'left',
        parts: leaveTypeParts,
      },
    ];
  }

  if (text === 'INCLUSIVE DAYS') {
    return [
      {
        id: toNumber(row.line_id),
        text: 'INCLUSIVE DATES',
        topX0,
        topY0,
        topX1,
        topY1,
        width: topX1 - topX0,
        height: topY1 - topY0,
        variant: getLineVariant(text),
        align: 'left',
        yOffset: -4,
      },
    ];
  }

  if (text === '6.D. COMMUTATION') {
    return [
      {
        id: toNumber(row.line_id),
        text,
        topX0,
        topY0,
        topX1,
        topY1,
        width: topX1 - topX0,
        height: topY1 - topY0,
        variant: getLineVariant(text),
        align: 'left',
        yOffset: 1.5,
      },
    ];
  }

  if (text === '7.B RECOMMENDATION') {
    return [
      {
        id: toNumber(row.line_id),
        text,
        topX0,
        topY0,
        topX1,
        topY1,
        width: topX1 - topX0,
        height: topY1 - topY0,
        variant: getLineVariant(text),
        align: 'left',
        yOffset: 2.2,
      },
    ];
  }

  if (text === 'Vacation Leave' || text === 'Sick Leave') {
    return [
      {
        id: toNumber(row.line_id),
        text,
        topX0,
        topY0,
        topX1,
        topY1,
        width: topX1 - topX0,
        height: topY1 - topY0,
        variant: getLineVariant(text),
        align: 'center',
        fixedFontSize: 8.5,
        disableAutoSize: true,
        padding: 0,
        yOffset: -2.2,
      },
    ];
  }

  if (
    text === '7.C APPROVED FOR:' ||
    text === '_______days with pay' ||
    text === '_______days without pay' ||
    text === '_______others (Specify)' ||
    text === '7.D DISAPPROVED DUE TO:' ||
    text === '_______________________________________'
  ) {
    return [
      {
        id: toNumber(row.line_id),
        text,
        topX0,
        topY0,
        topX1,
        topY1,
        width: topX1 - topX0,
        height: topY1 - topY0,
        variant: getLineVariant(text),
        align: 'left',
        yOffset: 1,
      },
    ];
  }

  if (
    text === 'MARIBEL M. DALAYDAY' ||
    text === 'Chief Statistical Specialist' ||
    text === '(Authorized Official)'
  ) {
    const maribelOffsetY =
      text === 'MARIBEL M. DALAYDAY'
        ? -2
        : text === 'Chief Statistical Specialist'
          ? -2
          : -2;

    return [
      {
        id: toNumber(row.line_id),
        text,
        topX0,
        topY0: topY0 + maribelOffsetY,
        topX1,
        topY1: topY1 + maribelOffsetY,
        width: topX1 - topX0,
        height: topY1 - topY0,
        variant: getLineVariant(text),
        align: 'left',
        yOffset: 0,
      },
    ];
  }

  return [
    {
      id: toNumber(row.line_id),
      text,
      topX0,
      topY0,
      topX1,
      topY1,
      width: topX1 - topX0,
      height: topY1 - topY0,
      variant: getLineVariant(text),
      align: 'left',
      fixedFontSize: null,
    },
  ];
}

function parseDashArray(value) {
  const normalizedValue = String(value ?? '').trim();

  if (!normalizedValue || normalizedValue === '[] 0') {
    return null;
  }

  const matchedNumbers = normalizedValue.match(/-?\d*\.?\d+/g);

  if (!matchedNumbers || matchedNumbers.length < 2) {
    return null;
  }

  return matchedNumbers.slice(0, matchedNumbers.length - 1).join(' ');
}

export const getCscForm6Template = cache(async function getCscForm6Template() {
  const [linesCsv, graphicsJson] = await Promise.all([
    fs.readFile(LINES_CSV_PATH, 'utf8'),
    fs.readFile(GRAPHICS_JSON_PATH, 'utf8'),
  ]);

  const [headerLine, ...rowLines] = linesCsv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headers = parseCsvLine(headerLine);

  const lines = rowLines.flatMap((rowLine) => {
    const values = parseCsvLine(rowLine);
    const row = Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ''])
    );

    return buildTemplateLine(row);
  });

  const graphics = JSON.parse(graphicsJson);
  const firstPage = graphics.pages?.[0] ?? {};

  const drawings = (firstPage.drawings ?? [])
    .map((drawing, index) => {
      const rect = drawing.rect_top_left;

      if (!rect) {
        return null;
      }

      const width = toNumber(rect.width_pt);
      const height = toNumber(rect.height_pt);

      if (width < 2 && height < 2) {
        return null;
      }

      const normalizedDrawing = adjustDetailsOfLeaveUnderline({
        id: `${drawing.seqno ?? index}`,
        x: toNumber(rect.x0_pt),
        y: toNumber(rect.y0_pt),
        width,
        height,
        fillRgb: Array.isArray(drawing.fill_color_rgb)
          ? drawing.fill_color_rgb
          : null,
        strokeRgb: Array.isArray(drawing.stroke_color_rgb)
          ? drawing.stroke_color_rgb
          : null,
        fill: Array.isArray(drawing.fill_color_rgb)
          ? `rgb(${drawing.fill_color_rgb
              .map((component) => Math.round(component * 255))
              .join(', ')})`
          : 'transparent',
        stroke: Array.isArray(drawing.stroke_color_rgb)
          ? `rgb(${drawing.stroke_color_rgb
              .map((component) => Math.round(component * 255))
              .join(', ')})`
          : 'transparent',
        strokeWidth: drawing.width_pt ?? 0,
        dashArray: parseDashArray(drawing.dashes),
        fillOpacity:
          typeof drawing.fill_opacity === 'number' ? drawing.fill_opacity : 1,
        strokeOpacity:
          typeof drawing.stroke_opacity === 'number' ? drawing.stroke_opacity : 1,
      });

      return isStampReceiptDrawing(normalizedDrawing) ? null : normalizedDrawing;
    })
    .filter(Boolean);

  const checkboxDrawings = drawings
    .filter(
      (drawing) =>
        drawing.width >= 8 &&
        drawing.width <= 10 &&
        drawing.height >= 8 &&
        drawing.height <= 10
    )
    .sort((left, right) => left.y - right.y);

  const leftColumnCheckboxes = checkboxDrawings.filter(
    (drawing) => drawing.x >= 35 && drawing.x <= 37
  );

  const rightColumnCheckboxes = checkboxDrawings.filter(
    (drawing) => drawing.x >= 327 && drawing.x <= 330.5
  );

  const checkboxRects = Object.fromEntries(
    [
      ...LEFT_COLUMN_CHECKBOX_KEYS.map((key, index) => [
        key,
        leftColumnCheckboxes[index],
      ]),
      ...RIGHT_COLUMN_CHECKBOX_KEYS.map((key, index) => [
        key,
        rightColumnCheckboxes[index],
      ]),
    ]
      .filter(([, drawing]) => drawing)
      .map(([key, drawing]) => [
        key,
        {
          x: drawing.x,
          y: drawing.y,
          width: drawing.width,
          height: drawing.height,
        },
      ])
  );

  const alignedLines = lines.map((line) => {
    const sixAIndex = getSixALeaveTypeIndex(line.text);

    const checkboxKey =
      sixAIndex !== -1
        ? LEFT_COLUMN_CHECKBOX_KEYS[sixAIndex]
        : RIGHT_COLUMN_LABEL_KEY_BY_TEXT[line.text];

    if (!checkboxKey) {
      return line;
    }

    const checkboxRect = checkboxRects[checkboxKey];

    if (!checkboxRect) {
      return line;
    }

    const renderedHeight = getRenderedLineHeight(line);
    const centeredTop =
      checkboxRect.y + (checkboxRect.height - renderedHeight) / 2 - 1.2;

    return {
      ...line,
      topY0: centeredTop,
      topY1: centeredTop + renderedHeight,
      height: renderedHeight,
      yOffset: 0,
    };
  });

  const images = (firstPage.images ?? []).map((image, index) => {
    const placement = image.placements?.[0]?.rect_top_left;

    if (!placement) {
      return null;
    }

    const originalX = toNumber(placement.x0_pt);
    const originalY = toNumber(placement.y0_pt);
    const originalWidth = toNumber(placement.width_pt);
    const originalHeight = toNumber(placement.height_pt);

    const logoScale = index === 0 ? 0.82 : 1;
    const scaledWidth = originalWidth * logoScale;
    const scaledHeight = originalHeight * logoScale;
    const scaledX = originalX + (originalWidth - scaledWidth) / 2;
    const scaledY = originalY + (originalHeight - scaledHeight) / 2;

    return {
      id: `${image.name ?? index}`,
      x: scaledX,
      y: scaledY,
      width: scaledWidth,
      height: scaledHeight,
      src: index === 0 ? '/icons/PSA.png' : '/icons/Bagong.png',
      alt: index === 0 ? 'PSA logo' : 'Bagong Pilipinas logo',
    };
  });

  const calibratedLines = alignedLines.map(calibrateLine);
  const calibratedDrawings = drawings.map(calibrateDrawing);

  const calibratedCheckboxRects = Object.fromEntries(
    Object.entries(checkboxRects).map(([key, rect]) => [
      key,
      {
        x: calibrateX(rect.x),
        y: calibrateY(rect.y),
        width: calibrateWidth(rect.width),
        height: calibrateHeight(rect.height),
      },
    ])
  );

  const calibratedImages = images.filter(Boolean).map(calibrateImage);

  return {
    pageWidth: toNumber(firstPage.width_pt) || 595.3,
    pageHeight: toNumber(firstPage.height_pt) || 841.9,
    lines: calibratedLines,
    drawings: calibratedDrawings,
    checkboxRects: calibratedCheckboxRects,
    images: calibratedImages,
  };
});