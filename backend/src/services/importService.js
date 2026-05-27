const { parse } = require('csv-parse/sync');

// ─── Field synonym dictionary ────────────────────────────────────────────────
// Each key is a FlightLog field name; value is an array of normalized header
// synonyms (lowercase, alphanumeric only).

const FIELD_SYNONYMS = {
  date:            ['date','flightdate','fltdate','departuredate','depdate','flightday'],
  flightNumber:    ['flightno','flightnum','fltno','flt','flight','flightident','fltident','flightnumber','flightno'],
  aircraftType:    ['aircrafttype','actype','aircraft','type','acicao','acmodel'],
  registration:    ['registration','reg','tail','tailnumber','tailno','acreg','tailreg'],
  departure:       ['departure','dep','from','origin','departureicao','fromapt','departureiata','depapt'],
  arrival:         ['arrival','arr','to','dest','destination','arrivalicao','toapt','arrivaliata','arrapt'],
  offBlocksTime:   ['offblocks','offblock','atd','out','blockout','blkout','deptime','offtime','off','stdactual'],
  onBlocksTime:    ['onblocks','onblock','ata','in','blockin','blkin','arrtime','intime','staactual'],
  takeoffTime:     ['takeoff','tof','liftoff','atot','takeofftime','wheelsoff','to'],
  landingTime:     ['landing','ldg','touchdown','aldt','landingtime','wheelson','ldgtime'],
  picName:         ['captain','captainname','pic','pilotincommand','capt','p1','captname'],
  sicName:         ['sic','firstofficer','fo','copilot','secondincommand','f0','p2','firstofficername'],
  picTime:         ['pictime','pichours','commandtime','pichr','p1time','capttime'],
  sicTime:         ['sictime','sichours','copilottime','sichr','p2time','fotime'],
  totalTime:       ['totaltime','blocktime','blktime','duration','ttltime','ttime','total','ttl','blockhours'],
  nightTime:       ['nighttime','night','nighthours','nighthr','nightflight'],
  instrumentTime:  ['instrumenttime','ifrtime','ifrhours','instrtime','ifr','instrument'],
  multiEngineTime: ['multiengine','metime','mehours','multieng','me'],
  turbineTime:     ['turbinetime','turbinehours','jet','jethours','turbine'],
  landingsDay:     ['ldgday','dayldg','daylandings','landingsday','ldgsday','dayldgs'],
  landingsNight:   ['ldgnight','nightldg','nightlandings','landingsnight','ldgsnight','nightldgs'],
  remarks:         ['remarks','notes','comments','comment','remark','note'],
};

// Normalize a raw header string for matching
function normalizeHeader(h) {
  return String(h ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Auto-detect fieldName→headerName mapping from raw column headers
function detectMapping(headers) {
  const mapping = {};
  const usedHeaders = new Set();

  for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS)) {
    for (const header of headers) {
      const norm = normalizeHeader(header);
      if (!usedHeaders.has(header) && synonyms.includes(norm)) {
        mapping[field] = header;
        usedHeaders.add(header);
        break;
      }
    }
  }
  return mapping;
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

// Parse a date string in multiple formats → ISO string (midnight UTC) or null
function parseFlexDate(str) {
  if (!str) return null;
  str = String(str).trim();
  if (!str) return null;

  // YYYY-MM-DD (ISO)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str.slice(0, 10) + 'T00:00:00Z');
    return isNaN(d) ? null : d.toISOString();
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmy) {
    const [, dd, mm, yy] = dmy;
    const year = yy.length === 2 ? 2000 + parseInt(yy) : parseInt(yy);
    const d = new Date(`${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00Z`);
    if (!isNaN(d) && d.getUTCMonth() + 1 === parseInt(mm)) return d.toISOString();
    // If DD/MM failed (day > 12 indicates it's actually MM/DD), try swapping
    const d2 = new Date(`${year}-${dd.padStart(2, '0')}-${mm.padStart(2, '0')}T00:00:00Z`);
    return isNaN(d2) ? null : d2.toISOString();
  }

  // DD-MMM-YYYY (e.g. 15-Jan-2025) or DD MMM YYYY or DD/MMM/YYYY
  const dmonthy = str.match(/^(\d{1,2})[\s\/\-]([A-Za-z]{3})[\s\/\-](\d{2,4})$/);
  if (dmonthy) {
    const [, dd, mon, yy] = dmonthy;
    const year = yy.length === 2 ? 2000 + parseInt(yy) : parseInt(yy);
    const d = new Date(`${dd} ${mon} ${year} 00:00:00 UTC`);
    return isNaN(d) ? null : d.toISOString();
  }

  // Excel serial number (e.g. 45123 → days since 1900-01-00)
  if (/^\d{4,5}$/.test(str)) {
    const serial = parseInt(str);
    if (serial > 40000 && serial < 55000) {
      // Excel epoch offset: 25569 days between 1900-01-01 and 1970-01-01
      const d = new Date((serial - 25569) * 86400 * 1000);
      return isNaN(d) ? null : d.toISOString();
    }
  }

  return null;
}

// Parse a time string → HH:MM 24h or null
function parseFlexTime(str) {
  if (!str) return null;
  str = String(str).trim();
  if (!str) return null;

  // HH:MM or H:MM
  const hm = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hm) {
    const h = parseInt(hm[1]), m = parseInt(hm[2]);
    if (h > 23 || m > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // H:MM AM/PM
  const ampm = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/i);
  if (ampm) {
    let h = parseInt(ampm[1]);
    const m = parseInt(ampm[2]);
    const isPM = ampm[3].toUpperCase() === 'PM';
    if (isPM && h !== 12) h += 12;
    if (!isPM && h === 12) h = 0;
    if (h > 23 || m > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Excel decimal fraction of a day (0.375 = 09:00)
  if (/^0\.\d+$/.test(str)) {
    const frac = parseFloat(str);
    const totalMins = Math.round(frac * 1440);
    const h = Math.floor(totalMins / 60) % 24;
    const m = totalMins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // HHMM (4-digit no colon)
  if (/^\d{4}$/.test(str)) {
    const h = parseInt(str.slice(0, 2)), m = parseInt(str.slice(2));
    if (h <= 23 && m <= 59) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  return null;
}

// Parse a duration → decimal hours (float) or null
function parseDecimalHours(str) {
  if (!str) return null;
  str = String(str).trim();
  if (!str) return null;

  // Pure decimal: 1.5 or 1
  if (/^\d+(\.\d+)?$/.test(str)) {
    const v = parseFloat(str);
    return isNaN(v) ? null : v;
  }

  // HH:MM
  const hm = str.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) return parseInt(hm[1]) + parseInt(hm[2]) / 60;

  return null;
}

// ─── Row coercion / validation ────────────────────────────────────────────────

// Convert raw string fields (after mapping) into typed FlightLog-shaped payload.
// Returns { coerced, errors: string[] }
function coerceRow(fields) {
  const errors = [];

  const dateISO = parseFlexDate(fields.date);
  if (!fields.date || !String(fields.date).trim()) {
    errors.push('Missing date');
  } else if (!dateISO) {
    errors.push(`Invalid date: "${fields.date}"`);
  }

  const offBlocksTime = fields.offBlocksTime ? parseFlexTime(fields.offBlocksTime) : null;
  const onBlocksTime  = fields.onBlocksTime  ? parseFlexTime(fields.onBlocksTime)  : null;
  const takeoffTime   = fields.takeoffTime   ? parseFlexTime(fields.takeoffTime)   : null;
  const landingTime   = fields.landingTime   ? parseFlexTime(fields.landingTime)   : null;

  if (fields.offBlocksTime && !offBlocksTime)
    errors.push(`Invalid off-blocks time: "${fields.offBlocksTime}"`);
  if (fields.onBlocksTime && !onBlocksTime)
    errors.push(`Invalid on-blocks time: "${fields.onBlocksTime}"`);

  // Compute totalTime from block times if available; fall back to a parsed total column
  let totalTime = 0;
  if (offBlocksTime && onBlocksTime) {
    const [oh, om] = offBlocksTime.split(':').map(Number);
    const [nh, nm] = onBlocksTime.split(':').map(Number);
    const diff = nh * 60 + nm >= oh * 60 + om
      ? nh * 60 + nm - (oh * 60 + om)
      : 1440 - (oh * 60 + om) + nh * 60 + nm;
    totalTime = parseFloat((diff / 60).toFixed(2));
  } else if (fields.totalTime) {
    totalTime = parseDecimalHours(fields.totalTime) ?? 0;
  }

  const pf = (v) => parseDecimalHours(v) ?? 0;
  const pi = (v) => { const n = parseInt(v); return isNaN(n) ? 0 : Math.max(0, n); };
  const up = (v) => (v || '').toString().trim().toUpperCase() || null;
  const tr = (v) => (v || '').toString().trim() || null;

  const coerced = {
    date:            dateISO,
    flightNumber:    up(fields.flightNumber),
    aircraftType:    up(fields.aircraftType) || '',
    registration:    up(fields.registration),
    departure:       up(fields.departure),
    arrival:         up(fields.arrival),
    offBlocksTime,
    takeoffTime,
    landingTime,
    onBlocksTime,
    picName:         tr(fields.picName),
    sicName:         tr(fields.sicName),
    totalTime,
    picTime:         pf(fields.picTime),
    sicTime:         pf(fields.sicTime),
    multiEngineTime: pf(fields.multiEngineTime),
    turbineTime:     pf(fields.turbineTime),
    instrumentTime:  pf(fields.instrumentTime),
    nightTime:       pf(fields.nightTime),
    landingsDay:     pi(fields.landingsDay),
    landingsNight:   pi(fields.landingsNight),
    remarks:         tr(fields.remarks),
  };

  return { coerced, errors };
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCSV(buffer) {
  const text = buffer.toString('utf-8').replace(/^﻿/, ''); // strip UTF-8 BOM

  let records;
  try {
    records = parse(text, {
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
    });
  } catch (e) {
    throw new Error(`Could not parse CSV: ${e.message}`);
  }

  if (!records || records.length === 0) return { headers: [], rawRows: [] };

  const headers = records[0].map(h => String(h ?? '').trim()).filter(Boolean);
  if (headers.length === 0) return { headers: [], rawRows: [] };

  const rawRows = records
    .slice(1)
    .map(row => row.map(cell => String(cell ?? '').trim()))
    .filter(row => row.some(cell => cell !== ''));

  return { headers, rawRows };
}

// Extract key fields from rawRows using a given mapping — used for duplicate detection
function extractKeyFields(rawRows, headers, mapping) {
  const headerIdx = {};
  headers.forEach((h, i) => { headerIdx[h] = i; });

  const get = (raw, field) => {
    const header = mapping[field];
    if (!header || headerIdx[header] === undefined) return null;
    const v = (raw[headerIdx[header]] ?? '').toString().trim();
    return v || null;
  };

  return rawRows.map(raw => ({
    date:         parseFlexDate(get(raw, 'date')),
    flightNumber: (get(raw, 'flightNumber') || '').toUpperCase().replace(/\s/g, '') || null,
    departure:    (get(raw, 'departure')    || '').toUpperCase() || null,
    arrival:      (get(raw, 'arrival')      || '').toUpperCase() || null,
  }));
}

module.exports = {
  detectMapping,
  parseCSV,
  coerceRow,
  parseFlexDate,
  parseFlexTime,
  extractKeyFields,
  FIELD_SYNONYMS,
};
