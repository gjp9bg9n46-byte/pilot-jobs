'use strict';

// Logbook preferences: how totals are shown, which role preset the manual form
// uses, what the last flight remembered, and the staff number a scan matches
// against the PF/PM columns. One small object, read by web and app alike.

const prisma = require('../config/database');
const { ROLE_PRESETS, presetFor } = require('../services/logbookEntry');

const TIME_FORMATS = ['hhmm', 'decimal'];
// How the flight list is grouped. Month is what a pilot who has never chosen
// gets ("how much did I fly in October" is the everyday question); an explicit
// choice of Day is remembered, and the same setting drives web and app.
const GROUPINGS = ['month', 'day'];
// What the "Where you flew" card draws. A pilot's map is their career, so
// all-time is the default; "this view" follows whichever page and grouping
// the list is showing, which is what the card used to do and nothing else.
const MAP_SCOPES = ['all', 'view'];

exports.getPrefs = async (req, res, next) => {
  try {
    const pilot = await prisma.pilot.findUnique({
      where: { id: req.pilot.id },
      select: { role: true, staffNumber: true, logbookPrefs: true },
    });
    const prefs = pilot.logbookPrefs || {};
    res.json({
      timeFormat: TIME_FORMATS.includes(prefs.timeFormat) ? prefs.timeFormat : 'hhmm',
      grouping: GROUPINGS.includes(prefs.grouping) ? prefs.grouping : 'month',
      mapScope: MAP_SCOPES.includes(prefs.mapScope) ? prefs.mapScope : 'all',
      rolePreset: presetFor(pilot),
      rolePresets: Object.entries(ROLE_PRESETS).map(([key, v]) => ({ key, ...v })),
      keepScanImages: !!prefs.keepScanImages,
      staffNumber: pilot.staffNumber || null,
      last: {
        aircraftType: prefs.lastAircraftType || null,
        registration: prefs.lastRegistration || null,
        commander: prefs.lastCommander || null,
      },
    });
  } catch (err) { next(err); }
};

exports.updatePrefs = async (req, res, next) => {
  try {
    const body = req.body || {};
    const pilot = await prisma.pilot.findUnique({ where: { id: req.pilot.id }, select: { logbookPrefs: true } });
    const prefs = { ...(pilot.logbookPrefs || {}) };

    if (body.timeFormat !== undefined) {
      if (!TIME_FORMATS.includes(body.timeFormat)) return res.status(422).json({ error: 'timeFormat must be hhmm or decimal.' });
      prefs.timeFormat = body.timeFormat;
    }
    if (body.mapScope !== undefined) {
      if (!MAP_SCOPES.includes(body.mapScope)) return res.status(422).json({ error: 'mapScope must be all or view.' });
      prefs.mapScope = body.mapScope;
    }
    if (body.grouping !== undefined) {
      if (!GROUPINGS.includes(body.grouping)) return res.status(422).json({ error: 'grouping must be month or day.' });
      prefs.grouping = body.grouping;
    }
    if (body.rolePreset !== undefined) {
      if (!ROLE_PRESETS[body.rolePreset]) return res.status(422).json({ error: 'Unknown role preset.' });
      prefs.rolePreset = body.rolePreset;
    }
    if (body.keepScanImages !== undefined) prefs.keepScanImages = !!body.keepScanImages;

    const data = { logbookPrefs: prefs };
    if (body.staffNumber !== undefined) {
      const sn = String(body.staffNumber || '').trim().slice(0, 16);
      if (sn && !/^[A-Za-z0-9-]{1,16}$/.test(sn)) return res.status(422).json({ error: 'Staff number: letters, digits and dashes only.' });
      data.staffNumber = sn || null;
    }
    await prisma.pilot.update({ where: { id: req.pilot.id }, data });
    return exports.getPrefs(req, res, next);
  } catch (err) { next(err); }
};
