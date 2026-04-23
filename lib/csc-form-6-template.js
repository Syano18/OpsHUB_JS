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

function toNumber(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function getLineVariant(text) {
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
    text === '6. DETAILS OF APPLICATION' ||
    text === '7. DETAILS OF ACTION ON APPLICATION' ||
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
    text.startsWith('6.A') ||
    text.startsWith('6.B') ||
    text.startsWith('6.C') ||
    text.startsWith('6.D') ||
    text.startsWith('7.A') ||
    text.startsWith('7.B') ||
    text.startsWith('7.C') ||
    text.startsWith('7.D')
  ) {
    return 'section';
  }

  return 'default';
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
  const lines = rowLines.map((rowLine) => {
    const values = parseCsvLine(rowLine);
    const row = Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ''])
    );
    const topX0 = toNumber(row.top_x0_pt);
    const topY0 = toNumber(row.top_y0_pt);
    const topX1 = toNumber(row.top_x1_pt);
    const topY1 = toNumber(row.top_y1_pt);
    const text = decodeTemplateText(row.text);

    return {
      id: toNumber(row.line_id),
      text,
      topX0,
      topY0,
      topX1,
      topY1,
      width: topX1 - topX0,
      height: topY1 - topY0,
      variant: getLineVariant(text),
    };
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

      return {
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
      };
    })
    .filter(Boolean);

  const images = (firstPage.images ?? []).map((image, index) => {
    const placement = image.placements?.[0]?.rect_top_left;

    if (!placement) {
      return null;
    }

    return {
      id: `${image.name ?? index}`,
      x: toNumber(placement.x0_pt),
      y: toNumber(placement.y0_pt),
      width: toNumber(placement.width_pt),
      height: toNumber(placement.height_pt),
      src: index === 0 ? '/icons/PSA.png' : '/icons/Bagong.png',
      alt: index === 0 ? 'PSA logo' : 'Bagong Pilipinas logo',
    };
  });

  return {
    pageWidth: toNumber(firstPage.width_pt) || 595.3,
    pageHeight: toNumber(firstPage.height_pt) || 841.9,
    lines,
    drawings,
    images: images.filter(Boolean),
  };
});
