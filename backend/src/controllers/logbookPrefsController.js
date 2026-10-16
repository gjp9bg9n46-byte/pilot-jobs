'use strict';

// Logbook preferences: how totals are shown, which role preset the manual form
// uses, what the last flight remembered, and the staff number a scan matches
// against the PF/PM columns. One small object, read by web and app alike.

const prisma = require('../config/database');
const { ROLE_PRESETS, presetFor } = require('../services/logbookEntry');

const TIME_FORMATS = ['hhmm', 'decimal'];

exports.getPrefs = async (req, res, next) => {
  try {
    const pilot = await prisma.pilot.findUnique({
      where: { id: req.pilot.id },
      select: { role: true, staffNumber: true, logbookPrefs: true },
    });
    const prefs = pilot.logbookPrefs || {};
    res.json({
      timeFormat: TIME_FORMATS.includes(prefs.timeFormat) ? prefs.timeFormat : 'hhmm',
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
