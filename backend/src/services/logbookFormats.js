'use strict';
// ── Logbook layouts, one per licensing authority ────────────────────────────
//
// A pilot's logbook has to look like the book their authority expects, and the
// columns differ: an FAA page wants category and class, cross-country and
// approaches; an EASA page wants multi-pilot time and the PIC's name; a
// Canadian page splits single- and multi-engine by day and night.
//
// So the layout is DATA, not code. Each format below is a list of columns;
// `logbookPrint` turns a flight into a row of strings against that list, and
// both clients draw whatever they are handed. One renderer, six layouts, and
// no way for the web PDF and the phone's to drift apart.
//
// Three things deliberately NOT done here:
//
//  1. No format is called official, approved or accepted. Each is
//     "[Authority] layout" — it follows the columns that authority's book
//     uses, which is a different claim from being their form.
//
//  2. A column we have no field for prints BLANK on every row, and is listed
//     in `gaps` so the pilot is told rather than left to wonder. Dual
//     received, instructor time, ICUS, solo and simulator time are all in
//     this group today.
//
//  3. Nothing is inferred that would read as the pilot's own claim. Category
//     and class, and the single/multi-engine split, come from our curated
//     aircraft table and stay blank for a type we do not know, rather than
//     being guessed from the registration or left at a default.

// ── The value catalogue ─────────────────────────────────────────────────────
// Keys a column may point at. `kind` decides the formatting and whether the
// value accumulates into the page totals.
//   text  — printed as-is, never summed
//   time  — hours, printed h:mm, summed
//   count — a whole number, summed
const KINDS = {
  date: 'text', depPlace: 'text', depTime: 'text', arrPlace: 'text', arrTime: 'text',
  type: 'text', reg: 'text', picName: 'text', remarks: 'text',
  catClass: 'text', approaches: 'text',

  total: 'time', multiPilot: 'time', spSE: 'time', spME: 'time',
  day: 'time', night: 'time', ifr: 'time', insActual: 'time', insSim: 'time',
  seDay: 'time', seNight: 'time', meDay: 'time', meNight: 'time',
  xc: 'time', pic: 'time', coPilot: 'time', dual: 'time', instructor: 'time',
  icus: 'time', solo: 'time', fstd: 'time',

  landingsDay: 'count', landingsNight: 'count',
};

/** Every summable key, in a fixed order, so totals are reproducible. */
const SUM_KEYS = Object.keys(KINDS).filter((k) => KINDS[k] !== 'text');

// ── What we cannot fill, and what to add ───────────────────────────────────
// `hard`    — no field exists; the column is blank on every row, always.
// `sparse`  — the field exists but almost nothing writes to it, so the column
//             is only reported as a gap when it is empty across the export.
const GAPS = {
  dual: { hard: true, label: 'Dual received', add: 'FlightLog.dualTime', note: 'we do not record instruction received' },
  instructor: { hard: true, label: 'Instructor', add: 'FlightLog.instructorTime', note: 'we do not record instruction given' },
  icus: { hard: true, label: 'ICUS', add: 'FlightLog.icusTime', note: 'in-command-under-supervision time is not recorded' },
  solo: { hard: true, label: 'Solo', add: 'FlightLog.soloTime', note: 'solo time is not recorded' },
  fstd: { hard: true, label: 'FSTD / simulator', add: 'FlightLog.fstdTime (and a non-flight session type)', note: 'simulator sessions are not logged' },
  insActual: { sparse: true, label: 'Actual instrument', add: 'populate FlightLog.instrumentActualTime on import and manual entry', note: 'the IFR hours we hold are not split into actual and simulated' },
  insSim: { sparse: true, label: 'Simulated instrument', add: 'populate FlightLog.instrumentSimTime on import and manual entry', note: 'the IFR hours we hold are not split into actual and simulated' },
  approaches: { sparse: true, label: 'Approaches', add: 'FlightLog.approachCount (we store one approach type, not a count)', note: 'only scanned sectors carry an approach' },
  catClass: { sparse: true, label: 'Category & class', add: 'FlightLog.category / FlightLog.aircraftClass per flight', note: 'taken from our aircraft table, so it is blank for a type we do not know' },
  xc: { sparse: true, label: 'Cross-country', add: 'populate FlightLog.crossCountryTime on import', note: 'the field exists but imports do not carry it' },
};
// Deliberately NOT gaps: the single-pilot SE and ME columns, and the
// single/multi-engine split. They are derived from the aircraft table and come
// out empty for an airline pilot because that is the truth — an A320 sector is
// not single-pilot time. Telling them we "do not hold it" would be wrong.
// What we genuinely lack there is a recorded operation type per flight, which
// belongs in the handoff notes rather than in a pilot's export dialog.

// ── The layouts ────────────────────────────────────────────────────────────
// `u` is a relative width; the percentages are worked out from them, so a
// column can be adjusted without re-balancing the other seventeen.
const c = (key, label, u, group = null, align = 'center') => ({ key, label, u, group, align });

const FORMATS = {
  easa: {
    id: 'easa',
    label: 'EASA layout',
    title: 'Pilot Flight Log',
    note: 'Columns as used in an EASA Part-FCL logbook.',
    authorities: ['EASA', 'UK CAA', 'ECAA', 'CARC', 'DGAC Morocco'],
    columns: [
      c('date', 'Date', 5.2),
      c('depPlace', 'Place', 4.2, 'Departure'), c('depTime', 'Time', 4.2, 'Departure'),
      c('arrPlace', 'Place', 4.2, 'Arrival'), c('arrTime', 'Time', 4.2, 'Arrival'),
      c('type', 'Type', 5.4, 'Aircraft'), c('reg', 'Reg', 6, 'Aircraft'),
      c('multiPilot', 'Multi-pilot', 5),
      c('total', 'Total', 5),
      c('picName', 'PIC name', 9, null, 'left'),
      c('landingsDay', 'Day', 3.6, 'Landings'), c('landingsNight', 'Night', 3.6, 'Landings'),
      c('night', 'Night', 5, 'Conditions'), c('ifr', 'IFR', 5, 'Conditions'),
      c('pic', 'PIC', 5, 'Pilot function'), c('coPilot', 'Co-pilot', 5, 'Pilot function'), c('dual', 'Dual', 5, 'Pilot function'),
      c('remarks', 'Remarks', 15.4, null, 'left'),
    ],
  },

  faa: {
    id: 'faa',
    label: 'FAA layout',
    title: 'Pilot Flight Log',
    note: 'Columns as described in 14 CFR 61.51.',
    // The one layout that writes the month first, as US logbooks do.
    dateStyle: 'mdy',
    authorities: ['FAA'],
    columns: [
      c('date', 'Date', 5),
      c('type', 'Make & model', 6.4, 'Aircraft'), c('reg', 'Ident', 5.6, 'Aircraft'),
      c('depPlace', 'From', 4.4, 'Route'), c('arrPlace', 'To', 4.4, 'Route'),
      c('catClass', 'Cat / class', 5),
      c('total', 'Total', 4.8),
      c('xc', 'Cross-country', 5.4),
      c('night', 'Night', 4.8),
      c('insActual', 'Actual', 4.8, 'Instrument'), c('insSim', 'Simulated', 5.6, 'Instrument'),
      c('approaches', 'Appr', 4.4),
      c('landingsDay', 'Day', 3.6, 'Landings'), c('landingsNight', 'Night', 3.6, 'Landings'),
      c('dual', 'Dual recd', 5, 'Pilot function'), c('pic', 'PIC', 4.6, 'Pilot function'),
      c('coPilot', 'SIC', 4.6, 'Pilot function'), c('instructor', 'Instructor', 5, 'Pilot function'),
      c('remarks', 'Remarks and endorsements', 13, null, 'left'),
    ],
  },

  icao: {
    id: 'icao',
    label: 'ICAO layout',
    title: 'Pilot Flight Log',
    note: 'Columns as set out in the ICAO Annex 1 model logbook.',
    authorities: ['GCAA', 'GACA', 'QCAA', 'BCAA', 'CAA Oman', 'DGCA Kuwait', 'CAAC'],
    columns: [
      c('date', 'Date', 5),
      c('depPlace', 'Place', 4, 'Departure'), c('depTime', 'Time', 4, 'Departure'),
      c('arrPlace', 'Place', 4, 'Arrival'), c('arrTime', 'Time', 4, 'Arrival'),
      c('type', 'Type', 5, 'Aircraft'), c('reg', 'Reg', 5.4, 'Aircraft'),
      c('spSE', 'SE', 4.2, 'Single-pilot'), c('spME', 'ME', 4.2, 'Single-pilot'),
      c('multiPilot', 'Multi-pilot', 5.4),
      c('total', 'Total', 4.6),
      c('picName', 'PIC name', 7.6, null, 'left'),
      c('landingsDay', 'Day', 3.4, 'Landings'), c('landingsNight', 'Night', 3.4, 'Landings'),
      c('night', 'Night', 4.2, 'Conditions'), c('ifr', 'IFR', 4.2, 'Conditions'),
      c('pic', 'PIC', 4.2, 'Pilot function'), c('coPilot', 'Co-pilot', 4.6, 'Pilot function'),
      c('dual', 'Dual', 4.2, 'Pilot function'), c('instructor', 'Instr', 4.2, 'Pilot function'),
      c('remarks', 'Remarks', 10.2, null, 'left'),
    ],
  },

  tcca: {
    id: 'tcca',
    label: 'Transport Canada layout',
    title: 'Pilot Flight Log',
    note: 'Columns as used in a Transport Canada pilot logbook.',
    authorities: ['TCCA', 'Transport Canada'],
    columns: [
      c('date', 'Date', 5.4),
      c('type', 'Type', 6, 'Aircraft'), c('reg', 'Ident', 6, 'Aircraft'),
      c('depPlace', 'From', 4.6, 'Route'), c('arrPlace', 'To', 4.6, 'Route'),
      c('seDay', 'Day', 4.6, 'Single-engine'), c('seNight', 'Night', 4.6, 'Single-engine'),
      c('meDay', 'Day', 4.6, 'Multi-engine'), c('meNight', 'Night', 4.6, 'Multi-engine'),
      c('xc', 'Cross-country', 5.4),
      c('insActual', 'Actual', 4.8, 'Instrument'), c('insSim', 'Simulated', 4.8, 'Instrument'),
      c('dual', 'Dual', 4.6, 'Pilot function'), c('pic', 'PIC', 4.6, 'Pilot function'),
      c('coPilot', 'Co-pilot', 4.8, 'Pilot function'), c('instructor', 'Instructor', 5, 'Pilot function'),
      c('total', 'Total', 5),
      c('remarks', 'Remarks', 15, null, 'left'),
    ],
  },

  casa: {
    id: 'casa',
    label: 'CASA layout',
    title: 'Pilot Flight Log',
    note: 'Columns as used in an Australian (CASA) pilot logbook.',
    authorities: ['CASA'],
    columns: [
      c('date', 'Date', 5.4),
      c('type', 'Type', 6.2, 'Aircraft'), c('reg', 'Reg', 6, 'Aircraft'),
      c('depPlace', 'From', 4.8, 'Route'), c('arrPlace', 'To', 4.8, 'Route'),
      c('picName', 'PIC name', 8.4, null, 'left'),
      c('day', 'Day', 5, 'Conditions'), c('night', 'Night', 5, 'Conditions'),
      c('insActual', 'Actual', 5, 'Instrument'), c('insSim', 'Simulated', 5, 'Instrument'),
      c('dual', 'Dual', 4.8, 'Pilot function'), c('pic', 'Command', 5.4, 'Pilot function'),
      c('icus', 'ICUS', 4.8, 'Pilot function'), c('coPilot', 'Co-pilot', 5, 'Pilot function'),
      c('total', 'Total', 5.2),
      c('remarks', 'Remarks', 14.2, null, 'left'),
    ],
  },

  dgca: {
    id: 'dgca',
    label: 'DGCA India layout',
    title: 'Pilot Flight Log',
    note: 'Columns as used in a DGCA India pilot logbook.',
    authorities: ['DGCA India'],
    columns: [
      c('date', 'Date', 5),
      c('type', 'Type', 5.4, 'Aircraft'), c('reg', 'Reg', 5.6, 'Aircraft'),
      c('depPlace', 'Place', 4.2, 'Departure'), c('depTime', 'Time', 4.2, 'Departure'),
      c('arrPlace', 'Place', 4.2, 'Arrival'), c('arrTime', 'Time', 4.2, 'Arrival'),
      c('total', 'Total', 4.8),
      c('day', 'Day', 4.4, 'Conditions'), c('night', 'Night', 4.4, 'Conditions'),
      c('insActual', 'Actual', 4.6, 'Instrument'), c('insSim', 'Simulated', 4.6, 'Instrument'),
      c('pic', 'PIC', 4.4, 'Pilot function'), c('coPilot', 'Co-pilot', 4.8, 'Pilot function'),
      c('dual', 'Dual', 4.4, 'Pilot function'), c('instructor', 'Instr', 4.4, 'Pilot function'),
      c('landingsDay', 'Day', 3.4, 'Landings'), c('landingsNight', 'Night', 3.4, 'Landings'),
      c('picName', 'PIC name', 8, null, 'left'),
      c('remarks', 'Remarks', 11.6, null, 'left'),
    ],
  },
};

const FORMAT_IDS = Object.keys(FORMATS);
const DEFAULT_FORMAT = 'icao';

/**
 * Which layout suits a licence authority.
 *
 * The authorities we offer in the profile are matched by name; anything we do
 * not recognise falls back to the ICAO layout, which every contracting state's
 * book is derived from. That is a safer default than EASA: it is the common
 * ancestor rather than one region's dialect.
 */
function formatForAuthority(authority) {
  const s = String(authority || '').toLowerCase().trim();
  if (!s || s === 'unknown' || s === 'other') return DEFAULT_FORMAT;
  // India before the bare "DGCA" of Kuwait, and Canada before any "CAA".
  if (/dgca\s*india|\bindia\b/.test(s)) return 'dgca';
  if (/\bfaa\b|federal aviation/.test(s)) return 'faa';
  if (/\btcca\b|transport canada|\bcanada\b/.test(s)) return 'tcca';
  if (/\bcasa\b|australia/.test(s)) return 'casa';
  if (/\beasa\b|uk caa|\bukcaa\b|\becaa\b|egypt|\bcarc\b|jordan|dgac morocco|morocco/.test(s)) return 'easa';
  return DEFAULT_FORMAT;
}

/** The highest-ranked licence decides the default, not whichever came first. */
const LICENCE_RANK = ['ATPL', 'ATP', 'MPL', 'CPL', 'PPL'];
function defaultFormatFor(certificates) {
  const licences = (certificates || []).filter((x) => LICENCE_RANK.includes(x.type));
  licences.sort((a, b) => LICENCE_RANK.indexOf(a.type) - LICENCE_RANK.indexOf(b.type));
  for (const l of licences) {
    const f = formatForAuthority(l.issuingAuthority);
    if (f !== DEFAULT_FORMAT) return f;
  }
  return licences.length ? DEFAULT_FORMAT : DEFAULT_FORMAT;
}

function getFormat(id) {
  const key = String(id || '').toLowerCase();
  return FORMATS[key] || null;
}

/** Percentage widths from the relative units, with the rounding absorbed. */
function widths(format) {
  const total = format.columns.reduce((a, col) => a + col.u, 0);
  const pct = format.columns.map((col) => Math.round((col.u / total) * 10000) / 100);
  const drift = Math.round((100 - pct.reduce((a, b) => a + b, 0)) * 100) / 100;
  pct[pct.length - 1] = Math.round((pct[pct.length - 1] + drift) * 100) / 100;
  return pct;
}

/**
 * The two header rows. A column with no group spans both (`rowspan`), which
 * the HTML renderer uses directly; the PDF, which has no rowspan, draws a
 * blank spacer of the same width underneath.
 */
function header(format) {
  const w = widths(format);
  const top = [];
  const sub = [];
  format.columns.forEach((col, i) => {
    if (!col.group) {
      // Spans both header rows; the sub row gets a spacer the table markup
      // leaves out (the rowspan already covers that slot) and the PDF draws
      // blank (it has no rowspan).
      top.push({ label: col.label, w: w[i], rowspan: 2, span: 1 });
      sub.push({ label: '', w: w[i], spacer: true });
      return;
    }
    const prev = top[top.length - 1];
    if (prev && prev.group === col.group) {
      prev.w = Math.round((prev.w + w[i]) * 100) / 100;
      prev.span += 1;
    } else {
      top.push({ label: col.group, group: col.group, w: w[i], rowspan: 1, span: 1 });
    }
    sub.push({ label: col.label, w: w[i] });
  });
  return { top, sub };
}

/** The columns whose values add up, as `{ key, index }` against the layout. */
const summable = (format) => format.columns
  .map((col, i) => ({ key: col.key, index: i, kind: KINDS[col.key] }))
  .filter((x) => x.kind !== 'text');

/** How many leading columns the totals label is allowed to run across. */
function labelSpan(format) {
  const first = summable(format)[0];
  return first ? first.index : format.columns.length;
}

/**
 * A short public list for the format picker, with the columns this layout
 * asks for that we hold no field for. Those are known before a single flight
 * is read, so the picker can say so while the pilot is still choosing.
 */
const formatList = () => FORMAT_IDS.map((id) => ({
  id,
  label: FORMATS[id].label,
  note: FORMATS[id].note,
  missing: FORMATS[id].columns
    .filter((col) => GAPS[col.key] && GAPS[col.key].hard)
    .map((col) => GAPS[col.key].label),
}));

module.exports = {
  FORMATS, FORMAT_IDS, DEFAULT_FORMAT, KINDS, SUM_KEYS, GAPS, LICENCE_RANK,
  getFormat, formatForAuthority, defaultFormatFor, widths, header, summable, labelSpan, formatList,
};
