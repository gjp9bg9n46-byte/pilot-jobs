const prisma = require('../config/database');

// GET /cv — aggregate all data needed to build a CV
exports.getCvData = async (req, res, next) => {
  try {
    const pilotId = req.pilot.id;

    const [
      pilot, certificates, ratings, medicals,
      training, rtw, cvData, logAgg, aircraftRows,
    ] = await Promise.all([
      prisma.pilot.findUnique({ where: { id: pilotId } }),
      prisma.pilotCertificate.findMany({ where: { pilotId }, orderBy: { issueDate: 'desc' } }),
      prisma.pilotRating.findMany({ where: { pilotId } }),
      prisma.pilotMedical.findMany({ where: { pilotId }, orderBy: { expiryDate: 'desc' } }),
      prisma.pilotTrainingRecord.findMany({ where: { pilotId }, orderBy: { completedAt: 'desc' } }),
      prisma.pilotRightToWork.findMany({ where: { pilotId } }),
      prisma.cvData.findUnique({ where: { pilotId } }),
      prisma.flightLog.aggregate({
        where: { pilotId },
        _sum: {
          totalTime: true, picTime: true, sicTime: true,
          multiEngineTime: true, turbineTime: true,
          instrumentTime: true, nightTime: true,
          landingsDay: true, landingsNight: true,
        },
      }),
      prisma.flightLog.findMany({
        where: { pilotId, aircraftType: { not: '' } },
        select: { aircraftType: true },
        distinct: ['aircraftType'],
        orderBy: { date: 'desc' },
        take: 20,
      }),
    ]);

    const { passwordHash, fcmToken, ...safePilot } = pilot;

    const totals = {
      totalTime:       logAgg._sum.totalTime       ?? 0,
      picTime:         logAgg._sum.picTime         ?? 0,
      sicTime:         logAgg._sum.sicTime         ?? 0,
      multiEngineTime: logAgg._sum.multiEngineTime ?? 0,
      turbineTime:     logAgg._sum.turbineTime     ?? 0,
      instrumentTime:  logAgg._sum.instrumentTime  ?? 0,
      nightTime:       logAgg._sum.nightTime       ?? 0,
      landingsDay:     logAgg._sum.landingsDay     ?? 0,
      landingsNight:   logAgg._sum.landingsNight   ?? 0,
    };

    res.json({
      pilot: safePilot,
      certificates,
      ratings,
      medicals,
      training,
      rtw,
      totals,
      aircraftTypes: aircraftRows.map(r => r.aircraftType),
      cv: cvData ?? { education: [], languages: [], skills: [], other: [] },
    });
  } catch (err) {
    next(err);
  }
};

// PUT /cv — upsert user-entered CV fields
exports.updateCvData = async (req, res, next) => {
  try {
    const { education, languages, skills, other } = req.body;
    const cvData = await prisma.cvData.upsert({
      where:  { pilotId: req.pilot.id },
      create: { pilotId: req.pilot.id, education: education ?? [], languages: languages ?? [], skills: skills ?? [], other: other ?? [] },
      update: { education, languages, skills, other },
    });
    res.json(cvData);
  } catch (err) {
    next(err);
  }
};
