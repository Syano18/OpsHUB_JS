import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {
  buildCscForm6ViewData,
  getCscForm6ViewData,
} from '@/lib/csc-form-6-data';
import { getCscForm6Template } from '@/lib/csc-form-6-template';

const PUBLIC_DIRECTORY = path.join(process.cwd(), 'public');
const ARIAL_FONT_PATH = path.join(PUBLIC_DIRECTORY, 'fonts', 'ARIAL.TTF');
const ARIAL_BOLD_FONT_PATH = path.join(PUBLIC_DIRECTORY, 'fonts', 'ARIALBD.TTF');
const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production';
const CONTENT_MARGIN_PT = 18;

let arialFontBytesPromise = null;
const imageBytesPromiseByPath = new Map();
let staticBasePdfPromise = null;
let cscFormWarmupPromise = null;

function normalizeText(value) {
  return String(value ?? '').trim();
}

function formatInclusiveDatesForFilename(inclusiveDates) {
  const normalizedDates = normalizeText(inclusiveDates);

  if (!normalizedDates) {
    return '';
  }

  const monthNumberByName = {
    jan: '01',
    january: '01',
    feb: '02',
    february: '02',
    mar: '03',
    march: '03',
    apr: '04',
    april: '04',
    may: '05',
    jun: '06',
    june: '06',
    jul: '07',
    july: '07',
    aug: '08',
    august: '08',
    sep: '09',
    sept: '09',
    september: '09',
    oct: '10',
    october: '10',
    nov: '11',
    november: '11',
    dec: '12',
    december: '12',
  };

  const monthMatch = normalizedDates.match(/^([A-Za-z]+)\s+(\d{1,2}(?:-\d{1,2})*),\s*(\d{4})$/);

  if (monthMatch) {
    const monthToken = monthMatch[1].toLowerCase();
    const monthNumber = monthNumberByName[monthToken.slice(0, 4)] || monthNumberByName[monthToken.slice(0, 3)] || monthNumberByName[monthToken];
    if (monthNumber) {
      return `${monthNumber}-${monthMatch[2]}-${monthMatch[3]}`;
    }
  }

  return normalizedDates
    .toLowerCase()
    .replace(/[^0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildDownloadFileName(fullName, leaveType, inclusiveDates) {
  const safeName = normalizeText(fullName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const safeLeaveType = normalizeText(leaveType)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const safeInclusiveDates = formatInclusiveDatesForFilename(inclusiveDates);
  const dateStr = safeInclusiveDates ? `-${safeInclusiveDates}` : '';

  return `csc-form-6-${safeName || 'employee'}-${safeLeaveType || 'leave'}${dateStr}.pdf`;
}

function resolveRgbColor(components, fallback = undefined) {
  if (!Array.isArray(components) || components.length < 3) {
    return fallback;
  }

  return rgb(
    Number(components[0]) || 0,
    Number(components[1]) || 0,
    Number(components[2]) || 0
  );
}

function getLineFont(variant, fonts) {
  switch (variant) {
    case 'mainTitle':
    case 'bold':
    case 'section':
      return fonts.bold;
    case 'italic':
      return fonts.italic;
    case 'agency':
      return fonts.serif;
    default:
      return fonts.regular;
  }
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

  return lines.filter((line, index) => line || index === lines.length - 1);
}

function fitTextSizeToWidth(font, text, initialSize, maxWidth, minimumSize = 7) {
  let size = initialSize;

  while (size > minimumSize && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.25;
  }

  return size;
}

function fitTemplatePartSizes(parts, fonts, initialSize, maxWidth, minimumSize = 5.5) {
  let baseSize = initialSize;

  while (baseSize > minimumSize) {
    const totalWidth = parts.reduce((sum, part) => {
      const font = getLineFont(part.variant, fonts);
      const size = Math.max(minimumSize, baseSize * (part.fontScale || 1));
      return sum + font.widthOfTextAtSize(part.text, size);
    }, 0);

    if (totalWidth <= maxWidth) {
      break;
    }

    baseSize -= 0.25;
  }

  return parts.map((part) => ({
    ...part,
    font: getLineFont(part.variant, fonts),
    size: Math.max(minimumSize, baseSize * (part.fontScale || 1)),
  }));
}

function getContentBounds(template, entries) {
  const xs = [];
  const ys = [];

  for (const drawing of template.drawings ?? []) {
    xs.push(drawing.x, drawing.x + drawing.width);
    ys.push(drawing.y, drawing.y + drawing.height);
  }

  for (const line of template.lines ?? []) {
    xs.push(line.topX0, line.topX1);
    ys.push(line.topY0, line.topY1);
  }

  for (const image of template.images ?? []) {
    xs.push(image.x, image.x + image.width);
    ys.push(image.y, image.y + image.height);
  }

  for (const mark of entries.marks ?? []) {
    const checkboxRect = template.checkboxRects?.[mark.checkboxKey] ?? mark.fallbackRect;

    if (!checkboxRect) {
      continue;
    }

    xs.push(checkboxRect.x, checkboxRect.x + checkboxRect.width);
    ys.push(checkboxRect.y, checkboxRect.y + checkboxRect.height);
  }

  for (const entry of entries.values ?? []) {
    xs.push(entry.left, entry.left + entry.width);
    ys.push(entry.top, entry.top + (entry.lineHeight || entry.size || 10) * 1.2);
  }

  return {
    minX: xs.length ? Math.min(...xs) : 0,
    minY: ys.length ? Math.min(...ys) : 0,
    maxX: xs.length ? Math.max(...xs) : template.pageWidth,
    maxY: ys.length ? Math.max(...ys) : template.pageHeight,
  };
}

function createPdfLayout(template, bounds) {
  const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
  const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
  const availableWidth = Math.max(1, template.pageWidth - CONTENT_MARGIN_PT * 2);
  const availableHeight = Math.max(1, template.pageHeight - CONTENT_MARGIN_PT * 2);
  const scaleX = availableWidth / contentWidth;
  const scaleY = availableHeight / contentHeight;

  return {
    minX: bounds.minX,
    minY: bounds.minY,
    padX: CONTENT_MARGIN_PT,
    padY: CONTENT_MARGIN_PT,
    scaleX,
    scaleY,
    pageWidth: template.pageWidth,
    pageHeight: template.pageHeight,
  };
}

function scaleX(x, layout) {
  return layout.padX + (x - layout.minX) * layout.scaleX;
}

function scaleTopY(y, layout) {
  return layout.padY + (y - layout.minY) * layout.scaleY;
}

function getTextBoxPadding(size) {
  return Math.max(2, size * 0.25);
}

function drawTemplateText(page, template, fonts, layout) {
  const fontScale = Math.min(layout.scaleX, layout.scaleY);

  for (const line of template.lines) {
    const sourceFontSize = line.fixedFontSize ?? Math.max(8.5, line.height * 0.92);
    const baseFontSize = sourceFontSize * fontScale;
    const y =
      layout.pageHeight -
      scaleTopY(line.topY1, layout) +
      0.5 -
      (line.yOffset || 0) * layout.scaleY;

    if (line.parts?.length) {
      const sourcePadding = line.padding ?? getTextBoxPadding(sourceFontSize);
      const partPadding = sourcePadding * layout.scaleX;
      const partMaxWidth = Math.max(1, line.width * layout.scaleX - partPadding * 2);
      const resolvedParts = line.disableAutoSize || line.disablePartFit
        ? line.parts.map((part) => ({
            ...part,
            font: getLineFont(part.variant, fonts),
            size: Math.max(5.5, baseFontSize * (part.fontScale || 1)),
          }))
        : fitTemplatePartSizes(line.parts, fonts, baseFontSize, partMaxWidth, 5.5);
      const totalWidth = resolvedParts.reduce(
        (sum, part) => sum + part.font.widthOfTextAtSize(part.text, part.size),
        0
      );
      let currentX =
        line.align === 'center'
          ? scaleX(line.topX0, layout) + partPadding + Math.max(0, partMaxWidth - totalWidth) / 2
          : scaleX(line.topX0, layout) + partPadding;

      for (const part of resolvedParts) {
        page.drawText(part.text, {
          x: currentX,
          y,
          size: part.size,
          font: part.font,
          color: rgb(0, 0, 0),
        });

        currentX += part.font.widthOfTextAtSize(part.text, part.size);
      }

      continue;
    }

    const font = getLineFont(line.variant, fonts);
    const sourcePadding = line.padding ?? (line.disableAutoSize ? 0 : getTextBoxPadding(sourceFontSize));
    const textPadding = sourcePadding * layout.scaleX;
    const maxTextWidth = Math.max(1, line.width * layout.scaleX - textPadding * 2);
    const fontSize = line.disableAutoSize
      ? baseFontSize
      : fitTextSizeToWidth(font, line.text, baseFontSize, maxTextWidth, 5.5);
    const textWidth = font.widthOfTextAtSize(line.text, fontSize);
    const x =
      line.align === 'center'
        ? scaleX(line.topX0, layout) + textPadding + Math.max(0, maxTextWidth - textWidth) / 2
        : scaleX(line.topX0, layout) + textPadding;

    page.drawText(line.text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  }
}

function isCheckboxDrawing(drawing) {
  return (
    drawing.width >= 7 &&
    drawing.width <= 12 &&
    drawing.height >= 7 &&
    drawing.height <= 12
  );
}

function isThinLineDrawing(drawing) {
  return !isCheckboxDrawing(drawing) && (drawing.width <= 3 || drawing.height <= 3);
}

function drawTemplateRectangleFills(page, template, layout) {
  for (const drawing of template.drawings) {
    const fillColor = resolveRgbColor(drawing.fillRgb);

    // Do not draw extracted thin border pieces here.
    // They must be merged and drawn later as continuous lines.
    if (!fillColor || isThinLineDrawing(drawing)) {
      continue;
    }

    const scaledHeight = drawing.height * layout.scaleY;
    page.drawRectangle({
      x: scaleX(drawing.x, layout),
      y: layout.pageHeight - scaleTopY(drawing.y, layout) - scaledHeight,
      width: drawing.width * layout.scaleX,
      height: scaledHeight,
      color: fillColor,
      opacity: drawing.fillOpacity,
      borderWidth: 0,
    });
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mergeLineSegments(segments, orientation, tolerance = 1.5, maxGap = 8) {
  const groups = [];

  for (const segment of segments) {
    const fixed = orientation === 'vertical' ? segment.x : segment.y;
    let group = groups.find((item) => Math.abs(item.fixed - fixed) <= tolerance);

    if (!group) {
      group = { fixed, segments: [] };
      groups.push(group);
    }

    group.segments.push(segment);
  }

  const merged = [];

  for (const group of groups) {
    const sorted = group.segments
      .map((segment) => ({
        ...segment,
        start: orientation === 'vertical' ? Math.min(segment.y1, segment.y2) : Math.min(segment.x1, segment.x2),
        end: orientation === 'vertical' ? Math.max(segment.y1, segment.y2) : Math.max(segment.x1, segment.x2),
      }))
      .sort((a, b) => a.start - b.start);

    let current = null;

    for (const segment of sorted) {
      if (!current) {
        current = { ...segment };
        continue;
      }

      if (segment.start <= current.end + maxGap) {
        current.end = Math.max(current.end, segment.end);
        current.thickness = Math.max(current.thickness, segment.thickness);
        continue;
      }

      merged.push(current);
      current = { ...segment };
    }

    if (current) {
      merged.push(current);
    }
  }

  return merged;
}

function drawTemplateRectangleBorders(page, template, layout) {
  const strokeScale = Math.min(layout.scaleX, layout.scaleY);
  const overlap = 0;
  const verticalSegments = [];
  const horizontalSegments = [];
  const boxSegments = [];

  for (const drawing of template.drawings) {
    const strokeColor = resolveRgbColor(drawing.strokeRgb);
    const fillColor = resolveRgbColor(drawing.fillRgb);
    const lineColor = strokeColor || fillColor;

    if (!lineColor) {
      continue;
    }

    const x = scaleX(drawing.x, layout);
    const yTop = layout.pageHeight - scaleTopY(drawing.y, layout);
    const width = drawing.width * layout.scaleX;
    const height = drawing.height * layout.scaleY;
    const yBottom = yTop - height;

    if (isCheckboxDrawing(drawing)) {
      const checkboxBorderWidth = Math.max(0.8, (drawing.strokeWidth || 0.8) * strokeScale);
      page.drawRectangle({
        x,
        y: yBottom,
        width,
        height,
        borderColor: lineColor,
        borderOpacity: drawing.strokeOpacity ?? 1,
        borderWidth: checkboxBorderWidth,
      });
      continue;
    }

    const borderWidth = Math.max(drawing.strokeWidth || 0, Math.min(width, height));
    const thickness = Math.max(0.9, borderWidth * strokeScale);
    const common = {
      thickness,
      color: lineColor,
      opacity: drawing.strokeOpacity ?? drawing.fillOpacity ?? 1,
    };

    // Treat ALL thin rectangles as line segments, even if they came from fill rectangles.
    // This is what fixes the broken vertical border shown in your screenshot.
    if (isThinLineDrawing(drawing)) {
      if (width >= height) {
        horizontalSegments.push({
          ...common,
          x1: clamp(x - overlap, 0.5, layout.pageWidth - 0.5),
          x2: clamp(x + width + overlap, 0.5, layout.pageWidth - 0.5),
          y: yBottom + height / 2,
        });
      } else {
        verticalSegments.push({
          ...common,
          x: x + width / 2,
          y1: clamp(yBottom - overlap, 0.5, layout.pageHeight - 0.5),
          y2: clamp(yTop + overlap, 0.5, layout.pageHeight - 0.5),
        });
      }

      continue;
    }

    if (!strokeColor || drawing.strokeWidth <= 0) {
      continue;
    }

    boxSegments.push({ x, yTop, yBottom, width, ...common });
  }

  for (const segment of boxSegments) {
    page.drawLine({
      start: { x: segment.x, y: segment.yTop },
      end: { x: segment.x + segment.width, y: segment.yTop },
      thickness: segment.thickness,
      color: segment.color,
      opacity: segment.opacity,
    });
    page.drawLine({
      start: { x: segment.x, y: segment.yBottom },
      end: { x: segment.x + segment.width, y: segment.yBottom },
      thickness: segment.thickness,
      color: segment.color,
      opacity: segment.opacity,
    });
    page.drawLine({
      start: { x: segment.x, y: segment.yBottom },
      end: { x: segment.x, y: segment.yTop },
      thickness: segment.thickness,
      color: segment.color,
      opacity: segment.opacity,
    });
    page.drawLine({
      start: { x: segment.x + segment.width, y: segment.yBottom },
      end: { x: segment.x + segment.width, y: segment.yTop },
      thickness: segment.thickness,
      color: segment.color,
      opacity: segment.opacity,
    });
  }

  const mergedHorizontalSegments = mergeLineSegments(horizontalSegments, 'horizontal', 2.5, 16);
  const mergedVerticalSegments = mergeLineSegments(verticalSegments, 'vertical', 2.5, 16);

  for (const segment of mergedHorizontalSegments) {
    page.drawLine({
      start: { x: segment.start, y: segment.y },
      end: { x: segment.end, y: segment.y },
      thickness: segment.thickness,
      color: segment.color,
      opacity: segment.opacity,
    });
  }

  for (const segment of mergedVerticalSegments) {
    page.drawLine({
      start: { x: segment.x, y: segment.start },
      end: { x: segment.x, y: segment.end },
      thickness: segment.thickness,
      color: segment.color,
      opacity: segment.opacity,
    });
  }

  // Final pass: redraw only the outside border as one clean rectangle.
  // This fixes the tiny corner gaps on the four outer sides.
  const allBorderX = [];
  const allBorderY = [];

  for (const segment of mergedHorizontalSegments) {
    allBorderX.push(segment.start, segment.end);
    allBorderY.push(segment.y);
  }

  for (const segment of mergedVerticalSegments) {
    allBorderX.push(segment.x);
    allBorderY.push(segment.start, segment.end);
  }

  for (const segment of boxSegments) {
    allBorderX.push(segment.x, segment.x + segment.width);
    allBorderY.push(segment.yBottom, segment.yTop);
  }

  if (allBorderX.length && allBorderY.length) {
    const left = Math.min(...allBorderX);
    const right = Math.max(...allBorderX);
    const bottom = Math.min(...allBorderY);
    const top = Math.max(...allBorderY);
    const outerThickness = 1.25;

    page.drawLine({
      start: { x: left, y: top },
      end: { x: right, y: top },
      thickness: outerThickness,
      color: rgb(0, 0, 0),
    });
    page.drawLine({
      start: { x: left, y: bottom },
      end: { x: right, y: bottom },
      thickness: outerThickness,
      color: rgb(0, 0, 0),
    });
    page.drawLine({
      start: { x: left, y: bottom },
      end: { x: left, y: top },
      thickness: outerThickness,
      color: rgb(0, 0, 0),
    });
    page.drawLine({
      start: { x: right, y: bottom },
      end: { x: right, y: top },
      thickness: outerThickness,
      color: rgb(0, 0, 0),
    });
  }
}

async function drawTemplateImages(pdf, page, template, layout) {
  const embeddedImages = await Promise.all(
    template.images.map(async (image) => {
      const imagePath = path.join(
        PUBLIC_DIRECTORY,
        image.src.replace(/^\//, '').replaceAll('/', path.sep)
      );
      const imageBytes = await getImageBytes(imagePath);
      const extension = path.extname(imagePath).toLowerCase();
      const embeddedImage =
        extension === '.jpg' || extension === '.jpeg'
          ? await pdf.embedJpg(imageBytes)
          : await pdf.embedPng(imageBytes);

      return {
        ...image,
        embeddedImage,
      };
    })
  );

  for (const image of embeddedImages) {
    const boxWidth = image.width * layout.scaleX;
    const boxHeight = image.height * layout.scaleY;
    const fittedSize = image.embeddedImage.scaleToFit(boxWidth, boxHeight);
    const offsetX = (boxWidth - fittedSize.width) / 2;
    const offsetY = (boxHeight - fittedSize.height) / 2;

    page.drawImage(image.embeddedImage, {
      x: scaleX(image.x, layout) + offsetX,
      y:
        layout.pageHeight -
        scaleTopY(image.y, layout) -
        boxHeight +
        offsetY,
      width: fittedSize.width,
      height: fittedSize.height,
    });
  }
}

async function buildStaticBasePdf() {
  const template = await getCscForm6Template();
  const emptyEntries = { values: [], marks: [] };
  const bounds = getContentBounds(template, emptyEntries);
  const layout = createPdfLayout(template, bounds);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const arialFonts = await embedArialFonts(pdf);
  const fonts = {
    regular: arialFonts?.regular ?? (await pdf.embedFont(StandardFonts.Helvetica)),
    bold: arialFonts?.bold ?? (await pdf.embedFont(StandardFonts.HelveticaBold)),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
  };

  const page = pdf.addPage([layout.pageWidth, layout.pageHeight]);
  drawTemplateRectangleFills(page, template, layout);
  await drawTemplateImages(pdf, page, template, layout);
  drawTemplateText(page, template, fonts, layout);
  drawTemplateRectangleBorders(page, template, layout);

  return {
    bytes: await pdf.save(),
    template,
    layout,
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

export async function prewarmCscForm6Assets() {
  if (!cscFormWarmupPromise) {
    cscFormWarmupPromise = (async () => {
      const startedAt = process.hrtime.bigint();
      await getStaticBasePdf();

      if (IS_DEVELOPMENT) {
        const totalMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        console.info(`[CSC Form 6 PDF] warmup=${totalMs.toFixed(1)}ms`);
      }

      return {
        warmedAt: new Date().toISOString(),
      };
    })().catch((error) => {
      cscFormWarmupPromise = null;
      throw error;
    });
  }

  return cscFormWarmupPromise;
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

function pushMark(entries, checked, checkboxKey, fallbackRect = null) {
  if (checked) {
    entries.push({ checkboxKey, fallbackRect });
  }
}

function buildDynamicEntries(formData) {
  const values = [];
  const marks = [];
  const generalReason = (formData.metadata?.generalReason ?? []).join(' ');
  const locationDetail =
    formData.metadata?.specifiedPlace || generalReason || formData.leaveDetails;
  const illnessDetail = formData.metadata?.illness || generalReason;

  // Row 1: Unified top at 138 to align Office with Names
  pushValue(values, formData.officeDepartment, {
    left: 52,
    top: 138, // Adjusted from 139
    width: 177,
    size: 9,
    font: 'regular',
  });
  pushValue(values, formData.nameParts?.lastName, {
    left: 279,
    top: 138,
    width: 92,
    size: 10,
    font: 'bold',
    align: 'center',
  });
  pushValue(values, formData.nameParts?.firstName, {
    left: 368,
    top: 138,
    width: 92,
    size: 10,
    font: 'bold',
    align: 'center',
  });
  pushValue(values, formData.nameParts?.middleName, {
    left: 458,
    top: 138,
    width: 82,
    size: 10,
    font: 'bold',
    align: 'center',
  });

  // Row 2: Unified top at 157 to align Position with Date and Salary
  pushValue(values, formData.dateFiled, {
    left: 136,
    top: 157,
    width: 90,
    size: 10,
    font: 'regular',
  });
  pushValue(values, formData.position, {
    left: 296,
    top: 157, // Adjusted from 159
    width: 112,
    size: 10,
    font: 'regular',
    singleLine: true,
    minimumSize: 7,
  });
  pushValue(values, formData.salary, {
    left: 472,
    top: 157,
    width: 86,
    size: 10,
    font: 'regular',
  });

  pushMark(marks, formData.selections?.vacation, 'vacation');
  pushMark(marks, formData.selections?.forced, 'forced');
  pushMark(marks, formData.selections?.sick, 'sick');
  pushMark(marks, formData.selections?.specialPrivilege, 'specialPrivilege');
  pushMark(marks, formData.selections?.others, 'others', {
    x: 35.75,
    y: 445.7,
    width: 8.95,
    height: 9,
  });
  pushMark(marks, formData.selections?.withinPhilippines, 'withinPhilippines');
  pushMark(marks, formData.selections?.abroad, 'abroad');
  pushMark(marks, formData.selections?.inHospital, 'inHospital');
  pushMark(marks, formData.selections?.outPatient, 'outPatient');

  if (formData.selections?.others) {
    pushValue(values, 'Wellness Leave', {
      left: 100,
      top: 456,
      width: 235,
      size: 9,
      font: 'bold',
    });
  }

  if (formData.selections?.withinPhilippines) {
    pushValue(values, locationDetail, {
      left: 425,
      top: 230,
      width: 153,
      size: 9,
      font: 'regular',
      singleLine: true,
      disableAutoSize: false,
      lineHeight: 10,
    });
  }

  if (formData.selections?.abroad) {
    pushValue(values, locationDetail, {
      left: 415,
      top: 245.5,
      width: 135,
      size: 9,
      font: 'regular',
      singleLine: true,
      disableAutoSize: false,
      lineHeight: 10,
    });
  }

  if (formData.selections?.inHospital) {
    pushValue(values, illnessDetail, {
      left: 432,
      top: 279.8,
      width: 145,
      size: 8,
      font: 'regular',
      lineHeight: 10,
    });
  }

  if (formData.selections?.outPatient) {
    pushValue(values, illnessDetail, {
      left: 435,
      top: 295.8,
      width: 142,
      size: 8,
      font: 'regular',
      lineHeight: 10,
    });
  }

  pushValue(values, formData.requestedDays, {
    left: 56,
    top: 493,
    width: 205,
    size: 10,
    font: 'regular',
  });

  (formData.inclusiveDateLines ?? []).forEach((line, index) => {
    pushValue(values, line, {
      left: 56,
      top: 529 + index * 18,
      width: 205,
      size: 9,
      font: 'regular',
    });
  });

  return { values, marks };
}

function drawDynamicEntries(page, template, entries, fonts, layout) {
  const fontScale = Math.min(layout.scaleX, layout.scaleY);

  for (const mark of entries.marks) {
    const checkboxRect = template.checkboxRects?.[mark.checkboxKey] ?? mark.fallbackRect;

    if (!checkboxRect) {
      continue;
    }

    const scaledHeight = checkboxRect.height * layout.scaleY;
    page.drawRectangle({
      x: scaleX(checkboxRect.x, layout),
      y: layout.pageHeight - scaleTopY(checkboxRect.y, layout) - scaledHeight,
      width: checkboxRect.width * layout.scaleX,
      height: scaledHeight,
      color: rgb(0, 0, 0),
    });
  }

  for (const entry of entries.values) {
    const font = fonts.bold;
    const sourceBaseSize = entry.size || 8;
    const baseSize = sourceBaseSize * fontScale;
    const sourcePadding = entry.padding ?? getTextBoxPadding(sourceBaseSize);
    const entryPadding = sourcePadding * layout.scaleX;
    const entryMaxWidth = Math.max(1, entry.width * layout.scaleX - entryPadding * 2);
    const shouldFitEntry = !entry.disableAutoSize && (entry.singleLine || entry.align === 'center');
    const size = shouldFitEntry
      ? fitTextSizeToWidth(
          font,
          entry.content,
          baseSize,
          entryMaxWidth,
          (entry.minimumSize || 7) * fontScale
        )
      : baseSize;
    const lines = entry.singleLine
      ? [entry.content]
      : wrapTextToWidth(font, entry.content, size, entryMaxWidth);

    lines.forEach((line, index) => {
      const lineWidth = font.widthOfTextAtSize(line, size);
      const x =
        entry.align === 'center'
          ? scaleX(entry.left, layout) + entryPadding + Math.max(0, entryMaxWidth - lineWidth) / 2
          : scaleX(entry.left, layout) + entryPadding;
      const y =
        layout.pageHeight -
        scaleTopY(entry.top, layout) -
        size +
        1 -
        index * ((entry.lineHeight ? entry.lineHeight * layout.scaleY : baseSize * 1.2));

      page.drawText(line, {
        x,
        y,
        size,
        font,
        color: rgb(0, 0, 0),
      });
    });
  }
}

export async function generateCscForm6Pdf(groupIdentifier, options = {}) {
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
    ? Promise.resolve(buildCscForm6ViewData(prefetchedLeaveRequestGroup, prefetchedEmployee))
    : getCscForm6ViewData(groupIdentifier);

  const formData = await formDataPromise;
  markStage('data');

  const { bytes: basePdfBytes, template, layout } = await getStaticBasePdf();
  markStage('staticBase');

  const entries = buildDynamicEntries(formData);

  const pdf = await PDFDocument.load(basePdfBytes);
  pdf.registerFontkit(fontkit);
  const dynamicBoldFont = await embedDynamicBoldFont(pdf);
  const fonts = { bold: dynamicBoldFont };
  markStage('fonts');

  const page = pdf.getPages()[0];
  drawDynamicEntries(page, template, entries, fonts, layout);
  markStage('render');

  const bytes = await pdf.save();
  markStage('save');

  if (IS_DEVELOPMENT) {
    const totalMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    console.info(
      `[CSC Form 6 PDF] group=${normalizeText(groupIdentifier) || 'unknown'} ` +
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
    fileName: buildDownloadFileName(
      formData.employeeName,
      formData.leaveType,
      formData.inclusiveDates
    ),
  };
}