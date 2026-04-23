import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getCscForm6ViewData } from '@/lib/csc-form-6-data';
import { getCscForm6Template } from '@/lib/csc-form-6-template';

const PUBLIC_DIRECTORY = path.join(process.cwd(), 'public');

function normalizeText(value) {
  return String(value ?? '').trim();
}

function buildDownloadFileName(fullName, leaveType) {
  const safeName = normalizeText(fullName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const safeLeaveType = normalizeText(leaveType)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `csc-form-6-${safeName || 'employee'}-${safeLeaveType || 'leave'}.pdf`;
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

function drawTemplateText(page, template, fonts) {
  for (const line of template.lines) {
    const font = getLineFont(line.variant, fonts);
    const fontSize = Math.max(8.5, line.height * 0.92);
    const y = template.pageHeight - line.topY1 + 0.5;

    page.drawText(line.text, {
      x: line.topX0,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  }
}

function drawTemplateRectangles(page, template) {
  for (const drawing of template.drawings) {
    const y = template.pageHeight - drawing.y - drawing.height;
    const fillColor = resolveRgbColor(drawing.fillRgb);
    const borderColor = resolveRgbColor(drawing.strokeRgb);
    const rectangleOptions = {
      x: drawing.x,
      y,
      width: drawing.width,
      height: drawing.height,
    };

    if (fillColor) {
      rectangleOptions.color = fillColor;
      rectangleOptions.opacity = drawing.fillOpacity;
    }

    if (borderColor && drawing.strokeWidth > 0) {
      rectangleOptions.borderColor = borderColor;
      rectangleOptions.borderOpacity = drawing.strokeOpacity;
      rectangleOptions.borderWidth = drawing.strokeWidth;
    }

    page.drawRectangle(rectangleOptions);
  }
}

async function drawTemplateImages(pdf, page, template) {
  const embeddedImages = await Promise.all(
    template.images.map(async (image) => {
      const imagePath = path.join(
        PUBLIC_DIRECTORY,
        image.src.replace(/^\//, '').replaceAll('/', path.sep)
      );
      const imageBytes = await fs.readFile(imagePath);
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
    page.drawImage(image.embeddedImage, {
      x: image.x,
      y: template.pageHeight - image.y - image.height,
      width: image.width,
      height: image.height,
    });
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
  if (checked) {
    entries.push(position);
  }
}

function buildDynamicEntries(formData) {
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
    size: 5.4,
    font: 'bold',
    align: 'center',
  });
  pushValue(values, formData.nameParts?.lastName, {
    left: 279,
    top: 124,
    width: 92,
    size: 9,
    font: 'bold',
  });
  pushValue(values, formData.nameParts?.firstName, {
    left: 368,
    top: 124,
    width: 92,
    size: 9,
    font: 'bold',
  });
  pushValue(values, formData.nameParts?.middleName, {
    left: 458,
    top: 124,
    width: 82,
    size: 9,
    font: 'bold',
  });
  pushValue(values, formData.dateFiled, {
    left: 130,
    top: 156,
    width: 94,
    size: 8,
    font: 'regular',
  });
  pushValue(values, formData.position, {
    left: 292,
    top: 156,
    width: 120,
    size: 8,
    font: 'regular',
  });
  pushValue(values, formData.salary, {
    left: 466,
    top: 156,
    width: 95,
    size: 8,
    font: 'regular',
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
      size: 9,
      font: 'bold',
    });
  }

  if (formData.selections?.withinPhilippines) {
    pushValue(values, locationDetail, {
      left: 435,
      top: 228.3,
      width: 142,
      size: 8,
      font: 'regular',
      lineHeight: 10,
    });
  }

  if (formData.selections?.abroad) {
    pushValue(values, locationDetail, {
      left: 416,
      top: 244.5,
      width: 162,
      size: 8,
      font: 'regular',
      lineHeight: 10,
    });
  }

  if (formData.selections?.inHospital) {
    pushValue(values, illnessDetail, {
      left: 456,
      top: 279.8,
      width: 121,
      size: 8,
      font: 'regular',
      lineHeight: 10,
    });
  }

  if (formData.selections?.outPatient) {
    pushValue(values, illnessDetail, {
      left: 458,
      top: 295.8,
      width: 119,
      size: 8,
      font: 'regular',
      lineHeight: 10,
    });
  }

  pushValue(values, formData.requestedDays, {
    left: 118,
    top: 487.5,
    width: 150,
    size: 16,
    font: 'bold',
    align: 'center',
  });

  (formData.inclusiveDateLines ?? []).forEach((line, index) => {
    pushValue(values, line, {
      left: 56,
      top: 533 + index * 20,
      width: 205,
      size: 8,
      font: 'regular',
    });
  });

  return { values, marks };
}

function drawDynamicEntries(page, template, formData, fonts) {
  const entries = buildDynamicEntries(formData);

  for (const mark of entries.marks) {
    page.drawText('X', {
      x: mark.left,
      y: template.pageHeight - mark.top - 11,
      size: 13,
      font: fonts.bold,
      color: rgb(0, 0, 0),
    });
  }

  for (const entry of entries.values) {
    const font = fonts[entry.font] || fonts.regular;
    const size = entry.size || 8;
    const lines = wrapTextToWidth(font, entry.content, size, entry.width);

    lines.forEach((line, index) => {
      const lineWidth = font.widthOfTextAtSize(line, size);
      const x =
        entry.align === 'center'
          ? entry.left + Math.max(0, (entry.width - lineWidth) / 2)
          : entry.left;
      const y =
        template.pageHeight -
        entry.top -
        size +
        1 -
        index * (entry.lineHeight || size * 1.2);

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

export async function generateCscForm6Pdf(groupIdentifier) {
  const [formData, template] = await Promise.all([
    getCscForm6ViewData(groupIdentifier),
    getCscForm6Template(),
  ]);

  const pdf = await PDFDocument.create();
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
  };
  const page = pdf.addPage([template.pageWidth, template.pageHeight]);

  drawTemplateRectangles(page, template);
  await drawTemplateImages(pdf, page, template);
  drawTemplateText(page, template, fonts);
  drawDynamicEntries(page, { pageHeight: template.pageHeight }, formData, fonts);

  return {
    bytes: await pdf.save(),
    fileName: buildDownloadFileName(formData.employeeName, formData.leaveType),
  };
}
