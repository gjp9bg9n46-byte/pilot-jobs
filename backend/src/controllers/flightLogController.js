const { randomUUID } = require('crypto');
const prisma = require('../config/database');
const { parseForeFlight, parseLogbookPro } = require('../services/logbookParserService');
const { parseCSV, detectMapping, coerceRow, extractKeyFields } = require('../services/importService');

const IMPORT_ROW_LIMIT = 500;

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
    const {
      date, aircraftType, registration, departure, arrival,
      offBlocksTime, takeoffTime, landingTime, onBlocksTime,
      flightNumber, picName, sicName,
      totalTime, picTime, sicTime,
      multiEngineTime, turbineTime, instrumentTime, nightTime,
      landingsDay, landingsNight, remarks,
    } = req.body;
    const log = await prisma.flightLog.create({
      data: {
        date, aircraftType, registration, departure, arrival,
        offBlocksTime, takeoffTime, landingTime, onBlocksTime,
        flightNumber, picName, sicName,
        totalTime, picTime, sicTime,
        multiEngineTime, turbineTime, instrumentTime, nightTime,
        landingsDay, landingsNight, remarks,
        pilotId: req.pilot.id,
        source: 'MANUAL',
      },
    });
    res.status(201).json(log);
  } catch (err) {
    next(err);
  }
};

// Creates multiple legs in one request, all sharing a dutyId so they group as one operating day.
exports.bulkCreate = async (req, res, next) => {
  try {
    const { legs } = req.body;
    if (!Array.isArray(legs) || legs.length === 0)
      return res.status(400).json({ error: 'legs must be a non-empty array' });

    const dutyId = randomUUID();
    const logs = await Promise.all(
      legs.map(({
        date, aircraftType, registration, departure, arrival,
        offBlocksTime, takeoffTime, landingTime, onBlocksTime,
        flightNumber, picName, sicName,
        totalTime, picTime, sicTime,
        multiEngineTime, turbineTime, instrumentTime, nightTime,
        landingsDay, landingsNight, remarks,
      }) =>
        prisma.flightLog.create({
          data: {
            date, aircraftType, registration, departure, arrival,
            offBlocksTime, takeoffTime, landingTime, onBlocksTime,
            flightNumber, picName, sicName,
            totalTime, picTime, sicTime,
            multiEngineTime, turbineTime, instrumentTime, nightTime,
            landingsDay, landingsNight, remarks,
            pilotId: req.pilot.id, source: 'MANUAL', dutyId,
          },
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

    const {
      date, aircraftType, registration, departure, arrival,
      offBlocksTime, takeoffTime, landingTime, onBlocksTime,
      flightNumber, picName, sicName,
      totalTime, picTime, sicTime,
      multiEngineTime, turbineTime, instrumentTime, nightTime,
      landingsDay, landingsNight, remarks,
    } = req.body;
    const log = await prisma.flightLog.update({
      where: { id: req.params.id },
      data: {
        date, aircraftType, registration, departure, arrival,
        offBlocksTime, takeoffTime, landingTime, onBlocksTime,
        flightNumber, picName, sicName,
        totalTime, picTime, sicTime,
        multiEngineTime, turbineTime, instrumentTime, nightTime,
        landingsDay, landingsNight, remarks,
      },
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

// ─── New generic CSV/Excel importer (two-step: parse then confirm) ────────────

exports.importParse = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const ext = (req.file.originalname || '').split('.').pop().toLowerCase();
    if (ext !== 'csv') {
      return res.status(422).json({ error: 'Only CSV files are supported at this step. Excel (.xlsx) support is coming.' });
    }

    let parsed;
    try {
      parsed = parseCSV(req.file.buffer);
    } catch (e) {
      return res.status(422).json({ error: e.message });
    }

    const { headers, rawRows } = parsed;

    if (headers.length === 0) {
      return res.status(422).json({ error: 'File is empty or contains no recognisable columns.' });
    }
    if (rawRows.length === 0) {
      return res.status(422).json({ error: 'File has headers but no data rows.' });
    }
    if (rawRows.length > IMPORT_ROW_LIMIT) {
      return res.status(422).json({
        error: `File has ${rawRows.length} data rows. The limit is ${IMPORT_ROW_LIMIT} rows per import. Split the file into batches.`,
      });
    }

    const mapping = detectMapping(headers);

    // Duplicate detection — query DB for existing flights matching key fields
    const keyFields = extractKeyFields(rawRows, headers, mapping);
    const uniqueDates = [...new Set(keyFields.map(k => k.date).filter(Boolean))];

    const duplicateIndices = [];
    if (uniqueDates.length > 0) {
      const existing = await prisma.flightLog.findMany({
        where: { pilotId: req.pilot.id, date: { in: uniqueDates } },
        select: { date: true, flightNumber: true, departure: true, arrival: true },
      });

      const byDate = {};
      for (const e of existing) {
        const d = new Date(e.date).toISOString().split('T')[0];
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push({
          flightNumber: (e.flightNumber || '').toUpperCase().replace(/\s/g, ''),
          departure:    (e.departure    || '').toUpperCase(),
          arrival:      (e.arrival      || '').toUpperCase(),
        });
      }

      keyFields.forEach((k, i) => {
        if (!k.date) return;
        const d = k.date.split('T')[0];
        const candidates = byDate[d] || [];
        const isDup = candidates.some(e =>
          (k.flightNumber && e.flightNumber && k.flightNumber === e.flightNumber) ||
          (k.departure && k.arrival && k.departure === e.departure && k.arrival === e.arrival)
        );
        if (isDup) duplicateIndices.push(i);
      });
    }

    res.json({ headers, mapping, rawRows, duplicateIndices });
  } catch (err) {
    next(err);
  }
};

exports.importConfirm = async (req, res, next) => {
  try {
    const { rows } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows must be a non-empty array.' });
    }
    if (rows.length > IMPORT_ROW_LIMIT) {
      return res.status(400).json({ error: `Too many rows. Maximum ${IMPORT_ROW_LIMIT} per import.` });
    }

    const valid = [];
    const skipped = [];

    for (let i = 0; i < rows.length; i++) {
      const { coerced, errors } = coerceRow(rows[i]);
      if (errors.length > 0) {
        skipped.push({ rowIndex: i + 1, errors });
      } else {
        valid.push(coerced);
      }
    }

    if (valid.length === 0) {
      return res.status(422).json({ error: 'No valid rows to import.', details: skipped });
    }

    const batchId = randomUUID();

    await prisma.$transaction(
      valid.map(row => prisma.flightLog.create({
        data: {
          ...row,
          pilotId: req.pilot.id,
          source: 'IMPORTED',
          importBatchId: batchId,
        },
      }))
    );

    res.status(201).json({ imported: valid.length, skipped: skipped.length, batchId });
  } catch (err) {
    next(err);
  }
};

// ─── Legacy ForeFlight / Logbook Pro importer ─────────────────────────────────

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
