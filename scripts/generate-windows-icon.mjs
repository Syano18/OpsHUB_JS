import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = process.cwd();
const sourcePng = path.join(root, 'public', 'icons', 'Logo-256.png');
const outputIco = path.join(root, 'public', 'icons', 'Logo.ico');
const tempDir = path.join(root, '.tmp-icon-build');
const sizes = [16, 24, 32, 48, 64, 128, 256];

if (!fs.existsSync(sourcePng)) {
  throw new Error(`Missing source icon PNG: ${sourcePng}`);
}

fs.mkdirSync(tempDir, { recursive: true });

try {
  const pngVariants = [];

  for (const size of sizes) {
    const outPath = path.join(tempDir, `icon-${size}.png`);
    await sharp(sourcePng)
      .resize(size, size, { fit: 'cover' })
      .png({ compressionLevel: 9 })
      .toFile(outPath);
    pngVariants.push(outPath);
  }

  const icoBuffer = await pngToIco(pngVariants);
  fs.writeFileSync(outputIco, icoBuffer);
  console.log(`Generated Windows icon: ${outputIco}`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
