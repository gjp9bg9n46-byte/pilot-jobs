const { parse } = require('csv-parse/sync');

// ─── Field synonym dictionary ────────────────────────────────────────────────
// Each key is a FlightLog field name; value is an array of normalized header
// synonyms (lowercase, alphanumeric only).

const FIELD_SYNONYMS = {
  date:            ['date','flightdate','fltdate','departuredate','depdate','flightday'],
  flightNumber:    ['flightno','flightnum','fltno','flt','flight','flightident','fltident','flightnumber','fltid','flightid'],
  aircraftType:    ['aircrafttype','actype','aircraft','type','acicao','acmodel'],
  registration:    ['registration','reg','tail','tailnumber','tailno','acreg','tailreg','ac'],
  departure:       ['departure','dep','from','origin','departureicao','fromapt','departureiata','depapt'],
  arrival:         ['arrival','arr','to','dest','destination','arrivalicao','toapt','arrivaliata','arrapt'],
  offBlocksTime:   ['offblocks','offblock','atd','out','blockout','blkout','deptime','offtime','off','blockoff','stdactual'],
  onBlocksTime:    ['onblocks','onblock','ata','in','blockin','blkin','arrtime','intime','on','blockon','staactual'],
  takeoffTime:     ['takeoff','tof','liftoff','atot','takeofftime','wheelsoff','to'],
  landingTime:     ['landing','ldg','touchdown','aldt','landingtime','wheelson','ldgtime'],
  picName:         ['captain','captainname','pic','pilotincommand','capt','p1','captname'],
  sicName:         ['sic','firstofficer','fo','copilot','secondincommand','f0','p2','firstofficername'],
  picTime:         ['pictime','pichours','commandtime','pichr','p1time','capttime'],
  sicTime:         ['sictime','sichours','copilottime','sichr','p2time','fotime'],
  totalTime:       ['totaltime','blocktime','blktime','duration','ttltime','ttime','total','ttl','blockhours','augblhr','blhr','totalblock'],
  nightTime:       ['nighttime','night','nighthours','nighthr','nighthrs','ntime','nightflight'],
  instrumentTime:       ['instrumenttime','ifrtime','ifrhours','instrtime','ifr','instrument'],
  instrumentActualTime: ['ifractual','actualifr','instrumentactual','ifrActualTime','actualinstrument','imcactual','imctime','imchours','instrActual'],
  instrumentSimTime:    ['ifrsim','simifr','instrumentsim','ifrSimTime','siminstrument','simifrhours','siminstrhours','instrSim'],
  crossCountryTime:     ['crosscountry','crosscountrytime','xc','xchours','xctime','xcountry'],
  multiEngineTime:      ['multiengine','metime','mehours','multieng','me'],
  turbineTime:          ['turbinetime','turbinehours','turbine'],
  jetTime:              ['jettime','jethours','jet'],
  landingsDay:     ['ldgday','dayldg','daylandings','landingsday','ldgsday','dayldgs'],
  landingsNight:   ['ldgnight','nightldg','nightlandings','landingsnight','ldgsnight','nightldgs'],
  remarks:         ['remarks','notes','comments','comment','remark','note','augmentation'],
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
  if (str == null) return null;
  str = String(str).trim();
  if (!str) return null;

  // Pure decimal: 1.5 or 1
  if (/^\d+(\.\d+)?$/.test(str)) {
    const v = parseFloat(str);
    return isNaN(v) ? null : v;
  }

  // HH:MM or HH:MM:SS or H:MM (crew rosters give block/night as "2:37") → decimal hours
  const hm = str.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (hm) return parseInt(hm[1]) + parseInt(hm[2]) / 60 + (hm[3] ? parseInt(hm[3]) / 3600 : 0);

  return null;
}

// Explicit named helper for HH:MM → decimal hours, e.g. "2:37" → 2.6166…
// (Block / Day / Night columns in crew rosters arrive as clock strings.)
function parseTimeToHours(str) {
  return parseDecimalHours(str);
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
    multiEngineTime:      pf(fields.multiEngineTime),
    turbineTime:          pf(fields.turbineTime),
    jetTime:              pf(fields.jetTime),
    instrumentTime:       pf(fields.instrumentTime),
    instrumentActualTime: pf(fields.instrumentActualTime),
    instrumentSimTime:    pf(fields.instrumentSimTime),
    crossCountryTime:     pf(fields.crossCountryTime),
    nightTime:            pf(fields.nightTime),
    landingsDay:     pi(fields.landingsDay),
    landingsNight:   pi(fields.landingsNight),
    remarks:         tr(fields.remarks),
  };

  return { coerced, errors };
}

// ─── Title / metadata row stripping ───────────────────────────────────────────
// Crew-schedule exports often carry a title band above the real header row — a
// merged "Period: 01Feb24 - 30May26" cell, a blank line, etc. SheetJS/CSV then
// mistakes that band for the header, turning the real headers (Start/Finish/
// CrewCode…) into data rows and breaking auto-detection. Strip the leading band
// so the real header row leads.

// A single date token (DDMonYY, DD/MM/YY, ISO) — used to spot date-range markers.
const META_DATE_TOKEN = String.raw`\d{1,2}[A-Za-z]{3}\d{2,4}|\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2}`;
const META_DATE_RANGE_RE = new RegExp(`(?:${META_DATE_TOKEN})\\s*(?:-|–|—|to)\\s*(?:${META_DATE_TOKEN})`, 'i');

// Is `row` a title/metadata row (given the bulk data width)?
function isMetadataRow(row, bulkWidth) {
  const nonEmpty = row.map((c) => String(c ?? '').trim()).filter((c) => c !== '');
  if (nonEmpty.length === 0) return true;                                  // blank line
  const joined = nonEmpty.join(' ');
  if (/^period\b/i.test(joined) || META_DATE_RANGE_RE.test(joined)) return true; // "Period:" / date-range pair
  if (nonEmpty.length === 1 && bulkWidth >= 3) return true;               // lone value while data is wide (merged title)
  return false;
}

// Remove leading metadata rows; the first non-metadata row becomes the header.
function stripLeadingMetadata(records) {
  if (records.length < 2) return records;
  const widths = records.slice(0, 12).map((r) => r.filter((c) => String(c ?? '').trim() !== '').length);
  const bulkWidth = Math.max(...widths);
  let start = 0;
  while (start < records.length - 1 && isMetadataRow(records[start], bulkWidth)) start++;
  return records.slice(start);
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

  records = stripLeadingMetadata(records); // drop any title/metadata band above the header row

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

// ─── Crew-schedule combined date-time parsing ────────────────────────────────
// Airline crew schedules often embed the date inside the Start/Finish columns
// (e.g. "12Mar24 0029") with no separate Date column. This parser splits a
// combined datetime into { date:'YYYY-MM-DD', time:'HH:MM' }, then a fallback
// (applyDateFallbacks) synthesizes clean Date/Off/On columns so the rest of the
// import pipeline needs no changes.

const MONTH_CODES = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const pad2 = (n) => String(n).padStart(2, '0');

// Validate y/m/d (rejects e.g. 31 Feb) → 'YYYY-MM-DD' or null
function buildDate(y, m, d) {
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

// Day-of-week prefixes and timezone markers that crew rosters sprinkle around the
// timestamp (e.g. "Tue 12Mar24 0029Z", "12Mar24 0029 UTC"). Stripped before parsing.
const DOW_RE = /^(mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mo|tu|we|th|fr|sa|su)\.?$/i;
const TZ_RE = /^(z|utc|gmt|zulu|local|lt)$/i;

// "0029" / "00:29" / "00:29:00" / "002900" / "2400" / "0029Z" → 'HH:MM' or null.
// 2400 (end-of-day) → 00:00; 2401+ invalid.
function parseClockTime(t) {
  if (t == null) return null;
  t = String(t).trim().replace(/(z|utc|gmt|lt|l)$/i, ''); // strip trailing zone marker (0029Z)
  let h, m, mm;
  if ((mm = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/))) { h = +mm[1]; m = +mm[2]; }          // HH:MM(:SS)
  else if ((mm = t.match(/^(\d{2})(\d{2})\d{2}$/)))      { h = +mm[1]; m = +mm[2]; }          // HHMMSS
  else if ((mm = t.match(/^(\d{3,4})$/)))                { const s = t.padStart(4, '0'); h = +s.slice(0, 2); m = +s.slice(2); } // HMM/HHMM
  else return null;
  if (h === 24 && m === 0) h = 0; // 2400 → midnight
  if (h > 23 || m > 59) return null;
  return `${pad2(h)}:${pad2(m)}`;
}

// A date string in any of our supported shapes → 'YYYY-MM-DD', null (date-shaped
// but invalid value, e.g. bad month / 31 Feb), or undefined (not a date shape).
function parseFlexibleDate(s) {
  s = String(s).trim();
  let m;
  // DDMon[YY|YYYY] — separators optional (space/-/ /), 3-letter or full month name
  if ((m = s.match(/^(\d{1,2})[\s\-/]*([A-Za-z]{3,9})[\s\-/]*(\d{2,4})$/))) {
    const mon = MONTH_CODES[m[2].slice(0, 3).toLowerCase()];
    if (!mon) return null;
    const year = m[3].length <= 2 ? 2000 + +m[3] : +m[3];
    return buildDate(year, mon, +m[1]) || null;
  }
  // ISO YYYY-MM-DD
  if ((m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/))) return buildDate(+m[1], +m[2], +m[3]) || null;
  // DD/MM/YY or DD-MM-YY or DD.MM.YYYY — default DD/MM (non-US crew); fall back to MM/DD
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
    const year = m[3].length <= 2 ? 2000 + +m[3] : +m[3];
    return buildDate(year, +m[2], +m[1]) || buildDate(year, +m[1], +m[2]) || null;
  }
  return undefined;
}

// Parse a combined datetime, tolerant of the noise real crew rosters carry: a
// leading day-of-week, a trailing timezone, seconds, HHMMSS, non-breaking/odd or
// repeated whitespace, ISO 'T', and space-separated / full-month dates. Returns
// { date, time } on success, { date:null, time, error } when the time parsed but
// the date didn't (row surfaces a clear error), or null if it's not a datetime.
function parseCombinedDateTime(str) {
  if (str == null) return null;
  // Normalize odd spaces (NBSP/thin/zero-width) + collapse runs; ISO 'T' → space
  let s = String(str).replace(/[\u200b\u200c\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  s = s.replace(/(\d)[Tt](\d)/, '$1 $2');

  // Drop day-of-week and standalone timezone tokens
  const parts = s.split(' ').filter((p) => p && !DOW_RE.test(p) && !TZ_RE.test(p));
  if (parts.length < 2) return null; // need a date token and a time token

  // Time = the last token that parses as a clock time (the date's year can't be
  // mistaken for it — we scan from the end and the time is always trailing).
  let timeIdx = -1, time = null;
  for (let i = parts.length - 1; i >= 0; i--) {
    const t = parseClockTime(parts[i]);
    if (t) { time = t; timeIdx = i; break; }
  }
  if (!time) return null;

  // Date = everything else, joined (handles "12 Mar 24" / "12 March 2024")
  const dateStr = parts.filter((_, i) => i !== timeIdx).join(' ').trim();
  if (!dateStr) return null;
  const date = parseFlexibleDate(dateStr);
  if (date === undefined) return null;                                       // not a datetime
  if (date === null) return { date: null, time, error: `Unrecognized or invalid date "${dateStr}"` };
  return { date, time };
}

// Does a value look like a combined datetime with a valid date? (content sniff)
function looksLikeCombinedDateTime(val) {
  const r = parseCombinedDateTime(val);
  return !!(r && r.date);
}

// Ensure a synthetic header name doesn't collide with an existing one
function uniqueHeader(headers, base) {
  if (!headers.includes(base)) return base;
  let i = 2;
  while (headers.includes(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

// When header detection found no date column, try (1) crew Start/Finish combined
// datetimes — synthesize Date/Off/On columns; then (2) a plain date-like column by
// content. Mutates `mapping`; returns possibly-extended { headers, rawRows, mapping, applied }.
function applyDateFallbacks(headers, rawRows, mapping) {
  if (mapping.date) return { headers, rawRows, mapping, applied: false };

  // Sample up to 20 rows (tolerant of sparse columns / a few junk preamble rows)
  const sample = rawRows.slice(0, 20);
  const sampledVals = (c) => sample.map((r) => (r[c] ?? '').toString().trim()).filter(Boolean);

  // (1) Crew Start/Finish: columns whose content is mostly combined datetimes
  const dtCols = [];
  for (let c = 0; c < headers.length; c++) {
    const vals = sampledVals(c);
    if (vals.length === 0) continue;
    if (vals.filter(looksLikeCombinedDateTime).length >= Math.ceil(vals.length * 0.6)) dtCols.push(c);
  }

  if (dtCols.length > 0) {
    const norm = (c) => normalizeHeader(headers[c]);
    const START = ['start', 'off', 'out', 'blockoff', 'blockout', 'dutystart', 'std', 'departure', 'dep'];
    const FINISH = ['finish', 'on', 'in', 'blockon', 'blockin', 'dutyend', 'sta', 'arrival', 'arr'];
    let startIdx = dtCols.find((c) => START.includes(norm(c)));
    if (startIdx === undefined) startIdx = dtCols[0];
    let finishIdx = dtCols.find((c) => c !== startIdx && FINISH.includes(norm(c)));
    if (finishIdx === undefined) finishIdx = dtCols.find((c) => c !== startIdx);

    const dateHeader = uniqueHeader(headers, 'Date (auto from Start/Finish)');
    const offHeader = uniqueHeader([...headers, dateHeader], 'Off Blocks (auto from Start/Finish)');
    const onHeader = finishIdx !== undefined ? uniqueHeader([...headers, dateHeader, offHeader], 'On Blocks (auto from Start/Finish)') : null;

    const newHeaders = [...headers, dateHeader, offHeader, ...(onHeader ? [onHeader] : [])];
    const newRows = rawRows.map((r) => {
      const s = parseCombinedDateTime((r[startIdx] ?? '').toString().trim());
      const f = finishIdx !== undefined ? parseCombinedDateTime((r[finishIdx] ?? '').toString().trim()) : null;
      const row = [...r, s && s.date ? s.date : '', s && s.time ? s.time : ''];
      if (onHeader) row.push(f && f.time ? f.time : '');
      return row;
    });

    mapping.date = dateHeader;
    if (!mapping.offBlocksTime) mapping.offBlocksTime = offHeader;
    if (onHeader && !mapping.onBlocksTime) mapping.onBlocksTime = onHeader;
    return { headers: newHeaders, rawRows: newRows, mapping, applied: true };
  }

  // (2) Plain date-like column by content (unusual header that synonyms missed)
  for (let c = 0; c < headers.length; c++) {
    const vals = sampledVals(c);
    if (vals.length === 0) continue;
    if (vals.filter((v) => parseFlexDate(v)).length >= Math.ceil(vals.length * 0.6)) {
      mapping.date = headers[c];
      return { headers, rawRows, mapping, applied: true };
    }
  }

  return { headers, rawRows, mapping, applied: false };
}

// ─── Route splitting ──────────────────────────────────────────────────────────
// Crew rosters carry a single "Route" column ("CAI-DMM") instead of separate
// Departure/Arrival. Split it into two synthesized columns the pipeline can map.
const ROUTE_HEADERS = ['route', 'sector', 'sectors', 'routing', 'depart', 'deparr'];

// "CAI-DMM" / "CAI→DMM" / "CAI/DMM" / "CAI - DMM" / "CAI DMM" → { dep, arr } or null
function splitRoute(val) {
  const s = String(val ?? '').trim();
  if (!s) return null;
  const m = s.match(/^([A-Za-z0-9]{3,4})\s*(?:->|-|–|—|→|\/|\bto\b|\s)\s*([A-Za-z0-9]{3,4})$/i);
  if (!m) return null;
  return { dep: m[1].toUpperCase(), arr: m[2].toUpperCase() };
}

// Synthesize Departure/Arrival columns from a Route column when both aren't
// already mapped. Detects the Route column by header or by content.
function applyRouteSplit(headers, rawRows, mapping) {
  if (mapping.departure && mapping.arrival) return { headers, rawRows, mapping, applied: false };

  let routeIdx = headers.findIndex((h) => ROUTE_HEADERS.includes(normalizeHeader(h)));
  if (routeIdx === -1) {
    const sample = rawRows.slice(0, 20);
    for (let c = 0; c < headers.length; c++) {
      const vals = sample.map((r) => (r[c] ?? '').toString().trim()).filter(Boolean);
      if (vals.length && vals.filter((v) => splitRoute(v)).length >= Math.ceil(vals.length * 0.6)) { routeIdx = c; break; }
    }
  }
  if (routeIdx === -1) return { headers, rawRows, mapping, applied: false };

  const depHeader = uniqueHeader(headers, 'Departure (auto from Route)');
  const arrHeader = uniqueHeader([...headers, depHeader], 'Arrival (auto from Route)');
  const newHeaders = [...headers, depHeader, arrHeader];
  const newRows = rawRows.map((r) => {
    const sp = splitRoute((r[routeIdx] ?? '').toString().trim());
    return [...r, sp ? sp.dep : '', sp ? sp.arr : ''];
  });
  if (!mapping.departure) mapping.departure = depHeader;
  if (!mapping.arrival) mapping.arrival = arrHeader;
  return { headers: newHeaders, rawRows: newRows, mapping, applied: true };
}

// ─── Aircraft column disambiguation ───────────────────────────────────────────
// "AC" maps to Registration by default, but if its values look like aircraft TYPE
// codes (A320, B737, ATR72, E190, CRJ900) rather than tail codes, remap to type.
const TYPE_CODE_RE = /^(?:[A-Z]\d{2,3}[A-Z]?|(?:ATR|CRJ|EMB|ERJ|MD|DH|DHC|RJ)\d{2,4})$/i;
function disambiguateAircraftColumn(headers, rawRows, mapping) {
  const acHeader = mapping.registration;
  if (!acHeader || normalizeHeader(acHeader) !== 'ac') return; // only second-guess an "AC" header
  const idx = headers.indexOf(acHeader);
  if (idx === -1) return;
  const vals = rawRows.slice(0, 20).map((r) => (r[idx] ?? '').toString().trim()).filter(Boolean);
  if (vals.length === 0) return;
  const typeish = vals.filter((v) => TYPE_CODE_RE.test(v)).length;
  if (typeish >= Math.ceil(vals.length * 0.6) && !mapping.aircraftType) {
    mapping.aircraftType = acHeader;
    delete mapping.registration;
  }
}

// Run all column enrichments after header-based detectMapping: crew date
// synthesis (Start/Finish), Route splitting, and AC type/registration
// disambiguation. Returns possibly-extended { headers, rawRows, mapping }.
function enrichColumns(headers, rawRows, mapping) {
  let h = headers, r = rawRows;
  if (!mapping.date) ({ headers: h, rawRows: r } = applyDateFallbacks(h, r, mapping));
  ({ headers: h, rawRows: r } = applyRouteSplit(h, r, mapping));
  disambiguateAircraftColumn(h, r, mapping);
  return { headers: h, rawRows: r, mapping };
}

module.exports = {
  detectMapping,
  parseCSV,
  coerceRow,
  parseFlexDate,
  parseFlexTime,
  parseDecimalHours,
  parseTimeToHours,
  parseCombinedDateTime,
  applyDateFallbacks,
  applyRouteSplit,
  enrichColumns,
  splitRoute,
  stripLeadingMetadata,
  extractKeyFields,
  FIELD_SYNONYMS,
};
