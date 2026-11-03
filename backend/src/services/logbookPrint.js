'use strict';
// ── Printable logbook ───────────────────────────────────────────────────────
//
// The pilot picks the layout their authority's book uses (see
// services/logbookFormats); this file turns their flights into rows against
// that layout, paginates them and works out the three totals lines.
//
// All of that happens HERE, not in the two clients, so the PDF a pilot
// downloads on the web and the one they share from the phone are the same
// document — same rows on the same pages, same figures in the totals block,
// whichever layout they chose.
//
// Four decisions, written down because nobody was available to ask:
//
//  1. This is a PERSONAL DOCUMENT, so the PIC name column is filled where the
//     layout has one. The no-crew-names rule covers reports and share cards,
//     which get posted; a logbook page is signed by its holder and shown to an
//     authority.
//
//  2. A MISSING VALUE IS BLANK, never 0. A logbook column left empty means
//     "not applicable or not recorded"; a nought means "none, and we checked".
//     Only the total time column is always printed, because a sector with no
//     duration should not be in a logbook at all.
//
//  3. CARRY-FORWARD goes into "previous pages" on page one, which is exactly
//     what the brought-forward line is for: hours flown before this book.
//
//  4. IFR HOURS ARE NOT SPLIT into actual and simulated instrument. We hold
//     one instrument figure, and under FAA rules "actual instrument" means
//     time in cloud — not the same thing as IFR time at all. Putting ours in
//     that column would be a claim about the pilot's flying we cannot make,
//     so both columns stay blank and the gap is reported instead.
//
// Hours print as h:mm. That is what the form expects and what the rest of the
// product now shows everywhere.
const prisma = require('../config/database');
const { _internals } = require('./logbookSummary');
const formats = require('./logbookFormats');

const { blockHours, resolveType, classForType } = _internals;
const { KINDS, SUM_KEYS, GAPS } = formats;

// What fits an A4 landscape sheet at a readable size once the header, the
// three totals lines and the footer have taken their share. Measured from a
// rendered page rather than guessed: at 14 the sheet was half empty, which is
// not what a logbook page looks like and costs 37 pages where 17 will do. The
// same for every layout, because the row height does not change with the
// column count — so page breaks are reproducible across layouts too.
const ROWS_PER_PAGE = 32;

/**
 * Hours as h:mm — "1592:24", never "1592.4". Blank for nothing.
 *
 * Rounded to the minute BEFORE deciding whether there is anything to print.
 * A derived column (day hours are total minus night) can land on twelve
 * seconds of floating-point dust, and "0:00" in a logbook reads as a claim
 * that the sector had no day flying at all.
 */
function hhmm(hours) {
  if (hours == null || !Number.isFinite(Number(hours)) || Number(hours) <= 0) return '';
  const total = Math.round(Number(hours) * 60);
  if (total <= 0) return '';
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** A count, blank when there is nothing to say. */
const count = (n) => (Number(n) > 0 ? String(Number(n)) : '');

/** Format by the column's kind, so a renderer never has to decide. */
const fmtValue = (key, v) => (KINDS[key] === 'count' ? count(v) : hhmm(v));

const zeroSums = () => Object.fromEntries(SUM_KEYS.map((k) => [k, 0]));
const addSums = (a, b) => Object.fromEntries(SUM_KEYS.map((k) => [k, (a[k] || 0) + (b[k] || 0)]));
/** A row's own figures live under `n`, so adding one is explicit. */
const addRow = (sums, row) => addSums(sums, row.n);
const fmtSums = (s) => Object.fromEntries(SUM_KEYS.map((k) => [k, fmtValue(k, s[k])]));

/**
 * Carry-forward, mapped onto the totals columns. Absent keys stay zero.
 *
 * The carried blob holds totals, not a breakdown: it can say how many hours
 * were PIC and how many were at night, but not how many were multi-pilot, on
 * a twin, or dual. Those columns start at nothing rather than at a guess.
 */
function carryForwardSums(cf) {
  const src = cf || {};
  const has = (k) => Number.isFinite(Number(src[k])) && Number(src[k]) > 0;
  const n = (k) => (Number.isFinite(Number(src[k])) ? Number(src[k]) : 0);
  const out = zeroSums();
  out.total = n('totalTime');
  out.night = n('nightTime');
  out.ifr = n('instrumentTime');
  out.pic = n('picTime');
  out.coPilot = n('sicTime');
  out.xc = n('crossCountryTime');
  out.landingsDay = n('landingsDay');
  out.landingsNight = n('landingsNight');
  // Day hours are only knowable when night hours were carried too; without
  // them, "all of it was day" is a guess.
  out.day = has('nightTime') ? Math.max(0, n('totalTime') - n('nightTime')) : 0;
  return out;
}

/**
 * One flight, as every column a layout might ask for.
 *
 * The derived splits — multi-pilot, single-pilot SE/ME, single/multi-engine
 * day and night, category and class — come from our curated aircraft table
 * (logbookSummary's TYPE_CLASS). For a type we do not know they all stay
 * blank: the total time is still right, and nothing is claimed that the data
 * cannot support.
 */
function toRow(log) {
  const hours = blockHours(log);
  const { type } = resolveType(log);
  const cls = classForType(type);
  const pic = Number(log.picTime) || 0;
  const sic = Number(log.sicTime) || 0;
  // null = we have no idea, which is different from false.
  const multiEngine = cls ? !!cls.multi : null;
  // Multi-pilot operation: a multi-engine turbine is crewed by two. A twin
  // piston or a single is not, so its hours are single-pilot time instead.
  const multiPilotOp = cls ? !!(cls.multi && cls.turbine) : null;
  // Night is nullable on purpose — "no resolvable airport" is not zero — so
  // day hours are only known when night hours are.
  const nightRaw = log.nightTime;
  const night = Number(nightRaw) || 0;
  const day = nightRaw == null ? 0 : Math.max(0, hours - night);

  const n = zeroSums();
  n.total = hours;
  n.multiPilot = multiPilotOp === true ? hours : 0;
  n.spSE = multiPilotOp === false && multiEngine === false ? hours : 0;
  n.spME = multiPilotOp === false && multiEngine === true ? hours : 0;
  n.day = day;
  n.night = night;
  n.ifr = Number(log.instrumentTime) || 0;
  // Never derived from the IFR figure — see decision 4 at the top.
  n.insActual = Number(log.instrumentActualTime) || 0;
  n.insSim = Number(log.instrumentSimTime) || 0;
  n.seDay = multiEngine === false ? day : 0;
  n.seNight = multiEngine === false ? night : 0;
  n.meDay = multiEngine === true ? day : 0;
  n.meNight = multiEngine === true ? night : 0;
  n.xc = Number(log.crossCountryTime) || 0;
  n.pic = pic;
  n.coPilot = sic;
  n.landingsDay = Number(log.landingsDay) || 0;
  n.landingsNight = Number(log.landingsNight) || 0;
  // dual, instructor, icus, solo and fstd have no field yet: they stay at zero
  // and so print blank. Listed in the export's `gaps`, never invented.

  return {
    date: log.date.toISOString().slice(0, 10),
    depPlace: log.departure || '',
    depTime: log.offBlocksTime || '',
    arrPlace: log.arrival || '',
    arrTime: log.onBlocksTime || '',
    type: type || log.aircraftType || '',
    reg: log.registration || '',
    registration: log.registration || '',
    picName: log.picName || '',
    remarks: log.remarks || '',
    catClass: cls ? (cls.multi ? 'AMEL' : 'ASEL') : '',
    // We store the approach flown, not how many were flown, so the column
    // carries the type rather than a count it cannot support.
    approaches: log.approach ? String(log.approach).toUpperCase() : '',
    n,
    // Pre-formatted so both clients print identical strings.
    f: fmtSums(n),
  };
}

/**
 * A date the way the layout's own book writes it: day first everywhere except
 * the FAA layout, which puts the month first as US logbooks do. Two digits
 * for the year, as a logbook column is written and narrow enough to hold.
 */
function dateFor(format, iso) {
  const [y, m, d] = String(iso).split('-');
  return format.dateStyle === 'mdy' ? `${m}/${d}/${y.slice(2)}` : `${d}/${m}/${y.slice(2)}`;
}

/** A row of strings against a layout's columns, ready to draw. */
const cellsFor = (format, row) => format.columns.map((col) => {
  if (col.key === 'date') return dateFor(format, row.date);
  return KINDS[col.key] === 'text' ? String(row[col.key] ?? '') : row.f[col.key];
});

/** A totals line: the cells from the label's span onward. */
const totalsCells = (format, sums) => format.columns
  .slice(formats.labelSpan(format))
  .map((col) => (KINDS[col.key] === 'text' ? '' : fmtValue(col.key, sums[col.key])));

const FLIGHT_SELECT = {
  date: true, departure: true, arrival: true, offBlocksTime: true, onBlocksTime: true,
  totalTime: true, picTime: true, sicTime: true, nightTime: true, instrumentTime: true,
  instrumentActualTime: true, instrumentSimTime: true, crossCountryTime: true,
  landingsDay: true, landingsNight: true, aircraftType: true, registration: true,
  picName: true, remarks: true, approach: true,
};

/**
 * Which of this layout's columns we could not fill, and what to add.
 *
 * A column with no field behind it is always reported. A column whose field
 * exists but is rarely written is only reported when it came out empty across
 * this export — a pilot who does record cross-country hours should not be
 * told we cannot.
 */
function gapsFor(format, rows) {
  const out = [];
  for (const col of format.columns) {
    const gap = GAPS[col.key];
    if (!gap) continue;
    if (gap.sparse) {
      const anyValue = rows.some((r) => (
        KINDS[col.key] === 'text' ? !!r[col.key] : (r.n[col.key] || 0) > 0
      ));
      if (anyValue) continue;
    }
    out.push({
      key: col.key,
      label: gap.label,
      column: col.group ? `${col.group} · ${col.label}` : col.label,
      note: gap.note,
      add: gap.add,
      kind: gap.hard ? 'missing' : 'unrecorded',
    });
  }
  return out;
}

async function buildPrintableLogbook(pilotId, { from = null, to = null, format: wanted = null } = {}) {
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

  const certs = pilot.certificates || [];
  // The pilot's choice wins; otherwise their licence authority decides.
  const suggested = formats.defaultFormatFor(certs);
  const format = formats.getFormat(wanted) || formats.getFormat(suggested);

  const rows = logs.map(toRow);

  // Licence line for the header. The highest licence held, with its number.
  const licences = certs.filter((x) => formats.LICENCE_RANK.includes(x.type));
  licences.sort((a, b) => formats.LICENCE_RANK.indexOf(a.type) - formats.LICENCE_RANK.indexOf(b.type));
  const lic = licences[0] || null;

  const cf = carryForwardSums(pilot.carryForward);
  const hasCarryForward = SUM_KEYS.some((k) => cf[k] > 0);
  // Brought forward = hours before this logbook (carry-forward) PLUS any
  // flights earlier than the printed range.
  const prior = priorLogs.map(toRow).reduce(addRow, zeroSums());
  const broughtForward = addSums(cf, prior);

  const pages = [];
  let running = { ...broughtForward };   // page 1's "previous pages"
  for (let i = 0; i < Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE)); i++) {
    const slice = rows.slice(i * ROWS_PER_PAGE, (i + 1) * ROWS_PER_PAGE);
    const thisPage = slice.reduce(addRow, zeroSums());
    const previous = { ...running };
    const toDate = addSums(previous, thisPage);
    pages.push({
      index: i + 1,
      rows: slice,
      // The same rows as strings against the chosen layout.
      cells: slice.map((r) => cellsFor(format, r)),
      // Blank lines so every page is ruled to the bottom, as a real one is.
      blankRows: Math.max(0, ROWS_PER_PAGE - slice.length),
      totals: {
        thisPage: fmtSums(thisPage),
        previousPages: fmtSums(previous),
        toDate: fmtSums(toDate),
      },
      // Drawable form: a merged label, then one cell per remaining column.
      totalsLines: [
        { label: 'This page', cells: totalsCells(format, thisPage) },
        { label: 'Previous pages', cells: totalsCells(format, previous) },
        { label: 'Total to date', cells: totalsCells(format, toDate), bold: true },
      ],
    });
    running = toDate;
  }

  return {
    pilot: {
      name: `${pilot.firstName || ''} ${pilot.lastName || ''}`.trim() || 'Pilot',
      licence: lic ? `${lic.issuingAuthority && lic.issuingAuthority.toLowerCase() !== 'unknown' ? `${lic.issuingAuthority} ` : ''}${lic.type}${lic.certificateNumber ? ` · ${lic.certificateNumber}` : ''}` : null,
    },
    // Everything a renderer needs to draw this layout, and nothing about how.
    format: {
      id: format.id,
      label: format.label,
      title: format.title,
      note: format.note,
      columns: format.columns.map((col, i) => ({
        key: col.key, label: col.label, group: col.group,
        w: formats.widths(format)[i], align: col.align, kind: KINDS[col.key],
      })),
      header: formats.header(format),
      labelSpan: formats.labelSpan(format),
      labelWidth: formats.widths(format).slice(0, formats.labelSpan(format)).reduce((a, b) => a + b, 0),
    },
    formats: formats.formatList(),
    suggestedFormat: suggested,
    gaps: gapsFor(format, rows),
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
  hhmm, count, toRow, carryForwardSums, addSums, addRow, zeroSums, fmtSums, cellsFor, totalsCells,
  gapsFor, dateFor, ROWS_PER_PAGE, SUM_KEYS,
};
