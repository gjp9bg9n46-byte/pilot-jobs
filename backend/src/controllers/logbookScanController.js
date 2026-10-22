'use strict';

/**
 * Voyage-report scanning: upload → read → check → review → save.
 *
 * Nothing is written to the logbook until the pilot saves. The image lives on
 * the scan row only while it is being reviewed, and is deleted on save unless
 * the pilot has opted to keep it. Image bytes and crew names are never logged.
 */

const { randomUUID } = require('crypto');
const sharp = require('sharp');
const prisma = require('../config/database');
const logger = require('../config/logger');
const { prepareScanImage } = require('../services/imagePrep');
const { ScanError, modelName } = require('../services/voyageExtractor');
const { readPage, uprightCopy, cropRow } = require('../services/voyageReconcile');
const { findOverlaps, overlapMessage } = require('../services/logbookOverlap');
const { validateScan } = require('../services/voyageValidate');
const { recomputeDerivedTotals } = require('../services/logbookSummary');

const DAILY_LIMIT = Number(process.env.SCAN_DAILY_LIMIT || 30);
// Scanning ships dark: the endpoints exist, the UI hides, and nothing calls the
// provider until SCAN_ENABLED is set. Accuracy has to be signed off first, and
// the API key needs a paid tier (the free one allows 20 requests a day).
const SCAN_ENABLED = String(process.env.SCAN_ENABLED || '').toLowerCase() === 'true';
const OFF = { error: 'Scanning is not available yet. Enter the flight manually for now.', code: 'DISABLED' };
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
const UNREADABLE = "Couldn't read this photo — try again or enter manually.";

const prefsOf = (pilot) => (pilot && pilot.logbookPrefs) || {};

async function scansToday(pilotId) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.logbookScan.count({ where: { pilotId, createdAt: { gte: since } } });
}

// POST /logbook/scan — read a voyage report. Returns the review payload.
exports.createScan = async (req, res, next) => {
  const file = req.file;
  try {
    if (!SCAN_ENABLED) return res.status(503).json(OFF);
    if (!file || !file.buffer?.length) return res.status(400).json({ error: 'No file was uploaded.' });
    if (!ACCEPTED.includes(file.mimetype)) {
      return res.status(415).json({ error: 'Upload a photo (JPEG, PNG, HEIC) or a PDF.' });
    }
    const used = await scansToday(req.pilot.id);
    if (used >= DAILY_LIMIT) {
      return res.status(429).json({ error: `You have used all ${DAILY_LIMIT} scans for today. Enter the flight manually, or try again tomorrow.` });
    }

    const pilot = await prisma.pilot.findUnique({
      where: { id: req.pilot.id },
      select: { id: true, role: true, staffNumber: true, logbookPrefs: true, firstName: true, lastName: true },
    });

    const prep = await prepareScanImage(file.buffer, file.mimetype);
    let extracted;
    try {
      // Two readings of the page, plus a close re-read of any row whose own
      // arithmetic fights the crew's T or N column (see services/voyageReconcile).
      extracted = await readPage({ buffer: prep.buffer, mimeType: prep.mimeType });
    } catch (err) {
      const code = err instanceof ScanError ? err.code : 'PROVIDER';
      await prisma.logbookScan.create({
        data: { id: randomUUID(), pilotId: pilot.id, status: 'FAILED', model: modelName(), error: code, updatedAt: new Date() },
      });
      const message = code === 'TIMEOUT' ? 'That took too long — try again, or enter the flight manually.' : UNREADABLE;
      return res.status(code === 'TIMEOUT' ? 504 : 422).json({ error: message, code });
    }

    const checked = await validateScan(extracted.raw, { pilot, uncertain: extracted.uncertain });
    if (!checked.sectors.length) return res.status(422).json({ error: UNREADABLE, code: 'NO_SECTORS' });

    // No type on the form and none inferable from the registration: fall back to
    // the aircraft this pilot last flew, marked as a guess for them to confirm.
    const prefs = prefsOf(pilot);
    if (!checked.header.aircraftType && prefs.lastAircraftType) {
      checked.header.aircraftType = prefs.lastAircraftType;
      checked.header.typeInferred = true;
      checked.header.flags.aircraftType = { level: 'amber', message: 'Taken from your last flight — check it.' };
      checked.sectors.forEach((s) => { s.aircraftType = prefs.lastAircraftType; s.typeInferred = true; });
    }

    const withDupes = await markDuplicates(pilot.id, checked);
    await markOverlaps(pilot.id, withDupes);

    // Store the straightened image upright, so the review crops read the right
    // way up whichever way the page was photographed.
    const stored = prep.mimeType === 'application/pdf'
      ? prep
      : { ...prep, ...(await uprightCopy(prep.buffer, checked.header.pageOrientation)) };
    const scan = await prisma.logbookScan.create({
      data: {
        id: randomUUID(),
        pilotId: pilot.id,
        status: 'REVIEW',
        model: extracted.model,
        mimeType: stored.mimeType,
        imageData: stored.buffer,
        sectors: withDupes.sectors,
        header: withDupes.header,
        usage: { ...extracted.usage, skewDeg: prep.skewDeg },
        updatedAt: new Date(),
      },
      select: { id: true, createdAt: true },
    });
    res.status(201).json({
      id: scan.id,
      header: withDupes.header,
      sectors: withDupes.sectors,
      issues: withDupes.issues,
      scansLeftToday: Math.max(0, DAILY_LIMIT - used - 1),
    });
  } catch (err) {
    next(err);
  }
};

// Same date + flight number + route already logged → skipped, never doubled.
async function markDuplicates(pilotId, checked) {
  const date = checked.header.date ? new Date(`${checked.header.date}T00:00:00.000Z`) : null;
  if (!date) return checked;
  // The page may span midnight, so look at the whole window its sectors cover.
  const span = Math.max(0, ...(checked.sectors || []).map((s) => s.dayOffset || 0));
  const sameDay = await prisma.flightLog.findMany({
    where: { pilotId, date: { gte: date, lt: new Date(date.getTime() + (span + 1) * 86400000) } },
    select: { flightNumber: true, departure: true, arrival: true, registration: true },
  });
  const clean = (v) => String(v || '').replace(/\s+/g, '').toUpperCase();
  const routeKey = (f, d, a) => `${clean(f)}|${clean(d)}|${clean(a)}`;
  const regKey = (f, r) => `${clean(f)}|${clean(r)}`;
  const byRoute = new Set(sameDay.map((l) => routeKey(l.flightNumber, l.departure, l.arrival)));
  const byReg = new Set(sameDay.filter((l) => l.registration).map((l) => regKey(l.flightNumber, l.registration)));
  checked.sectors.forEach((s) => {
    // Same day and flight number, with either the same route or the same
    // aircraft, is the same sector written twice.
    const sameRoute = byRoute.has(routeKey(s.flightNumber, s.from, s.to));
    const sameReg = !!s.flightNumber && !!s.registration && byReg.has(regKey(s.flightNumber, s.registration));
    s.duplicate = sameRoute || sameReg;
    s.duplicateReason = sameRoute ? 'same date, flight number and route' : sameReg ? 'same date, flight number and registration' : null;
    s.include = !s.duplicate;
  });
  return checked;
}

// Two flights cannot be in the air at once. A sector that overlaps one already
// in the logbook — or an earlier sector on the same page — is flagged red on
// the review. It never blocks the save: the pilot may be fixing exactly this.
async function markOverlaps(pilotId, checked) {
  const dates = [...new Set(checked.sectors.map((s) => s.sectorDate || checked.header.date).filter(Boolean))];
  if (!dates.length) return checked;
  const from = new Date(`${dates.sort()[0]}T00:00:00.000Z`);
  const to = new Date(new Date(`${dates[dates.length - 1]}T00:00:00.000Z`).getTime() + 2 * 86400000);
  const near = await prisma.flightLog.findMany({
    where: { pilotId, date: { gte: new Date(from.getTime() - 86400000), lt: to } },
    select: { id: true, date: true, flightNumber: true, departure: true, arrival: true, offBlocksTime: true, onBlocksTime: true },
  });
  const candidates = [
    ...near.map((f) => ({ ...f, date: f.date.toISOString().slice(0, 10) })),
    ...checked.sectors.map((s, i) => ({
      id: `new-${i}`, date: s.sectorDate || checked.header.date, flightNumber: s.flightNumber,
      departure: s.from, arrival: s.to, offBlocksTime: s.out, onBlocksTime: s.in,
    })),
  ];
  const hits = findOverlaps(candidates);
  checked.sectors.forEach((s, i) => {
    const other = hits.get(`new-${i}`);
    if (!other) return;
    s.flags = { ...(s.flags || {}), overlap: { level: 'red', message: overlapMessage(other) } };
    s.needsCheck = true;
  });
  return checked;
}

// GET /logbook/scan/:id — re-open a review (and its image) by id.
exports.getScan = async (req, res, next) => {
  try {
    if (!SCAN_ENABLED) return res.status(503).json(OFF);
    const scan = await prisma.logbookScan.findFirst({
      where: { id: req.params.id, pilotId: req.pilot.id },
      select: { id: true, status: true, header: true, sectors: true, createdAt: true, imageData: true, mimeType: true },
    });
    if (!scan) return res.status(404).json({ error: 'That scan is no longer available.' });
    res.json({
      id: scan.id, status: scan.status, header: scan.header, sectors: scan.sectors,
      hasImage: !!scan.imageData, createdAt: scan.createdAt,
    });
  } catch (err) { next(err); }
};

// GET /logbook/scan/:id/image — the straightened page, for the review crops.
exports.getScanImage = async (req, res, next) => {
  try {
    if (!SCAN_ENABLED) return res.status(503).json(OFF);
    const scan = await prisma.logbookScan.findFirst({
      where: { id: req.params.id, pilotId: req.pilot.id },
      select: { imageData: true, mimeType: true },
    });
    if (!scan || !scan.imageData) return res.status(404).json({ error: 'The photo is no longer stored.' });
    res.setHeader('Content-Type', scan.mimeType || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.send(Buffer.from(scan.imageData));
  } catch (err) { next(err); }
};

// GET /logbook/scan/:id/row/:index/image — the strip of paper one sector was
// read from. The review screen puts it beside the amber fields so the pilot can
// fix a time by looking at it, instead of hunting for the row on the whole page.
exports.getRowImage = async (req, res, next) => {
  try {
    if (!SCAN_ENABLED) return res.status(503).json(OFF);
    const scan = await prisma.logbookScan.findFirst({
      where: { id: req.params.id, pilotId: req.pilot.id },
      select: { imageData: true, mimeType: true, sectors: true },
    });
    if (!scan || !scan.imageData) return res.status(404).json({ error: 'The photo is no longer stored.' });
    const sector = (scan.sectors || [])[Number(req.params.index)];
    const crop = sector && sector.rowBox
      ? await cropRow(Buffer.from(scan.imageData), sector.rowBox).catch(() => null)
      : null;
    // No box (a PDF, or the model did not give one): the whole page still helps.
    res.setHeader('Content-Type', crop ? 'image/jpeg' : (scan.mimeType || 'image/jpeg'));
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.send(crop || Buffer.from(scan.imageData));
  } catch (err) { next(err); }
};

// POST /logbook/scan/:id/save — write the reviewed sectors to the logbook.
// The client sends back the sectors as the pilot left them; every one is
// re-checked here, because a field can be edited on the review screen.
exports.saveScan = async (req, res, next) => {
  try {
    if (!SCAN_ENABLED) return res.status(503).json(OFF);
    const scan = await prisma.logbookScan.findFirst({ where: { id: req.params.id, pilotId: req.pilot.id } });
    if (!scan) return res.status(404).json({ error: 'That scan is no longer available.' });
    if (scan.status === 'SAVED') return res.status(409).json({ error: 'These flights were already saved.' });

    const pilot = await prisma.pilot.findUnique({
      where: { id: req.pilot.id },
      select: { id: true, role: true, staffNumber: true, logbookPrefs: true },
    });
    const body = req.body || {};
    const header = { ...(scan.header || {}), ...(body.header || {}) };

    // A wrong year does not look wrong: the day and month still read correctly
    // and the flight lands years down the logbook where only search finds it.
    // So a date the server flagged cannot be saved by default — the pilot has
    // to say which date they mean.
    const dateFlagStanding = !!(header.flags && header.flags.date) && header.date === (scan.header || {}).date;
    const choice = String(body.dateChoice || '');
    if (dateFlagStanding && !['suggestion', 'keep'].includes(choice)) {
      return res.status(409).json({
        error: 'This date needs a decision before these flights can be saved.',
        code: 'DATE_UNCONFIRMED',
        date: header.date,
        suggestion: (scan.header || {}).dateSuggestion || null,
      });
    }
    if (dateFlagStanding && choice === 'suggestion' && (scan.header || {}).dateSuggestion) {
      header.date = scan.header.dateSuggestion;
    }
    const edited = Array.isArray(body.sectors) && body.sectors.length ? body.sectors : (scan.sectors || []);

    // Re-run the checks over what the pilot is actually saving.
    const rechecked = await validateScan({
      date: header.date,
      aircraftType: header.aircraftType,
      registration: header.registration,
      commander: header.commander,
      firstOfficer: header.firstOfficer,
      pilotRole: header.pilotRole,
      sectors: edited.map((s) => ({ ...s, confidence: {} })),
      confidence: {},
    }, { pilot });

    // Duplicates are checked again HERE, not just at upload: the logbook can
    // have changed since the review was opened — most obviously by the pilot
    // scanning the same page twice, or saving this very review already.
    const freshlyChecked = await markDuplicates(pilot.id, {
      header: { ...header, date: header.date },
      sectors: rechecked.sectors.map((s, i) => ({ ...s, include: edited[i]?.include !== false })),
    });
    const keep = freshlyChecked.sectors.filter((s, i) => edited[i]?.include !== false && !s.duplicate);
    const skipped = freshlyChecked.sectors.filter((s) => s.duplicate);
    if (!keep.length && skipped.length) {
      return res.status(409).json({
        error: skipped.length === 1
          ? `${skipped[0].flightNumber || 'That sector'} is already in your logbook (${skipped[0].duplicateReason}).`
          : `All ${skipped.length} sectors are already in your logbook.`,
        code: 'ALL_DUPLICATES',
        sectors: freshlyChecked.sectors,
      });
    }
    const blocked = keep.filter((s) => Object.values(s.flags).some((f) => f.level === 'red'));
    if (blocked.length) {
      return res.status(422).json({ error: 'Some sectors still need fixing.', sectors: rechecked.sectors });
    }
    if (!keep.length) return res.status(400).json({ error: 'Nothing to save.' });

    const dutyId = randomUUID();
    const role = header.pilotRole === 'PIC' ? 'PIC' : 'SIC';
    const rows = keep.map((s) => {
      const hours = s.block != null ? Math.round((s.block / 60) * 100) / 100 : 0;
      return {
        pilotId: pilot.id,
        dutyId,
        scanId: scan.id,
        // The sector's own date: a leg that pushed back after midnight belongs
        // to the next day, even though the page carries one date.
        date: new Date(`${s.sectorDate || header.date}T00:00:00.000Z`),
        flightNumber: s.flightNumber,
        aircraftType: s.aircraftType || header.aircraftType || '',
        registration: s.registration || header.registration || null,
        departure: s.from,
        arrival: s.to,
        offBlocksTime: s.out, takeoffTime: s.off, landingTime: s.on, onBlocksTime: s.in,
        picName: header.commander || null,
        sicName: role === 'SIC' ? null : (header.firstOfficer || null),
        totalTime: hours,
        picTime: role === 'PIC' ? hours : 0,
        sicTime: role === 'SIC' ? hours : 0,
        // null, not 0: a sector we could not work the sun out for has an
        // unknown night time, and 0 would be a claim we cannot make.
        nightTime: s.night != null ? Math.round((s.night / 60) * 100) / 100 : null,
        // The crew's own N column is evidence; our sun calculation is a model
        // of it. Remember which one this is, so a later edit cannot quietly
        // replace what the crew wrote.
        nightSource: s.nightSource === 'form' ? 'form' : 'calculated',
        landingsDay: s.landingsDay || 0,
        landingsNight: s.landingsNight || 0,
        // A scan always asks the question, even when the answer is none.
        landingsRecorded: true,
        pilotFlying: s.pilotFlying === true,
        approach: s.approach || null,
        remarks: s.remarks || null,
        source: 'SCAN',
      };
    });
    await prisma.flightLog.createMany({ data: rows });

    // Remember what the pilot will almost certainly fly next time.
    const prefs = prefsOf(pilot);
    const last = keep[keep.length - 1];
    await prisma.pilot.update({
      where: { id: pilot.id },
      data: {
        logbookPrefs: {
          ...prefs,
          lastAircraftType: last.aircraftType || prefs.lastAircraftType || null,
          lastRegistration: last.registration || prefs.lastRegistration || null,
          lastCommander: header.commander || prefs.lastCommander || null,
        },
      },
    });

    // The photo goes unless the pilot asked to keep it.
    const keepImage = !!(prefsOf(pilot).keepScanImages);
    await prisma.logbookScan.update({
      where: { id: scan.id },
      data: {
        status: 'SAVED',
        savedCount: rows.length,
        imageKept: keepImage,
        imageData: keepImage ? scan.imageData : null,
        header, sectors: rechecked.sectors, updatedAt: new Date(),
      },
    });

    // Totals, CV and matching all read derivedTotals — refresh it now.
    await recomputeDerivedTotals(pilot.id);
    const totals = await prisma.pilot.findUnique({ where: { id: pilot.id }, select: { derivedTotals: true } });
    logger.info(`voyage scan saved: pilot=${pilot.id} sectors=${rows.length} skipped=${rechecked.sectors.length - rows.length}`);
    res.status(201).json({
      saved: rows.length,
      skipped: rechecked.sectors.length - rows.length,
      skippedDetail: skipped.map((x) => ({ flightNumber: x.flightNumber, from: x.from, to: x.to, reason: x.duplicateReason })),
      imageKept: keepImage,
      totals: totals?.derivedTotals || null,
    });
  } catch (err) { next(err); }
};

// DELETE /logbook/scan/:id — give up on a review; the photo goes with it.
exports.discardScan = async (req, res, next) => {
  try {
    if (!SCAN_ENABLED) return res.status(503).json(OFF);
    const scan = await prisma.logbookScan.findFirst({ where: { id: req.params.id, pilotId: req.pilot.id }, select: { id: true } });
    if (!scan) return res.status(404).json({ error: 'That scan is no longer available.' });
    await prisma.logbookScan.update({
      where: { id: scan.id },
      data: { status: 'DISCARDED', imageData: null, imageKept: false, updatedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
};

// GET /logbook/scan-quota — what the + sheet shows before a scan starts.
exports.quota = async (req, res, next) => {
  try {
    const used = await scansToday(req.pilot.id);
    res.json({
      used,
      limit: DAILY_LIMIT,
      left: Math.max(0, DAILY_LIMIT - used),
      // `enabled` is what the UI hides behind; `configured` only says a key exists.
      enabled: SCAN_ENABLED,
      configured: SCAN_ENABLED && !!process.env.GEMINI_API_KEY,
    });
  } catch (err) { next(err); }
};

module.exports.DAILY_LIMIT = DAILY_LIMIT;
module.exports.SCAN_ENABLED = SCAN_ENABLED;
