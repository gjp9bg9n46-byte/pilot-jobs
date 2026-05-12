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
