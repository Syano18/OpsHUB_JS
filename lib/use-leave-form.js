import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {
  buildUseLeaveViewData,
  getUseLeaveViewData,
} from '@/lib/use-leave-form-data';

const PUBLIC_DIRECTORY = path.join(process.cwd(), 'public');
const ARIAL_FONT_PATH = path.join(PUBLIC_DIRECTORY, 'fonts', 'ARIAL.TTF');
const ARIAL_BOLD_FONT_PATH = path.join(PUBLIC_DIRECTORY, 'fonts', 'ARIALBD.TTF');
const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production';

const PAGE_WIDTH = 595.3;
const PAGE_HEIGHT = 841.9;
const SCALE = 0.79;
const TOP_MARGIN_PT = 28.34645669291339;
const COLUMN_WIDTHS_PT = [226.5, 190.5, 267.75];
const ROW_HEIGHTS_PT = [
  98.25,
  20.25,
  20.25,
  15,
  15,
  32.25,
  18,
  45.75,
  27,
  27.75,
  18,
  32.25,
  26.25,
  26.25,
  15,
  83.25,
  15,
  15,
  20.25,
  45,
  26.25,
  15,
  58.5,
  18.75,
  15,
  15,
  15,
  15,
  15,
  15,
  15,
  15,
  15,
  15,
  15,
  15,
  15,
  15.75,
  15,
];

const TOTAL_COL_WIDTH_PT = COLUMN_WIDTHS_PT.reduce((sum, width) => sum + width, 0);
const LEFT_OFFSET_PT = (PAGE_WIDTH - TOTAL_COL_WIDTH_PT * SCALE) / 2;

let arialFontBytesPromise = null;
const imageBytesPromiseByPath = new Map();
let staticBasePdfPromise = null;
let useLeaveWarmupPromise = null;

function normalizeText(value) {
  return String(value ?? '').trim();
}

function buildDownloadFileName(fullName, dateAvailed) {
  const safeName = normalizeText(fullName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const safeDate = normalizeText(dateAvailed)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const dateSuffix = safeDate ? `-${safeDate}` : '';

  return `use-leave-${safeName || 'employee'}${dateSuffix}.pdf`;
}

async function getArialFontBytes() {
  if (!arialFontBytesPromise) {
    arialFontBytesPromise = Promise.all([
      fs.readFile(ARIAL_FONT_PATH),
      fs.readFile(ARIAL_BOLD_FONT_PATH),
    ]);
  }

  return arialFontBytesPromise;
}

async function getImageBytes(imagePath) {
  if (!imageBytesPromiseByPath.has(imagePath)) {
    imageBytesPromiseByPath.set(imagePath, fs.readFile(imagePath));
  }

  return imageBytesPromiseByPath.get(imagePath);
}

async function embedArialFonts(pdf) {
  try {
    const [regularBytes, boldBytes] = await getArialFontBytes();

    return {
      regular: await pdf.embedFont(regularBytes),
      bold: await pdf.embedFont(boldBytes),
    };
  } catch {
    return null;
  }
}

async function embedDynamicBoldFont(pdf) {
  try {
    const [, boldBytes] = await getArialFontBytes();
    return await pdf.embedFont(boldBytes);
  } catch {
    return await pdf.embedFont(StandardFonts.HelveticaBold);
  }
}

function getColLeft(colIndex) {
  let offset = LEFT_OFFSET_PT;

  for (let index = 1; index < colIndex; index += 1) {
    offset += COLUMN_WIDTHS_PT[index - 1] * SCALE;
  }

  return offset;
}

function getColWidth(colIndex, colSpan = 1) {
  let width = 0;

  for (let index = 0; index < colSpan; index += 1) {
    width += COLUMN_WIDTHS_PT[colIndex - 1 + index] * SCALE;
  }

  return width;
}

function getRowTop(rowIndex) {
  let offset = TOP_MARGIN_PT;

  for (let index = 1; index < rowIndex; index += 1) {
    offset += ROW_HEIGHTS_PT[index - 1] * SCALE;
  }

  return offset;
}

function getRowHeight(rowIndex, rowSpan = 1) {
  let height = 0;

  for (let index = 0; index < rowSpan; index += 1) {
    height += ROW_HEIGHTS_PT[rowIndex - 1 + index] * SCALE;
  }

  return height;
}

function getCellBox(rowIndex, colIndex, colSpan = 1, rowSpan = 1) {
  return {
    x: getColLeft(colIndex),
    y: getRowTop(rowIndex),
    width: getColWidth(colIndex, colSpan),
    height: getRowHeight(rowIndex, rowSpan),
  };
}

function wrapTextToWidth(font, text, size, maxWidth) {
  const paragraphs = String(text ?? '').split('\n');
  const lines = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);

    if (!words.length) {
      lines.push('');
      continue;
    }

    let currentLine = '';

    for (const word of words) {
      const nextLine = currentLine ? `${currentLine} ${word}` : word;
      const nextLineWidth = font.widthOfTextAtSize(nextLine, size);

      if (!currentLine || nextLineWidth <= maxWidth) {
        currentLine = nextLine;
        continue;
      }

      lines.push(currentLine);
      currentLine = word;
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines.length ? lines : [''];
}

function drawTextInBox(page, text, box, options) {
  const {
    font,
    size,
    align = 'left',
    valign = 'middle',
    color = rgb(0, 0, 0),
    padding = 2,
    lineHeight = size * 1.2,
    noWrap = false,
  } = options;

  const maxWidth = Math.max(1, box.width - padding * 2);
  const lines = noWrap
    ? String(text ?? '').split('\n')
    : wrapTextToWidth(font, text, size, maxWidth);
  const totalHeight = lines.length * lineHeight;
  const startY =
    valign === 'top'
      ? box.y + padding
      : box.y + Math.max(0, (box.height - totalHeight) / 2);

  lines.forEach((line, index) => {
    const lineWidth = font.widthOfTextAtSize(line, size);
    const offsetX =
      align === 'center'
        ? Math.max(0, (maxWidth - lineWidth) / 2)
        : align === 'right'
          ? Math.max(0, maxWidth - lineWidth)
          : 0;
    const x = box.x + padding + offsetX;
    const yTop = startY + index * lineHeight;
    const y = PAGE_HEIGHT - yTop - size;

    page.drawText(line, {
      x,
      y,
      size,
      font,
      color,
    });
  });
}

function drawLine(page, startX, endX, yTop, thickness = 1) {
  page.drawLine({
    start: { x: startX, y: PAGE_HEIGHT - yTop },
    end: { x: endX, y: PAGE_HEIGHT - yTop },
    thickness,
    color: rgb(0, 0, 0),
  });
}

async function drawHeaderImages(pdf, page) {
  const psaPath = path.join(PUBLIC_DIRECTORY, 'icons', 'PSA.png');
  const usePath = path.join(PUBLIC_DIRECTORY, 'icons', 'Use.png');
  const [psaBytes, useBytes] = await Promise.all([
    getImageBytes(psaPath),
    getImageBytes(usePath),
  ]);

  const [psaImage, useImage] = await Promise.all([
    pdf.embedPng(psaBytes),
    pdf.embedPng(useBytes),
  ]);

  const headerLeftBox = getCellBox(1, 1);
  const headerRightBox = getCellBox(1, 3);
  const padding = 6;
  const logoScale = 1;

  const psaFit = psaImage.scaleToFit(
    headerLeftBox.width - padding * 2,
    headerLeftBox.height - padding * 2
  );
  const useFit = useImage.scaleToFit(
    headerRightBox.width - padding * 2,
    headerRightBox.height - padding * 2
  );

  const psaSize = {
    width: psaFit.width * logoScale,
    height: psaFit.height * logoScale,
  };
  const useLogoScale = 0.75;
  const useSize = {
    width: useFit.width * useLogoScale,
    height: useFit.height * useLogoScale,
  };

  const psaTop = headerLeftBox.y + (headerLeftBox.height - psaSize.height) / 2;
  const useTop = headerRightBox.y + (headerRightBox.height - useSize.height) / 2;

  page.drawImage(psaImage, {
    x: headerLeftBox.x + (headerLeftBox.width - psaSize.width) / 2,
    y: PAGE_HEIGHT - psaTop - psaSize.height,
    width: psaSize.width,
    height: psaSize.height,
  });

  page.drawImage(useImage, {
    x: headerRightBox.x + (headerRightBox.width - useSize.width) / 2,
    y: PAGE_HEIGHT - useTop - useSize.height,
    width: useSize.width,
    height: useSize.height,
  });
}

function drawStaticTemplate(page, fonts) {
  const headerTextBox = getCellBox(1, 2);
  const headerLineGap = 2;
  const headerLineOneSize = 12.5;
  const headerLineTwoSize = 10.5;
  const headerTotalHeight = headerLineOneSize + headerLineTwoSize + headerLineGap;
  const headerStartY =
    headerTextBox.y + Math.max(0, (headerTextBox.height - headerTotalHeight) / 2);

  const headerLineOne = 'Philippine Statistics Authority';
  const headerLineTwo = 'Union of Statistics Employees';
  const headerLineOneWidth = fonts.bold.widthOfTextAtSize(
    headerLineOne,
    headerLineOneSize
  );
  const headerLineTwoWidth = fonts.bold.widthOfTextAtSize(
    headerLineTwo,
    headerLineTwoSize
  );
  const headerLineOneX = Math.max(0, (PAGE_WIDTH - headerLineOneWidth) / 2);
  const headerLineTwoX = Math.max(0, (PAGE_WIDTH - headerLineTwoWidth) / 2);

  page.drawText(headerLineOne, {
    x: headerLineOneX,
    y: PAGE_HEIGHT - headerStartY - headerLineOneSize,
    size: headerLineOneSize,
    font: fonts.bold,
    color: rgb(0, 0, 0),
  });

  page.drawText(headerLineTwo, {
    x: headerLineTwoX,
    y: PAGE_HEIGHT - headerStartY - headerLineOneSize - headerLineGap - headerLineTwoSize,
    size: headerLineTwoSize,
    font: fonts.bold,
    color: rgb(0, 0, 0),
  });

  const staticLines = [
    {
      row: 2,
      col: 1,
      colSpan: 3,
      text: 'APPLICATION/REQUEST FOR NON-CUMULATIVE AND',
      font: fonts.bold,
      size: 11,
      align: 'center',
    },
    {
      row: 3,
      col: 1,
      colSpan: 3,
      text: 'COMMUTATIVE COMPENSATORY DAY OFF',
      font: fonts.bold,
      size: 11,
      align: 'center',
    },
    {
      row: 4,
      col: 1,
      colSpan: 3,
      text: '(Per 2023 USE Collective Negotiation Agreement)',
      font: fonts.regular,
      size: 9,
      align: 'center',
    },
    {
      row: 6,
      col: 1,
      colSpan: 3,
      text: "MEMBER'S PROFILE",
      font: fonts.bold,
      size: 12,
      align: 'center',
    },
    {
      row: 7,
      col: 1,
      text: '1. (Last Name)',
      font: fonts.regular,
      size: 9,
      align: 'center',
    },
    {
      row: 7,
      col: 2,
      text: '(First Name)',
      font: fonts.regular,
      size: 9,
      align: 'center',
    },
    {
      row: 7,
      col: 3,
      text: '(Middle Name)',
      font: fonts.regular,
      size: 9,
      align: 'center',
    },
    {
      row: 9,
      col: 1,
      text: '2. Position/Designation:',
      font: fonts.regular,
      size: 9,
      align: 'left',
    },
    {
      row: 9,
      col: 3,
      text: '3. Salary Grade:',
      font: fonts.regular,
      size: 9,
      align: 'left',
    },
    {
      row: 10,
      col: 1,
      colSpan: 3,
      text: '4.Office/Service/Division/RSSO/PSO:',
      font: fonts.regular,
      size: 9,
      align: 'left',
    },
    {
      row: 12,
      col: 1,
      colSpan: 3,
      text: 'DETAILS OF AVAILMENT',
      font: fonts.bold,
      size: 12,
      align: 'center',
    },
    {
      row: 13,
      col: 1,
      text: '5. Date of Filing:',
      font: fonts.regular,
      size: 9,
      align: 'left',
    },
    {
      row: 13,
      col: 2,
      text: '6. Where Day-off will be spent:',
      font: fonts.regular,
      size: 9,
      align: 'left',
    },
    {
      row: 14,
      col: 1,
      text: '7. No. of Days Availed:',
      font: fonts.regular,
      size: 9,
      align: 'left',
    },
    {
      row: 14,
      col: 2,
      text: '8. Date/s Availed:',
      font: fonts.regular,
      size: 9,
      align: 'left',
    },
    {
      row: 17,
      col: 1,
      colSpan: 3,
      text: 'Signature over printed name of the member',
      font: fonts.regular,
      size: 9,
      align: 'center',
      valign: 'top',
      yOffset: -3,
    },
    {
      row: 19,
      col: 1,
      colSpan: 3,
      text: '9. ACTION ON THE APPLICATION',
      font: fonts.bold,
      size: 12,
      align: 'left',
    },
    {
      row: 21,
      col: 1,
      text: 'Noted by:',
      font: fonts.bold,
      size: 10,
      align: 'left',
    },
    {
      row: 21,
      col: 3,
      text: 'Recommending Approval:',
      font: fonts.bold,
      size: 10,
      align: 'left',
    },
    {
      row: 24,
      col: 1,
      text: 'Chapter President',
      font: fonts.regular,
      size: 9,
      align: 'center',
      valign: 'top',
      yOffset: -10,
    },
    {
      row: 24,
      col: 3,
      text: 'HRMO',
      font: fonts.regular,
      size: 9,
      align: 'center',
      valign: 'top',
      yOffset: -10,
    },
    {
      row: 25,
      col: 1,
      text: 'Date:',
      font: fonts.regular,
      size: 9,
      align: 'left',
    },
    {
      row: 25,
      col: 3,
      text: 'Date:',
      font: fonts.regular,
      size: 9,
      align: 'left',
    },
    {
      row: 30,
      col: 1,
      colSpan: 3,
      text: 'APPROVED:',
      font: fonts.bold,
      size: 10,
      align: 'left',
    },
    {
      row: 33,
      col: 2,
      text: 'CSS',
      font: fonts.regular,
      size: 9,
      align: 'center',
      valign: 'top',
      yOffset: -3,
    },
    {
      row: 37,
      col: 1,
      colSpan: 3,
      text: 'Note: This Form is for USE Member only',
      font: fonts.regular,
      size: 8.5,
      align: 'left',
    },
    {
      row: 38,
      col: 1,
      colSpan: 3,
      text: '2023 CNA Article II, Series 8',
      font: fonts.regular,
      size: 8.5,
      align: 'left',
    },
  ];

  staticLines.forEach((line) => {
    const box = getCellBox(line.row, line.col, line.colSpan ?? 1, 1);
    
    // Allow custom vertical adjust for static text if specified
    if (line.yOffset) {
      box.y += line.yOffset;
    }

    drawTextInBox(page, line.text, box, {
      font: line.font,
      size: line.size,
      align: line.align,
      valign: line.valign,
    });
  });

  const labelSize = 9;
  const labelPadding = 6;
  const lineYOffsetFactor = 0.72;

  const dateLabelWidth = fonts.regular.widthOfTextAtSize('5. Date of Filing:', labelSize);
  const dateRowBox = getCellBox(13, 1);
  drawLine(
    page,
    dateRowBox.x + dateLabelWidth + labelPadding,
    dateRowBox.x + dateRowBox.width - 4,
    dateRowBox.y + dateRowBox.height * lineYOffsetFactor
  );

  const daysLabelWidth = fonts.regular.widthOfTextAtSize('7. No. of Days Availed:', labelSize);
  const daysRowBox = getCellBox(14, 1);
  drawLine(
    page,
    daysRowBox.x + daysLabelWidth + labelPadding,
    daysRowBox.x + daysRowBox.width - 4,
    daysRowBox.y + daysRowBox.height * lineYOffsetFactor
  );

  const dayOffRowBox = getCellBox(13, 3);
  drawLine(
    page,
    dayOffRowBox.x + 4,
    dayOffRowBox.x + dayOffRowBox.width - 4,
    dayOffRowBox.y + dayOffRowBox.height * lineYOffsetFactor
  );

  const datesRowBox = getCellBox(14, 3);
  drawLine(
    page,
    datesRowBox.x + 4,
    datesRowBox.x + datesRowBox.width - 4,
    datesRowBox.y + datesRowBox.height * lineYOffsetFactor
  );

  const signatureRowBox = getCellBox(16, 1, 3);
  const sigLineWidth = 210;
  const sigLineX = signatureRowBox.x + (signatureRowBox.width - sigLineWidth) / 2;
  drawLine(
    page,
    sigLineX,
    sigLineX + sigLineWidth,
    signatureRowBox.y + signatureRowBox.height * 0.90
  );

  const notedLineBox = getCellBox(23, 1);
  drawLine(
    page,
    notedLineBox.x + 8,
    notedLineBox.x + notedLineBox.width - 8,
    notedLineBox.y + notedLineBox.height * 0.7
  );
  drawTextInBox(page, 'RANDOLF M. LADERAS', {
    x: notedLineBox.x,
    y: notedLineBox.y + notedLineBox.height * 0.7 - 14,
    width: notedLineBox.width,
    height: 12,
  }, {
    font: fonts.bold,
    size: 11,
    align: 'center',
  });

  const recommendLineBox = getCellBox(23, 3);
  drawLine(
    page,
    recommendLineBox.x + 8,
    recommendLineBox.x + recommendLineBox.width - 8,
    recommendLineBox.y + recommendLineBox.height * 0.7
  );
  drawTextInBox(page, 'DONAH GRACE C. CAPULAC', {
    x: recommendLineBox.x,
    y: recommendLineBox.y + recommendLineBox.height * 0.7 - 14,
    width: recommendLineBox.width,
    height: 12,
  }, {
    font: fonts.bold,
    size: 11,
    align: 'center',
  });

  const notedDateBox = getCellBox(25, 1);
  drawLine(
    page,
    notedDateBox.x + 36,
    notedDateBox.x + notedDateBox.width - 8,
    notedDateBox.y + notedDateBox.height * 0.7
  );

  const recommendDateBox = getCellBox(25, 3);
  drawLine(
    page,
    recommendDateBox.x + 36,
    recommendDateBox.x + recommendDateBox.width - 8,
    recommendDateBox.y + recommendDateBox.height * 0.7
  );

  const approveLineBox = getCellBox(32, 2);
  drawLine(
    page,
    approveLineBox.x + 8,
    approveLineBox.x + approveLineBox.width - 8,
    approveLineBox.y + approveLineBox.height * 0.7
  );
  drawTextInBox(page, 'MARIBEL M. DALAYDAY', {
    x: approveLineBox.x,
    y: approveLineBox.y + approveLineBox.height * 0.7 - 14,
    width: approveLineBox.width,
    height: 12,
  }, {
    font: fonts.bold,
    size: 11,
    align: 'center',
  });
}

function drawUseLeaveEntries(page, data, fonts) {
  const nameSize = 10;
  const nameYOffset = -10;
  
  const lastNameBox = getCellBox(8, 1);
  lastNameBox.y += nameYOffset;
  drawTextInBox(page, data.nameParts?.lastName || '', lastNameBox, {
    font: fonts.bold,
    size: nameSize,
    align: 'center',
  });

  const firstNameBox = getCellBox(8, 2);
  firstNameBox.y += nameYOffset;
  drawTextInBox(page, data.nameParts?.firstName || '', firstNameBox, {
    font: fonts.bold,
    size: nameSize,
    align: 'center',
  });

  const middleNameBox = getCellBox(8, 3);
  middleNameBox.y += nameYOffset;
  drawTextInBox(page, data.nameParts?.middleName || '', middleNameBox, {
    font: fonts.bold,
    size: nameSize,
    align: 'center',
  });

  const labelSize = 9;
  const positionLabelWidth = fonts.regular.widthOfTextAtSize(
    '2. Position/Designation:',
    labelSize
  );
  const positionBox = getCellBox(9, 1, 2);
  drawTextInBox(page, data.position || '', {
    x: positionBox.x + positionLabelWidth + 8,
    y: positionBox.y,
    width: Math.max(1, positionBox.width - positionLabelWidth - 12),
    height: positionBox.height,
  }, {
    font: fonts.bold,
    size: 9,
    align: 'left',
  });

  const salaryLabelWidth = fonts.regular.widthOfTextAtSize('3. Salary Grade:', labelSize);
  const salaryBox = getCellBox(9, 3);
  drawTextInBox(page, data.salaryGrade || '', {
    x: salaryBox.x + salaryLabelWidth + 8,
    y: salaryBox.y,
    width: Math.max(1, salaryBox.width - salaryLabelWidth - 12),
    height: salaryBox.height,
  }, {
    font: fonts.bold,
    size: 9,
    align: 'left',
  });

  const officeLabelWidth = fonts.regular.widthOfTextAtSize(
    '4.Office/Service/Division/RSSO/PSO:',
    labelSize
  );
  const officeBox = getCellBox(10, 1, 3);
  drawTextInBox(page, data.officeDepartment || '', {
    x: officeBox.x + officeLabelWidth + 8,
    y: officeBox.y,
    width: Math.max(1, officeBox.width - officeLabelWidth - 12),
    height: officeBox.height,
  }, {
    font: fonts.bold,
    size: 9,
    align: 'left',
  });

  const dateLabelWidth = fonts.regular.widthOfTextAtSize('5. Date of Filing:', labelSize);
  const dataYOffset = 0; // Shift data upwards from the underlines
  const dateBox = getCellBox(13, 1);
  drawTextInBox(page, data.dateFiled || '', {
    x: dateBox.x + dateLabelWidth + 8,
    y: dateBox.y + dataYOffset - 1,
    width: Math.max(1, dateBox.width - dateLabelWidth - 12),
    height: dateBox.height,
  }, {
    font: fonts.bold,
    size: 9,
    align: 'left',
  });

  const dayOffPlaceBox = getCellBox(13, 3);
  drawTextInBox(page, data.dayOffPlace || '', {
    x: dayOffPlaceBox.x + 4,
    y: dayOffPlaceBox.y + dataYOffset - 1,
    width: Math.max(1, dayOffPlaceBox.width - 8),
    height: dayOffPlaceBox.height,
  }, {
    font: fonts.bold,
    size: 9,
    align: 'left',
  });

  const daysLabelWidth = fonts.regular.widthOfTextAtSize('7. No. of Days Availed:', labelSize);
  const daysBox = getCellBox(14, 1);
  drawTextInBox(page, data.requestedDays || '', {
    x: daysBox.x + daysLabelWidth + 8,
    y: daysBox.y + dataYOffset - 1,
    width: Math.max(1, daysBox.width - daysLabelWidth - 12),
    height: daysBox.height,
  }, {
    font: fonts.bold,
    size: 9,
    align: 'left',
  });

  const dateAvailedBox = getCellBox(14, 3);
  drawTextInBox(page, data.dateAvailed || '', {
    x: dateAvailedBox.x + 4,
    y: dateAvailedBox.y + dataYOffset - 1,
    width: Math.max(1, dateAvailedBox.width - 8),
    height: dateAvailedBox.height,
  }, {
    font: fonts.bold,
    size: 8.5,
    align: 'left',
  });

  const signatureRowBox = getCellBox(16, 1, 3);
  drawTextInBox(page, data.employeeName.toUpperCase() || '', {
    x: signatureRowBox.x,
    y: signatureRowBox.y + signatureRowBox.height * 0.90 - 14,
    width: signatureRowBox.width,
    height: 12,
  }, {
    font: fonts.bold,
    size: 11,
    align: 'center',
  });
}

async function buildStaticBasePdf() {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const arialFonts = await embedArialFonts(pdf);
  const fonts = {
    regular: arialFonts?.regular ?? (await pdf.embedFont(StandardFonts.Helvetica)),
    bold: arialFonts?.bold ?? (await pdf.embedFont(StandardFonts.HelveticaBold)),
  };

  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  await drawHeaderImages(pdf, page);
  drawStaticTemplate(page, fonts);

  return {
    bytes: await pdf.save(),
  };
}

async function getStaticBasePdf() {
  if (!staticBasePdfPromise) {
    staticBasePdfPromise = buildStaticBasePdf().catch((error) => {
      staticBasePdfPromise = null;
      throw error;
    });
  }

  return staticBasePdfPromise;
}

export async function prewarmUseLeaveAssets() {
  if (!useLeaveWarmupPromise) {
    useLeaveWarmupPromise = (async () => {
      const startedAt = process.hrtime.bigint();
      await getStaticBasePdf();

      if (IS_DEVELOPMENT) {
        const totalMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        console.info(`[USE Leave PDF] warmup=${totalMs.toFixed(1)}ms`);
      }

      return {
        warmedAt: new Date().toISOString(),
      };
    })().catch((error) => {
      useLeaveWarmupPromise = null;
      throw error;
    });
  }

  return useLeaveWarmupPromise;
}

export async function generateUseLeavePdf(groupIdentifier, options = {}) {
  const prefetchedLeaveRequestGroup = options.leaveRequestGroup ?? null;
  const prefetchedEmployee = options.employee ?? null;
  const startedAt = process.hrtime.bigint();
  const stageTimes = {};
  let stageStart = startedAt;
  const markStage = (name) => {
    const now = process.hrtime.bigint();
    stageTimes[name] = Number(now - stageStart) / 1_000_000;
    stageStart = now;
  };

  const formDataPromise = prefetchedLeaveRequestGroup && prefetchedEmployee
    ? Promise.resolve(buildUseLeaveViewData(prefetchedLeaveRequestGroup, prefetchedEmployee))
    : getUseLeaveViewData(groupIdentifier);

  const formData = await formDataPromise;
  markStage('data');

  const { bytes: basePdfBytes } = await getStaticBasePdf();
  markStage('staticBase');

  const pdf = await PDFDocument.load(basePdfBytes);
  pdf.registerFontkit(fontkit);
  const [arialFonts, dynamicBoldFont] = await Promise.all([
    embedArialFonts(pdf),
    embedDynamicBoldFont(pdf),
  ]);
  const fonts = {
    bold: dynamicBoldFont,
    regular: arialFonts?.regular ?? (await pdf.embedFont(StandardFonts.Helvetica)),
  };
  markStage('fonts');

  const page = pdf.getPages()[0];
  drawUseLeaveEntries(page, formData, fonts);
  markStage('render');

  const bytes = await pdf.save();
  markStage('save');

  if (IS_DEVELOPMENT) {
    const totalMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    console.info(
      `[USE Leave PDF] group=${normalizeText(groupIdentifier) || 'unknown'} ` +
        `data=${stageTimes.data?.toFixed(1) || '0.0'}ms ` +
        `staticBase=${stageTimes.staticBase?.toFixed(1) || '0.0'}ms ` +
        `fonts=${stageTimes.fonts?.toFixed(1) || '0.0'}ms ` +
        `render=${stageTimes.render?.toFixed(1) || '0.0'}ms ` +
        `save=${stageTimes.save?.toFixed(1) || '0.0'}ms ` +
        `total=${totalMs.toFixed(1)}ms`
    );
  }

  return {
    bytes,
    fileName: buildDownloadFileName(formData.employeeName, formData.dateAvailed),
  };
}
