'use strict';

/**
 * Straighten a photographed voyage report before it goes to the model.
 *
 * Phone photos of a form held in the flight deck are rotated by EXIF, tilted by
 * a few degrees, and bigger than the model needs. Three cheap steps fix that:
 *   1. honour the EXIF orientation (sharp.rotate() with no angle),
 *   2. estimate the skew from the page's own ruled lines and rotate it out,
 *   3. normalise contrast and cap the long side, so a 4 MB photo costs less.
 *
 * Skew is found with a projection profile: rotate a small grayscale copy
 * through candidate angles and keep the one where row darkness varies most —
 * at the true angle the table's horizontal rules line up and the profile spikes.
 * PDFs are passed through untouched; they are already upright.
 */

const sharp = require('sharp');

const MAX_SIDE = 2000;
const PROBE_WIDTH = 600;           // skew search runs on this width, not the full photo
const MAX_SKEW_DEG = 12;
const COARSE_STEP = 1;
const FINE_STEP = 0.25;
const MIN_APPLY_DEG = 0.6;         // below this a rotation only softens the image

// Variance of the row-darkness profile: high when ruled lines are horizontal.
function profileScore(data, width, height) {
  const rows = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    const base = y * width;
    for (let x = 0; x < width; x++) sum += 255 - data[base + x];
    rows[y] = sum / width;
  }
  let mean = 0;
  for (let y = 0; y < height; y++) mean += rows[y];
  mean /= height;
  // Sum of squared differences BETWEEN adjacent rows as well as from the mean:
  // the gradient term is what separates "lines are level" from "page is dark".
  let varSum = 0;
  let gradSum = 0;
  for (let y = 0; y < height; y++) {
    varSum += (rows[y] - mean) ** 2;
    if (y) gradSum += (rows[y] - rows[y - 1]) ** 2;
  }
  return varSum / height + gradSum / height;
}

async function scoreAt(probe, width, height, angle) {
  const rotated = await sharp(probe, { raw: { width, height, channels: 1 } })
    .rotate(angle, { background: 255 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return profileScore(rotated.data, rotated.info.width, rotated.info.height);
}

async function estimateSkew(upright) {
  const probe = await sharp(upright).resize({ width: PROBE_WIDTH, fit: 'inside' }).grayscale().normalise()
    .raw().toBuffer({ resolveWithObject: true });
  const { width, height } = probe.info;
  let best = { angle: 0, score: await scoreAt(probe.data, width, height, 0) };
  for (let a = -MAX_SKEW_DEG; a <= MAX_SKEW_DEG; a += COARSE_STEP) {
    if (!a) continue;
    const score = await scoreAt(probe.data, width, height, a);
    if (score > best.score) best = { angle: a, score };
  }
  // Refine around the winner.
  for (let a = best.angle - COARSE_STEP; a <= best.angle + COARSE_STEP; a += FINE_STEP) {
    const score = await scoreAt(probe.data, width, height, a);
    if (score > best.score) best = { angle: a, score };
  }
  return best.angle;
}

/**
 * @returns {{buffer: Buffer, mimeType: string, skewDeg: number, width: number, height: number}}
 */
async function prepareScanImage(buffer, mimeType) {
  if (String(mimeType || '').includes('pdf')) {
    return { buffer, mimeType: 'application/pdf', skewDeg: 0, width: null, height: null };
  }
  // EXIF first: a sideways photo must be upright before skew means anything.
  const upright = await sharp(buffer).rotate().toBuffer();
  let skew = 0;
  try { skew = await estimateSkew(upright); } catch (_) { skew = 0; }
  let pipe = sharp(upright);
  if (Math.abs(skew) >= MIN_APPLY_DEG) pipe = pipe.rotate(-skew, { background: '#ffffff' });
  const out = await pipe
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .normalise()
    .jpeg({ quality: 88 })
    .toBuffer({ resolveWithObject: true });
  return {
    buffer: out.data,
    mimeType: 'image/jpeg',
    skewDeg: Math.abs(skew) >= MIN_APPLY_DEG ? Math.round(skew * 100) / 100 : 0,
    width: out.info.width,
    height: out.info.height,
  };
}

module.exports = { prepareScanImage, estimateSkew };
