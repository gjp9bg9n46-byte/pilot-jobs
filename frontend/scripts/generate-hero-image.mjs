// Regenerate the landing hero images from scripts/hero-source.jpg.
//   npm run gen:hero
// Source: Benjamin Chambon / Unsplash (Unsplash License — free, no attribution
// required; credited in the footer as a courtesy). To swap the photo, replace
// scripts/hero-source.jpg and adjust the two crop rectangles below, then re-run.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, 'hero-source.jpg');
const OUT = join(here, '..', 'public', 'hero');

// Crops avoid the dark cockpit ceiling and the black centre windscreen post,
// framing the sunset sky with only a sliver of glareshield. (source is 2400x1600)
const PORT = { left: 1420, top: 430, width: 525, height: 700 }; // 3:4 — desktop
const WIDE = { left: 1380, top: 540, width: 900, height: 562 }; // ~16:10 — phone

const run = async () => {
  for (const w of [640, 960, 1280]) {
    await sharp(SRC).extract(PORT).resize({ width: w }).avif({ quality: 56 }).toFile(join(OUT, `flightdeck-port-${w}.avif`));
    await sharp(SRC).extract(PORT).resize({ width: w }).webp({ quality: 76 }).toFile(join(OUT, `flightdeck-port-${w}.webp`));
  }
  for (const w of [800, 1280, 1640]) {
    await sharp(SRC).extract(WIDE).resize({ width: w }).avif({ quality: 56 }).toFile(join(OUT, `flightdeck-wide-${w}.avif`));
    await sharp(SRC).extract(WIDE).resize({ width: w }).webp({ quality: 76 }).toFile(join(OUT, `flightdeck-wide-${w}.webp`));
  }
  console.log('hero images written to public/hero/');
};
run().catch((e) => { console.error(e); process.exit(1); });
