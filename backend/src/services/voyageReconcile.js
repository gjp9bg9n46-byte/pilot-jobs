'use strict';

/**
 * Reading the page more than once, and closer where it matters.
 *
 * Measured on nine real reports, a single pass at page scale gets most of a
 * voyage report right and is quietly wrong about the rest — and the model is
 * not deterministic, so the same photo can read 12:54 one minute and 12:59 the
 * next. Worse, when it misreads a row it tends to misread that row's own T
 * column the same way, which is how a two-hour error slipped past the
 * block-vs-T check (96c1f6fc: OUT/IN read two hours late AND T read as 6:13
 * instead of 5:13, so the two agreed).
 *
 * So:
 *   1. read the whole page TWICE and treat any disagreement as "please look";
 *   2. where a sector's own times disagree with the crew's T or N column, or
 *      the two passes disagree, cut that row out, enlarge it and read it again.
 *      A crop is new evidence, not another roll of the same dice;
 *   3. keep the reading whose block matches the form's T. If none does, keep
 *      the first and flag it.
 */

const sharp = require('sharp');
const logger = require('../config/logger');
const { extractVoyageReport, extractRow, secondModelName } = require('./voyageExtractor');
const { nightMinutes } = require('./nightTime');

const TIME_FIELDS = ['out', 'off', 'on', 'in'];
const COMPARE_FIELDS = ['flightNumber', 'from', 'to', 'out', 'off', 'on', 'in', 'landings', 'formTotal', 'formNight', 'pfStaff', 'pmStaff'];
const BLOCK_TOLERANCE_MIN = 2;
const NIGHT_TOLERANCE_MIN = 10;
const CROP_PAD = 14;          // thousandths of page height around the row
const CROP_MIN_HEIGHT = 90;   // thousandths — a band this tall always reads

// Turn the page the right way up, given the model's own reading of how it lies.
// Crops only make sense once a row of the page is a row of the image: on a
// sideways photo a horizontal band cuts ACROSS the sectors, which is how the
// first row re-reads came back holding the next sector's times.
async function uprightCopy(buffer, orientation) {
  const turn = { rotated_cw: -90, rotated_ccw: 90, upside_down: 180 }[orientation] || 0;
  if (!turn) return { buffer, rotated: false };
  const out = await sharp(buffer).rotate(turn).jpeg({ quality: 92 }).toBuffer();
  return { buffer: out, rotated: true };
}

const norm = (v) => (v == null || v === '' ? null : String(v).trim().toUpperCase().replace(/\s+/g, ' '));

function toMinutes(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
}
function span(a, b) {
  const x = toMinutes(a);
  const y = toMinutes(b);
  if (x == null || y == null) return null;
  return y >= x ? y - x : y + 1440 - x;
}
function parseDuration(v) {
  const m = String(v || '').trim().match(/^(\d{1,2})[:h ]?(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// Does this reading of a sector agree with the crew's own total?
//
// `referenceT` is the T read from the full page, and passing it matters: a
// re-read that also re-reads T can agree with ITSELF while both numbers are
// wrong — exactly the trap that let a two-hour error through (96c1f6fc).
function matchesForm(sector, referenceT) {
  const t = referenceT != null ? referenceT : parseDuration(sector.formTotal);
  const block = span(sector.out, sector.in);
  if (t == null || block == null) return null;          // nothing to judge on
  return Math.abs(t - block) <= BLOCK_TOLERANCE_MIN;
}

function nightDisagrees(sector, calculatedMinutes) {
  const n = parseDuration(sector.formNight);
  if (n == null || calculatedMinutes == null) return false;
  return Math.abs(n - calculatedMinutes) > NIGHT_TOLERANCE_MIN;
}

// Cut one sector's row out of the page and enlarge it.
async function cropRow(buffer, box) {
  const meta = await sharp(buffer).metadata();
  const h = meta.height || 0;
  const w = meta.width || 0;
  if (!h || !w || !box) return null;
  let y0 = Math.max(0, Math.round(((box.y0 ?? 0) - CROP_PAD) / 1000 * h));
  let y1 = Math.min(h, Math.round(((box.y1 ?? 0) + CROP_PAD) / 1000 * h));
  if (y1 - y0 < (CROP_MIN_HEIGHT / 1000) * h) {
    const mid = (y0 + y1) / 2;
    const half = (CROP_MIN_HEIGHT / 2000) * h;
    y0 = Math.max(0, Math.round(mid - half));
    y1 = Math.min(h, Math.round(mid + half));
  }
  if (y1 - y0 < 20) return null;
  const out = await sharp(buffer)
    .extract({ left: 0, top: y0, width: w, height: y1 - y0 })
    .resize({ width: Math.min(2400, w * 2), withoutEnlargement: false })
    .sharpen()
    .jpeg({ quality: 92 })
    .toBuffer();
  return out;
}

/**
 * Read a prepared page and settle on one answer.
 * @returns {{raw, usage, passes, rowReads}}
 */
async function readPage({ buffer, mimeType }) {
  const started = Date.now();
  // Pass one, on the photo as it arrived.
  const a = await extractVoyageReport({ buffer, mimeType });

  // Pass two, on the page turned upright and by a different model where one is
  // configured. Two models rarely misread the same handwriting the same way,
  // and the upright copy is what the crops are cut from.
  const upright = mimeType === 'application/pdf'
    ? { buffer, rotated: false }
    : await uprightCopy(buffer, a.raw.pageOrientation).catch(() => ({ buffer, rotated: false }));
  const b = await extractVoyageReport({ buffer: upright.buffer, mimeType: upright.rotated ? 'image/jpeg' : mimeType, model: secondModelName() })
    .catch(() => null);

  const usage = { ...a.usage };
  if (b) {
    usage.promptTokens += b.usage.promptTokens;
    usage.outputTokens += b.usage.outputTokens;
    usage.costUsd = Math.round((usage.costUsd + b.usage.costUsd) * 1e6) / 1e6;
  }

  const raw = JSON.parse(JSON.stringify(a.raw));
  const disagree = {};        // sectorIndex -> { fields:Set, other }
  const headerDisagree = new Set();

  if (b && b.raw) {
    for (const f of ['date', 'registration', 'aircraftType', 'commander', 'pilotRole']) {
      if (norm(a.raw[f]) !== norm(b.raw[f])) headerDisagree.add(f);
    }
    const bs = b.raw.sectors || [];
    (raw.sectors || []).forEach((s, i) => {
      const other = bs[i];
      if (!other) { headerDisagree.add('sectorCount'); return; }
      const set = new Set();
      for (const f of COMPARE_FIELDS) if (norm(s[f]) !== norm(other[f])) set.add(f);
      if (set.size) disagree[i] = { fields: set, other };
    });
    if (bs.length !== (raw.sectors || []).length) headerDisagree.add('sectorCount');
  }

  // Re-read the rows that need it: a sector whose block fights the form's T,
  // whose night fights the form's N, or where the two passes differ on a time.
  const rowReads = [];
  for (let i = 0; i < (raw.sectors || []).length; i++) {
    const s = raw.sectors[i];
    const other = disagree[i]?.other || null;

    // The reference total: what the page says this sector's T is. Where the two
    // passes agree it is solid; where they differ, either may be right.
    const tA = parseDuration(s.formTotal);
    const tB = other ? parseDuration(other.formTotal) : null;
    const references = [...new Set([tA, tB].filter((t) => t != null))];

    const fightsForm = references.length > 0 && !references.some((t) => matchesForm(s, t) === true);
    let calculated = null;
    if (raw.date && s.from && s.to && s.out && s.in) {
      const n = await nightMinutes({ date: new Date(raw.date), departure: s.from, arrival: s.to, off: s.out, on: s.in }).catch(() => null);
      calculated = n ? n.minutes : null;
    }
    const nightFight = nightDisagrees(s, calculated);
    const timesDiffer = disagree[i] && [...disagree[i].fields].some((f) => TIME_FIELDS.includes(f));

    // EVERY sector gets a close second look, not only the ones the form
    // contradicts. Measured on nine real reports: block, night, the lower table
    // and the page total between them cover OUT, IN and the route — but nothing
    // on the page checks OFF, and the two errors that still reached the logbook
    // silently were both OFF, out by two and six minutes. A crop disagrees with
    // the page in both cases, so cropping always is what makes the review screen
    // honest. It costs one more call per sector and some extra amber.
    const alwaysCrop = String(process.env.SCAN_ALWAYS_CROP || 'true').toLowerCase() !== 'false';
    if (!fightsForm && !nightFight && !timesDiffer && !alwaysCrop) continue;

    // Cut the row from the UPRIGHT page, using the box from whichever pass saw
    // that page: pass two if it ran, pass one only when nothing was rotated.
    const box = (b && other && other.rowBox) || (!upright.rotated ? s.rowBox : null);
    const crop = box ? await cropRow(upright.buffer, box).catch(() => null) : null;
    const read = crop ? await extractRow({ buffer: crop, mimeType: 'image/jpeg' }) : null;
    if (read) {
      usage.promptTokens += read.usage.promptTokens;
      usage.outputTokens += read.usage.outputTokens;
      usage.costUsd = Math.round((usage.costUsd + read.usage.costUsd) * 1e6) / 1e6;
    }

    // Choose between the readings: whichever agrees with the page's own T wins.
    const candidates = [
      { name: 'page', sector: s },
      ...(other ? [{ name: 'pass2', sector: other }] : []),
      ...(read ? [{ name: 'crop', sector: { ...s, ...read.row, formTotal: s.formTotal } }] : []),
    ];
    const winner = references.length
      ? candidates.find((c) => references.some((t) => matchesForm(c.sector, t) === true))
      : null;
    rowReads.push({
      index: i,
      status: !crop ? 'no-crop' : !read ? 'failed' : winner ? `agreed:${winner.name}` : 'no-match',
      crop: read ? read.row : null,
    });

    if (winner && winner.name !== 'page') {
      raw.sectors[i] = { ...s, ...winner.sector, formTotal: s.formTotal, rowBox: s.rowBox };
      if (disagree[i]) delete disagree[i];
    } else if (!winner && references.length) {
      // Nothing matched the crew's total. Keep the page reading and say so.
      disagree[i] = disagree[i] || { fields: new Set(), other: null };
      TIME_FIELDS.forEach((f) => disagree[i].fields.add(f));
    }

    // Whatever was chosen, any time the close-up reads differently is a field
    // the pilot should look at. The crop is never trusted enough to overwrite
    // on its own — it can misread too — but it is trusted enough to ask.
    if (read) {
      const chosen = raw.sectors[i];
      for (const f of TIME_FIELDS) {
        const cropValue = read.row[f];
        if (!cropValue || norm(cropValue) === norm(chosen[f])) continue;
        disagree[i] = disagree[i] || { fields: new Set(), other: null };
        disagree[i].fields.add(f);
      }
    }
  }

  // The review screen crops these rows out of the stored page, so the boxes
  // have to survive alongside the values.
  (raw.sectors || []).forEach((s, i) => {
    const fromB = b && b.raw && b.raw.sectors && b.raw.sectors[i] && b.raw.sectors[i].rowBox;
    s.rowBoxUpright = upright.rotated ? (fromB || null) : (fromB || s.rowBox || null);
  });
  raw.pageUpright = upright.rotated;

  const uncertain = {
    header: [...headerDisagree],
    sectors: Object.fromEntries(Object.entries(disagree).map(([i, d]) => [i, [...d.fields]])),
  };
  logger.info(`voyage read: passes=${b ? 2 : 1} rowReads=${rowReads.length} uncertainHeader=${uncertain.header.length} ms=${Date.now() - started}`);
  return { raw, usage: { ...usage, ms: Date.now() - started, passes: b ? 2 : 1, rowReads: rowReads.length }, uncertain, rowReads };
}

module.exports = { readPage, cropRow, uprightCopy, matchesForm, span, parseDuration, toMinutes };
