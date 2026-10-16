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
const { extractVoyageReport, ScanError, modelName } = require('../services/voyageExtractor');
const { validateScan } = require('../services/voyageValidate');
const { recomputeDerivedTotals } = require('../services/logbookSummary');

const DAILY_LIMIT = Number(process.env.SCAN_DAILY_LIMIT || 30);
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
      extracted = await extractVoyageReport({ buffer: prep.buffer, mimeType: prep.mimeType });
    } catch (err) {
      const code = err instanceof ScanError ? err.code : 'PROVIDER';
      await prisma.logbookScan.create({
        data: { id: randomUUID(), pilotId: pilot.id, status: 'FAILED', model: modelName(), error: code, updatedAt: new Date() },
      });
      const message = code === 'TIMEOUT' ? 'That took too long — try again, or enter the flight manually.' : UNREADABLE;
      return res.status(code === 'TIMEOUT' ? 504 : 422).json({ error: message, code });
    }

    const checked = await validateScan(extracted.raw, { pilot });
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

    // Store the straightened image upright, so the review crops read the right
    // way up whichever way the page was photographed.
    const stored = await uprightCopy(prep, checked.header.pageOrientation);
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

async function uprightCopy(prep, orientation) {
  if (prep.mimeType === 'application/pdf') return prep;
  const turn = { rotated_cw: -90, rotated_ccw: 90, upside_down: 180 }[orientation] || 0;
  if (!turn) return prep;
  const buffer = await sharp(prep.buffer).rotate(turn).jpeg({ quality: 88 }).toBuffer();
  return { ...prep, buffer };
}

// Same date + flight number + route already logged → skipped, never doubled.
async function markDuplicates(pilotId, checked) {
  const date = checked.header.date ? new Date(`${checked.header.date}T00:00:00.000Z`) : null;
  if (!date) return checked;
  const sameDay = await prisma.flightLog.findMany({
    where: { pilotId, date: { gte: date, lt: new Date(date.getTime() + 86400000) } },
    select: { flightNumber: true, departure: true, arrival: true },
  });
  const key = (f, d, a) => `${String(f || '').replace(/\s+/g, '').toUpperCase()}|${String(d || '').toUpperCase()}|${String(a || '').toUpperCase()}`;
  const existing = new Set(sameDay.map((l) => key(l.flightNumber, l.departure, l.arrival)));
  checked.sectors.forEach((s) => {
    s.duplicate = existing.has(key(s.flightNumber, s.from, s.to));
    if (s.duplicate) s.include = false;
    else s.include = true;
  });
  return checked;
}

// GET /logbook/scan/:id — re-open a review (and its image) by id.
exports.getScan = async (req, res, next) => {
  try {
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

// POST /logbook/scan/:id/save — write the reviewed sectors to the logbook.
// The client sends back the sectors as the pilot left them; every one is
// re-checked here, because a field can be edited on the review screen.
exports.saveScan = async (req, res, next) => {
  try {
    const scan = await prisma.logbookScan.findFirst({ where: { id: req.params.id, pilotId: req.pilot.id } });
    if (!scan) return res.status(404).json({ error: 'That scan is no longer available.' });
    if (scan.status === 'SAVED') return res.status(409).json({ error: 'These flights were already saved.' });

    const pilot = await prisma.pilot.findUnique({
      where: { id: req.pilot.id },
      select: { id: true, role: true, staffNumber: true, logbookPrefs: true },
    });
    const body = req.body || {};
    const header = { ...(scan.header || {}), ...(body.header || {}) };
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

    const keep = rechecked.sectors.filter((s, i) => edited[i]?.include !== false && !edited[i]?.duplicate);
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
        date: new Date(`${header.date}T00:00:00.000Z`),
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
        nightTime: s.night != null ? Math.round((s.night / 60) * 100) / 100 : 0,
        landingsDay: s.landingsDay || 0,
        landingsNight: s.landingsNight || 0,
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
      imageKept: keepImage,
      totals: totals?.derivedTotals || null,
    });
  } catch (err) { next(err); }
};

// DELETE /logbook/scan/:id — give up on a review; the photo goes with it.
exports.discardScan = async (req, res, next) => {
  try {
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
    res.json({ used, limit: DAILY_LIMIT, left: Math.max(0, DAILY_LIMIT - used), configured: !!process.env.GEMINI_API_KEY });
  } catch (err) { next(err); }
};

module.exports.DAILY_LIMIT = DAILY_LIMIT;
