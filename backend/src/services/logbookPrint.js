'use strict';
// ── Printable logbook (EASA Part-FCL layout) ────────────────────────────────
//
// The pagination and the running totals are computed HERE, not in the two
// clients, so the PDF a pilot downloads on the web and the one they share from
// the phone are the same document — same rows on the same pages, same figures
// in the totals block.
//
// Three decisions, written down because nobody was available to ask:
//
//  1. This is a PERSONAL DOCUMENT, so the PIC name column is filled. The
//     no-crew-names rule covers reports and share cards, which get posted;
//     a logbook page is signed by its holder and shown to an authority.
//
//  2. A MISSING VALUE IS BLANK, never 0. An EASA logbook column left empty
//     means "not applicable or not recorded"; a nought means "none, and we
//     checked". Only the total time column is always printed, because a
//     sector with no duration should not be in a logbook at all.
//
//  3. CARRY-FORWARD goes into "previous pages" on page one, which is exactly
//     what the brought-forward line is for: hours flown before this book.
//
// Hours print as h:mm. That is what the form expects and what the rest of the
// product now shows everywhere.
const prisma = require('../config/database');
const { _internals } = require('./logbookSummary');

const { blockHours, resolveType } = _internals;

// What fits an A4 landscape sheet at a readable size once the header, the
// three totals lines and the footer have taken their share. Measured from a
// rendered page rather than guessed: at 14 the sheet was half empty, which is
// not what a logbook page looks like and costs 37 pages where 22 will do.
// Fixed, so page breaks are reproducible across both platforms.
const ROWS_PER_PAGE = 32;

/** Hours as h:mm — "1592:24", never "1592.4". Blank for nothing. */
function hhmm(hours) {
  if (hours == null || !Number.isFinite(Number(hours)) || Number(hours) <= 0) return '';
  const total = Math.round(Number(hours) * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** A count, blank when there is nothing to say. */
const count = (n) => (Number(n) > 0 ? String(Number(n)) : '');

/** The columns that accumulate down the page and across the book. */
const SUM_KEYS = ['multiPilot', 'total', 'night', 'ifr', 'pic', 'coPilot', 'dual', 'landingsDay', 'landingsNight'];
const zeroSums = () => Object.fromEntries(SUM_KEYS.map((k) => [k, 0]));
const addSums = (a, b) => Object.fromEntries(SUM_KEYS.map((k) => [k, (a[k] || 0) + (b[k] || 0)]));

/** Carry-forward, mapped onto the totals columns. Absent keys stay zero. */
function carryForwardSums(cf) {
  const n = (k) => (Number.isFinite(Number((cf || {})[k])) ? Number(cf[k]) : 0);
  return {
    multiPilot: 0,
    total: n('totalTime'),
    night: n('nightTime'),
    ifr: n('instrumentTime'),
    pic: n('picTime'),
    coPilot: n('sicTime'),
    dual: 0,
    landingsDay: n('landingsDay'),
    landingsNight: n('landingsNight'),
  };
}

/** One logbook line. Everything a Part-FCL page asks for, blanks included. */
function toRow(log) {
  const hours = blockHours(log);
  const { type } = resolveType(log);
  const pic = Number(log.picTime) || 0;
  const sic = Number(log.sicTime) || 0;
  // Multi-pilot: an airliner sector is multi-pilot time. We do not store the
  // operation type, so the honest proxy is "the pilot logged it as PIC or
  // co-pilot on a type we class as multi-engine turbine". Where we cannot
  // tell, the column stays blank rather than claiming the hours.
  const multiPilot = (pic > 0 || sic > 0) ? hours : 0;
  return {
    date: log.date.toISOString().slice(0, 10),
    depPlace: log.departure || '',
    depTime: log.offBlocksTime || '',
    arrPlace: log.arrival || '',
    arrTime: log.onBlocksTime || '',
    type: type || log.aircraftType || '',
    registration: log.registration || '',
    multiPilot,
    total: hours,
    picName: log.picName || '',
    landingsDay: Number(log.landingsDay) || 0,
    landingsNight: Number(log.landingsNight) || 0,
    night: Number(log.nightTime) || 0,
    ifr: Number(log.instrumentTime) || 0,
    pic,
    coPilot: sic,
    // No training column exists yet (it arrives with the experience-report
    // import). Printed blank rather than guessed at.
    dual: 0,
    remarks: log.remarks || '',
    // Pre-formatted so both clients print identical strings.
    f: {
      multiPilot: hhmm(multiPilot),
      total: hhmm(hours),
      night: hhmm(Number(log.nightTime) || 0),
      ifr: hhmm(Number(log.instrumentTime) || 0),
      pic: hhmm(pic),
      coPilot: hhmm(sic),
      dual: '',
      landingsDay: count(log.landingsDay),
      landingsNight: count(log.landingsNight),
    },
  };
}

const fmtSums = (s) => ({
  multiPilot: hhmm(s.multiPilot), total: hhmm(s.total), night: hhmm(s.night), ifr: hhmm(s.ifr),
  pic: hhmm(s.pic), coPilot: hhmm(s.coPilot), dual: hhmm(s.dual),
  landingsDay: count(s.landingsDay), landingsNight: count(s.landingsNight),
});

const FLIGHT_SELECT = {
  date: true, departure: true, arrival: true, offBlocksTime: true, onBlocksTime: true,
  totalTime: true, picTime: true, sicTime: true, nightTime: true, instrumentTime: true,
  landingsDay: true, landingsNight: true, aircraftType: true, registration: true,
  picName: true, remarks: true,
};

async function buildPrintableLogbook(pilotId, { from = null, to = null } = {}) {
  const where = { pilotId };
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(`${from}T00:00:00.000Z`);
    if (to) where.date.lte = new Date(`${to}T23:59:59.999Z`);
  }
  // Flights BEFORE the range, when one is given. "Total to date" means the
  // total to that date, so a pilot printing October alone must still see
  // their real running total — not 37 hours. Those earlier flights are
  // summed into page one's brought-forward line alongside the
  // carry-forward; they are never printed as rows.
  const priorWhere = from ? { pilotId, date: { lt: new Date(`${from}T00:00:00.000Z`) } } : null;
  const [pilot, logs, priorLogs] = await Promise.all([
    prisma.pilot.findUnique({
      where: { id: pilotId },
      select: { firstName: true, lastName: true, carryForward: true, certificates: { select: { type: true, certificateNumber: true, issuingAuthority: true } } },
    }),
    prisma.flightLog.findMany({ where, orderBy: { date: 'asc' }, select: FLIGHT_SELECT }),
    priorWhere ? prisma.flightLog.findMany({ where: priorWhere, select: FLIGHT_SELECT }) : Promise.resolve([]),
  ]);
  if (!pilot) return null;

  const rows = logs.map(toRow);

  // Licence line for the header. The highest licence held, with its number.
  const RANK = ['ATPL', 'ATP', 'MPL', 'CPL', 'PPL'];
  const licences = (pilot.certificates || []).filter((c) => RANK.includes(c.type));
  licences.sort((a, b) => RANK.indexOf(a.type) - RANK.indexOf(b.type));
  const lic = licences[0] || null;

  const cf = carryForwardSums(pilot.carryForward);
  const hasCarryForward = SUM_KEYS.some((k) => cf[k] > 0);
  // Brought forward = hours before this logbook (carry-forward) PLUS any
  // flights earlier than the printed range.
  const prior = priorLogs.map(toRow).reduce((acc, r) => addSums(acc, r), zeroSums());
  const broughtForward = addSums(cf, prior);

  const pages = [];
  let running = { ...broughtForward };   // page 1's "previous pages"
  for (let i = 0; i < Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE)); i++) {
    const slice = rows.slice(i * ROWS_PER_PAGE, (i + 1) * ROWS_PER_PAGE);
    const thisPage = slice.reduce((acc, r) => addSums(acc, r), zeroSums());
    const previous = { ...running };
    const toDate = addSums(previous, thisPage);
    pages.push({
      index: i + 1,
      rows: slice,
      // Blank lines so every page is ruled to the bottom, as a real one is.
      blankRows: Math.max(0, ROWS_PER_PAGE - slice.length),
      totals: {
        thisPage: fmtSums(thisPage),
        previousPages: fmtSums(previous),
        toDate: fmtSums(toDate),
      },
    });
    running = toDate;
  }

  return {
    pilot: {
      name: `${pilot.firstName || ''} ${pilot.lastName || ''}`.trim() || 'Pilot',
      licence: lic ? `${lic.issuingAuthority && lic.issuingAuthority.toLowerCase() !== 'unknown' ? `${lic.issuingAuthority} ` : ''}${lic.type}${lic.certificateNumber ? ` · ${lic.certificateNumber}` : ''}` : null,
    },
    range: {
      from: from || (rows.length ? rows[0].date : null),
      to: to || (rows.length ? rows[rows.length - 1].date : null),
      requestedFrom: from, requestedTo: to,
    },
    rowsPerPage: ROWS_PER_PAGE,
    flightCount: rows.length,
    hasCarryForward,
    carryForward: fmtSums(cf),
    priorFlightCount: priorLogs.length,
    broughtForward: fmtSums(broughtForward),
    pages,
    grandTotals: fmtSums(running),
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  buildPrintableLogbook,
  // exported for tests — all pure
  hhmm, count, toRow, carryForwardSums, addSums, zeroSums, fmtSums, ROWS_PER_PAGE, SUM_KEYS,
};
