const { validationResult } = require('express-validator');
const prisma = require('../config/database');

// ── Preference key mapping ──────────────────────────────────────────────────
// The client (web + mobile) speaks friendly keys; the PilotPreference table uses
// schema columns. PREF_KEY_MAP whitelists incoming keys and maps each to its
// column(s) — a single category toggle drives both the email and push variants.
// Anything not in the map is discarded (no raw req.body spread → no Prisma crash).
const PREF_KEY_MAP = {
  // Job preferences
  preferredCountries: 'preferredCountries',
  preferredAircraft:  'preferredAircraft',
  minSalary:          'minSalary',
  salaryCurrency:     'minSalaryCurrency',
  salaryPeriod:       'minSalaryPeriod',
  salaryNegotiable:   'salaryNegotiable',
  contractTypes:      'preferredContractTypes',
  routePreferences:   'routePreferences',
  // Notifications (single UI toggle per category → email + push columns)
  allEmailOn:         'notifyEmail',
  newJobMatch:        ['notifyMatchesEmail', 'notifyMatchesPush'],
  alertDigest:        ['notifyDigestEmail', 'notifyAlertsPush'],
  applicationUpdate:  ['notifyApplicationsEmail', 'notifyApplicationsPush'],
  documentExpiry:     ['notifyExpiriesEmail', 'notifyExpiriesPush'],
  productUpdates:     'notifyProductUpdatesEmail',
  // Quiet hours
  quietHours:         'quietHoursEnabled',
  quietFrom:          'quietHoursStart',
  quietTo:            'quietHoursEnd',
};

// Reverse map: PilotPreference row → the client-facing preference shape, so the
// UI toggles hydrate. Reads the canonical (email) column for each category.
function toClientPrefs(p) {
  if (!p) return p;
  return {
    ...p,
    salaryCurrency:    p.minSalaryCurrency,
    salaryPeriod:      p.minSalaryPeriod,
    contractTypes:     p.preferredContractTypes,
    allEmailOn:        p.notifyEmail,
    newJobMatch:       p.notifyMatchesEmail,
    alertDigest:       p.notifyDigestEmail,
    applicationUpdate: p.notifyApplicationsEmail,
    documentExpiry:    p.notifyExpiriesEmail,
    productUpdates:    p.notifyProductUpdatesEmail,
    quietHours:        p.quietHoursEnabled,
    quietFrom:         p.quietHoursStart,
    quietTo:           p.quietHoursEnd,
  };
}

exports.getProfile = async (req, res, next) => {
  try {
    const pilot = await prisma.pilot.findUnique({
      where: { id: req.pilot.id },
      include: {
        certificates: true,
        ratings: true,
        medicals: true,
        trainingRecords: { orderBy: { completedAt: 'desc' } },
        rightToWork: true,
        preferences: true,
      },
    });
    const { passwordHash, ...profile } = pilot;
    if (profile.preferences) profile.preferences = toClientPrefs(profile.preferences);
    res.json(profile);
  } catch (err) {
    next(err);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const {
      firstName, lastName, phone, country, city, nationality,
      dateOfBirth, passportNumber, passportExpiry,
      emergencyContactName, emergencyContactPhone,
      willingToRelocate, isInstructor, isExaminer, education, role,
    } = req.body;

    const VALID_ROLES = ['FIRST_OFFICER', 'CAPTAIN'];
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(422).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
    }

    const pilot = await prisma.pilot.update({
      where: { id: req.pilot.id },
      data: {
        firstName, lastName, phone, country, city, nationality,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        passportNumber, passportExpiry: passportExpiry ? new Date(passportExpiry) : undefined,
        emergencyContactName, emergencyContactPhone,
        willingToRelocate, isInstructor, isExaminer,
        education: education === null ? null : (education || undefined),
        role: role || null,
      },
    });
    const { passwordHash, ...profile } = pilot;
    res.json(profile);
  } catch (err) {
    next(err);
  }
};

exports.addCertificate = async (req, res, next) => {
  try {
    if (req.body.type === 'ELP') {
      return res.status(400).json({ error: 'Use the /profile/elp endpoint to add ELP records.' });
    }
    const cert = await prisma.pilotCertificate.create({
      data: { ...req.body, pilotId: req.pilot.id },
    });
    res.status(201).json(cert);
  } catch (err) {
    next(err);
  }
};

exports.deleteCertificate = async (req, res, next) => {
  try {
    await prisma.pilotCertificate.deleteMany({
      where: { id: req.params.id, pilotId: req.pilot.id },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

exports.addRating = async (req, res, next) => {
  try {
    let { issuingAuthority } = req.body;

    if (!issuingAuthority) {
      const licences = await prisma.pilotCertificate.findMany({
        where: { pilotId: req.pilot.id, type: { not: 'ELP' } },
        orderBy: { createdAt: 'desc' },
      });
      const atpl = licences.find((l) => l.type === 'ATPL' || l.type === 'ATP');
      const cpl  = licences.find((l) => l.type === 'CPL');
      issuingAuthority = atpl?.issuingAuthority ?? cpl?.issuingAuthority ?? licences[0]?.issuingAuthority ?? 'FAA';
    }

    const aircraftType = req.body.aircraftType?.trim().toUpperCase() ?? req.body.aircraftType;
    const rating = await prisma.pilotRating.create({
      data: { ...req.body, pilotId: req.pilot.id, issuingAuthority, aircraftType },
    });
    res.status(201).json(rating);
  } catch (err) {
    next(err);
  }
};

exports.deleteRating = async (req, res, next) => {
  try {
    await prisma.pilotRating.deleteMany({
      where: { id: req.params.id, pilotId: req.pilot.id },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

exports.addMedical = async (req, res, next) => {
  try {
    const medical = await prisma.pilotMedical.create({
      data: { ...req.body, pilotId: req.pilot.id },
    });
    res.status(201).json(medical);
  } catch (err) {
    next(err);
  }
};

exports.deleteMedical = async (req, res, next) => {
  try {
    await prisma.pilotMedical.deleteMany({
      where: { id: req.params.id, pilotId: req.pilot.id },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

exports.addTraining = async (req, res, next) => {
  try {
    const { type, provider, completedAt, expiresAt, remarks } = req.body;
    const record = await prisma.pilotTrainingRecord.create({
      data: {
        pilotId: req.pilot.id,
        type,
        provider,
        completedAt: new Date(completedAt),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        remarks,
      },
    });
    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
};

exports.deleteTraining = async (req, res, next) => {
  try {
    await prisma.pilotTrainingRecord.deleteMany({
      where: { id: req.params.id, pilotId: req.pilot.id },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

// Recurrent training — maps frontend field names to DB schema
exports.getRecurrent = async (req, res, next) => {
  try {
    const records = await prisma.pilotTrainingRecord.findMany({
      where: { pilotId: req.pilot.id },
      orderBy: { completedAt: 'desc' },
    });
    res.json(records.map((r) => ({
      id: r.id,
      trainingType: r.type,
      provider: r.provider,
      completionDate: r.completedAt,
      expiryDate: r.expiresAt,
      remarks: r.remarks,
    })));
  } catch (err) { next(err); }
};

exports.addRecurrent = async (req, res, next) => {
  try {
    const { trainingType, provider, completionDate, expiryDate, remarks } = req.body;
    const record = await prisma.pilotTrainingRecord.create({
      data: {
        pilotId: req.pilot.id,
        type: trainingType,
        provider,
        completedAt: new Date(completionDate),
        expiresAt: expiryDate ? new Date(expiryDate) : null,
        remarks,
      },
    });
    res.status(201).json({
      id: record.id,
      trainingType: record.type,
      provider: record.provider,
      completionDate: record.completedAt,
      expiryDate: record.expiresAt,
      remarks: record.remarks,
    });
  } catch (err) { next(err); }
};

exports.deleteRecurrent = async (req, res, next) => {
  try {
    await prisma.pilotTrainingRecord.deleteMany({
      where: { id: req.params.id, pilotId: req.pilot.id },
    });
    res.status(204).send();
  } catch (err) { next(err); }
};

// ELP — stored as PilotCertificate with type='ELP'
exports.getELP = async (req, res, next) => {
  try {
    const certs = await prisma.pilotCertificate.findMany({
      where: { pilotId: req.pilot.id, type: 'ELP' },
      orderBy: { issueDate: 'desc' },
    });
    res.json(certs.map((c) => ({
      id: c.id,
      level: c.englishLevel,
      issuingAuthority: c.issuingAuthority,
      endorsementNumber: c.certificateNumber,
      issueDate: c.issueDate,
      expiryDate: c.expiryDate,
      noExpiry: !c.expiryDate,
    })));
  } catch (err) { next(err); }
};

exports.addELP = async (req, res, next) => {
  try {
    const { level, issuingAuthority, endorsementNumber, issueDate, expiryDate, noExpiry } = req.body;
    const cert = await prisma.pilotCertificate.create({
      data: {
        pilotId: req.pilot.id,
        type: 'ELP',
        issuingAuthority: issuingAuthority || 'ICAO',
        certificateNumber: endorsementNumber || null,
        issueDate: issueDate ? new Date(issueDate) : null,
        expiryDate: (!noExpiry && expiryDate) ? new Date(expiryDate) : null,
        englishLevel: level,
      },
    });
    res.status(201).json({
      id: cert.id,
      level: cert.englishLevel,
      issuingAuthority: cert.issuingAuthority,
      endorsementNumber: cert.certificateNumber,
      issueDate: cert.issueDate,
      expiryDate: cert.expiryDate,
      noExpiry: !cert.expiryDate,
    });
  } catch (err) { next(err); }
};

exports.deleteELP = async (req, res, next) => {
  try {
    await prisma.pilotCertificate.deleteMany({
      where: { id: req.params.id, pilotId: req.pilot.id, type: 'ELP' },
    });
    res.status(204).send();
  } catch (err) { next(err); }
};

// Right to Work — maps frontend field names to DB schema
exports.getRTW = async (req, res, next) => {
  try {
    const records = await prisma.pilotRightToWork.findMany({
      where: { pilotId: req.pilot.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(records.map((r) => ({
      id: r.id,
      country: r.country,
      documentType: r.documentType,
      documentNumber: r.documentNumber,
      expiryDate: r.expiresAt,
      noExpiry: !r.expiresAt,
    })));
  } catch (err) { next(err); }
};

exports.addRTW = async (req, res, next) => {
  try {
    const { country, documentType, documentNumber, expiryDate, noExpiry } = req.body;
    const rtw = await prisma.pilotRightToWork.create({
      data: {
        pilotId: req.pilot.id,
        country,
        documentType,
        documentNumber: documentNumber || null,
        expiresAt: (!noExpiry && expiryDate) ? new Date(expiryDate) : null,
      },
    });
    res.status(201).json({
      id: rtw.id,
      country: rtw.country,
      documentType: rtw.documentType,
      documentNumber: rtw.documentNumber,
      expiryDate: rtw.expiresAt,
      noExpiry: !rtw.expiresAt,
    });
  } catch (err) { next(err); }
};

exports.deleteRTW = async (req, res, next) => {
  try {
    await prisma.pilotRightToWork.deleteMany({
      where: { id: req.params.id, pilotId: req.pilot.id },
    });
    res.status(204).send();
  } catch (err) { next(err); }
};

exports.addRightToWork = async (req, res, next) => {
  try {
    const { country, documentType, documentNumber, expiresAt } = req.body;
    const rtw = await prisma.pilotRightToWork.create({
      data: {
        pilotId: req.pilot.id,
        country,
        documentType,
        documentNumber,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
    res.status(201).json(rtw);
  } catch (err) {
    next(err);
  }
};

exports.deleteRightToWork = async (req, res, next) => {
  try {
    await prisma.pilotRightToWork.deleteMany({
      where: { id: req.params.id, pilotId: req.pilot.id },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

exports.updatePreferences = async (req, res, next) => {
  try {
    const body = { ...req.body };

    // Backward-compat (one release): legacy split expiry toggles → merged
    // documentExpiry, true if EITHER was true. Lets un-upgraded clients still save.
    if ('certificateExpiry' in body || 'medicalExpiry' in body) {
      if (!('documentExpiry' in body)) {
        body.documentExpiry = !!(body.certificateExpiry || body.medicalExpiry);
      }
      delete body.certificateExpiry;
      delete body.medicalExpiry;
    }

    // Whitelist + map client keys → schema columns; drop anything unknown.
    const data = {};
    for (const [key, value] of Object.entries(body)) {
      const cols = PREF_KEY_MAP[key];
      if (!cols) continue;
      for (const col of Array.isArray(cols) ? cols : [cols]) data[col] = value;
    }

    const prefs = await prisma.pilotPreference.upsert({
      where: { pilotId: req.pilot.id },
      create: { ...data, pilotId: req.pilot.id },
      update: data,
    });
    res.json(toClientPrefs(prefs));
  } catch (err) {
    next(err);
  }
};

exports.updatePrivacy = async (req, res, next) => {
  try {
    const { profileVisible, anonymousBrowsing, showSeniority } = req.body;
    const pilot = await prisma.pilot.update({
      where: { id: req.pilot.id },
      data: {
        ...(profileVisible    !== undefined && { profileVisible }),
        ...(anonymousBrowsing !== undefined && { anonymousBrowsing }),
        ...(showSeniority     !== undefined && { showSeniority }),
      },
    });
    const { passwordHash, ...profile } = pilot;
    res.json(profile);
  } catch (err) {
    next(err);
  }
};

exports.getCounts = async (req, res, next) => {
  try {
    const [logEntries, licences, medicals] = await Promise.all([
      prisma.flightLog.count({ where: { pilotId: req.pilot.id } }),
      prisma.pilotCertificate.count({ where: { pilotId: req.pilot.id } }),
      prisma.pilotMedical.count({ where: { pilotId: req.pilot.id } }),
    ]);
    res.json({ logEntries, licences, medicals, applications: 0 });
  } catch (err) {
    next(err);
  }
};

exports.exportData = async (req, res, next) => {
  try {
    const pilot = await prisma.pilot.findUnique({
      where: { id: req.pilot.id },
      include: {
        certificates: true,
        ratings: true,
        medicals: true,
        trainingRecords: true,
        rightToWork: true,
        preferences: true,
        flightLogs: { orderBy: { date: 'desc' } },
      },
    });
    const { passwordHash, fcmToken, ...safe } = pilot;
    res.json({ exportedAt: new Date().toISOString(), pilot: safe });
  } catch (err) {
    next(err);
  }
};

// Numeric keys stored in carryForward — must match FlightLog column names exactly.
const CF_KEYS = [
  'totalTime', 'picTime', 'sicTime',
  'nightTime', 'instrumentTime', 'instrumentActualTime', 'instrumentSimTime',
  'multiEngineTime', 'turbineTime', 'jetTime', 'crossCountryTime',
  'landingsDay', 'landingsNight',
];

exports.getFlightTotals = async (req, res, next) => {
  try {
    const [logs, pilot] = await Promise.all([
      prisma.flightLog.findMany({ where: { pilotId: req.pilot.id } }),
      prisma.pilot.findUnique({ where: { id: req.pilot.id }, select: { carryForward: true } }),
    ]);

    const cf = pilot.carryForward ?? {};

    const totals = logs.reduce(
      (acc, log) => {
        acc.totalTime            += log.totalTime;
        acc.picTime              += log.picTime;
        acc.sicTime              += log.sicTime;
        acc.multiEngineTime      += log.multiEngineTime;
        acc.turbineTime          += log.turbineTime;
        acc.jetTime              += log.jetTime              ?? 0;
        acc.instrumentTime       += log.instrumentTime;
        acc.instrumentActualTime += log.instrumentActualTime ?? 0;
        acc.instrumentSimTime    += log.instrumentSimTime    ?? 0;
        acc.crossCountryTime     += log.crossCountryTime     ?? 0;
        acc.nightTime            += log.nightTime;
        acc.landingsDay          += log.landingsDay;
        acc.landingsNight        += log.landingsNight;
        return acc;
      },
      {
        totalTime: 0, picTime: 0, sicTime: 0,
        nightTime: 0, instrumentTime: 0, instrumentActualTime: 0, instrumentSimTime: 0,
        multiEngineTime: 0, turbineTime: 0, jetTime: 0, crossCountryTime: 0,
        landingsDay: 0, landingsNight: 0,
      }
    );

    // Add carry-forward to all-time totals only.
    // Recency (90d/12m) is computed separately with date filters and never includes carry-forward.
    for (const key of CF_KEYS) {
      totals[key] += (cf[key] ?? 0);
    }

    res.json(totals);
  } catch (err) {
    next(err);
  }
};

exports.getCarryForward = async (req, res, next) => {
  try {
    const pilot = await prisma.pilot.findUnique({
      where: { id: req.pilot.id },
      select: { carryForward: true },
    });
    // Return null when never set — the frontend uses null as the migration sentinel.
    res.json(pilot.carryForward);
  } catch (err) {
    next(err);
  }
};

exports.updateCarryForward = async (req, res, next) => {
  try {
    const existing = await prisma.pilot.findUnique({
      where: { id: req.pilot.id },
      select: { carryForward: true },
    });

    const current = existing.carryForward ?? {};

    // Merge: only update keys that are explicitly provided in the request body.
    const updated = { ...current };
    for (const key of CF_KEYS) {
      if (req.body[key] !== undefined) {
        const n = Number(req.body[key]);
        updated[key] = (!isFinite(n) || n < 0) ? 0 : n;
      }
    }

    const result = await prisma.pilot.update({
      where: { id: req.pilot.id },
      data:  { carryForward: updated },
      select: { carryForward: true },
    });

    res.json(result.carryForward);
  } catch (err) {
    next(err);
  }
};
