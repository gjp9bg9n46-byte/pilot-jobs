const { validationResult } = require('express-validator');
const prisma = require('../config/database');

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
      willingToRelocate, isInstructor, isExaminer,
    } = req.body;
    const pilot = await prisma.pilot.update({
      where: { id: req.pilot.id },
      data: {
        firstName, lastName, phone, country, city, nationality,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        passportNumber, passportExpiry: passportExpiry ? new Date(passportExpiry) : undefined,
        emergencyContactName, emergencyContactPhone,
        willingToRelocate, isInstructor, isExaminer,
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
    const rating = await prisma.pilotRating.create({
      data: { ...req.body, pilotId: req.pilot.id },
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
    const prefs = await prisma.pilotPreference.upsert({
      where: { pilotId: req.pilot.id },
      create: { ...req.body, pilotId: req.pilot.id },
      update: req.body,
    });
    res.json(prefs);
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

exports.getFlightTotals = async (req, res, next) => {
  try {
    const logs = await prisma.flightLog.findMany({ where: { pilotId: req.pilot.id } });
    const totals = logs.reduce(
      (acc, log) => {
        acc.totalTime += log.totalTime;
        acc.picTime += log.picTime;
        acc.sicTime += log.sicTime;
        acc.multiEngineTime += log.multiEngineTime;
        acc.turbineTime += log.turbineTime;
        acc.instrumentTime += log.instrumentTime;
        acc.nightTime += log.nightTime;
        acc.landingsDay += log.landingsDay;
        acc.landingsNight += log.landingsNight;
        return acc;
      },
      {
        totalTime: 0, picTime: 0, sicTime: 0,
        multiEngineTime: 0, turbineTime: 0, instrumentTime: 0,
        nightTime: 0, landingsDay: 0, landingsNight: 0,
      }
    );
    res.json(totals);
  } catch (err) {
    next(err);
  }
};
