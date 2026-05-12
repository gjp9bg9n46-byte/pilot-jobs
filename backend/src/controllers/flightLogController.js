const prisma = require('../config/database');
const { parseForeFlight, parseLogbookPro } = require('../services/logbookParserService');

exports.getLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      prisma.flightLog.findMany({
        where: { pilotId: req.pilot.id },
        orderBy: { date: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.flightLog.count({ where: { pilotId: req.pilot.id } }),
    ]);
    res.json({ logs, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
};

exports.createLog = async (req, res, next) => {
  try {
    const log = await prisma.flightLog.create({
      data: { ...req.body, pilotId: req.pilot.id, source: 'MANUAL' },
    });
    res.status(201).json(log);
  } catch (err) {
    next(err);
  }
};

// Creates multiple legs in one request. Returns all created records.
exports.bulkCreate = async (req, res, next) => {
  try {
    const { legs } = req.body;
    if (!Array.isArray(legs) || legs.length === 0)
      return res.status(400).json({ error: 'legs must be a non-empty array' });

    const logs = await Promise.all(
      legs.map((leg) =>
        prisma.flightLog.create({
          data: { ...leg, pilotId: req.pilot.id, source: 'MANUAL' },
        })
      )
    );
    res.status(201).json({ logs });
  } catch (err) {
    next(err);
  }
};

// Returns last 5 distinct aircraft types + last 5 registrations per type.
exports.recentAircraft = async (req, res, next) => {
  try {
    const rows = await prisma.flightLog.findMany({
      where: { pilotId: req.pilot.id },
      select: { aircraftType: true, registration: true },
      orderBy: { date: 'desc' },
      take: 150,
    });

    const types = [];
    const seenTypes = new Set();
    const regByType = {};

    for (const row of rows) {
      if (!seenTypes.has(row.aircraftType) && types.length < 5) {
        seenTypes.add(row.aircraftType);
        types.push(row.aircraftType);
        regByType[row.aircraftType] = [];
      }
      if (row.registration && seenTypes.has(row.aircraftType)) {
        const regs = regByType[row.aircraftType];
        if (regs && !regs.includes(row.registration) && regs.length < 5) {
          regs.push(row.registration);
        }
      }
    }

    res.json({ types, regByType });
  } catch (err) {
    next(err);
  }
};

exports.updateLog = async (req, res, next) => {
  try {
    const existing = await prisma.flightLog.findFirst({
      where: { id: req.params.id, pilotId: req.pilot.id },
    });
    if (!existing) return res.status(404).json({ error: 'Log not found' });

    const log = await prisma.flightLog.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(log);
  } catch (err) {
    next(err);
  }
};

exports.deleteLog = async (req, res, next) => {
  try {
    await prisma.flightLog.deleteMany({
      where: { id: req.params.id, pilotId: req.pilot.id },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

exports.importLogbook = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { source } = req.body;
    let entries = [];

    if (source === 'FOREFLIGHT') {
      entries = await parseForeFlight(req.file.buffer, req.file.mimetype);
    } else if (source === 'LOGBOOK_PRO') {
      entries = await parseLogbookPro(req.file.buffer, req.file.mimetype);
    } else {
      return res.status(400).json({ error: `Unsupported source: ${source}` });
    }

    const created = await prisma.flightLog.createMany({
      data: entries.map((e) => ({ ...e, pilotId: req.pilot.id, source })),
      skipDuplicates: true,
    });

    res.json({ imported: created.count, total: entries.length });
  } catch (err) {
    next(err);
  }
};
