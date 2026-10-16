'use strict';

/**
 * Voyage-report extraction — the ONLY place a vision model is called.
 *
 * Swapping provider or model is a setting, not a code change: GEMINI_MODEL
 * picks the model, and `PROVIDERS` is where a second provider would be added.
 * Everything downstream (validation, review, saving) works on the shape this
 * module returns, so nothing else knows which model read the page.
 *
 * Privacy: the image bytes and the model's text are never logged. Only sizes,
 * token counts and timings are. Crew names stay inside the returned object.
 */

const axios = require('axios');
const logger = require('../config/logger');

const DEFAULT_MODEL = 'gemini-3.8-flash';
const TIMEOUT_MS = Number(process.env.SCAN_TIMEOUT_MS || 60000);
const MAX_BYTES = 12 * 1024 * 1024;

// Flash pricing (USD per 1M tokens). Used only to report an estimated cost per
// scan; override from env if the rate card moves.
const PRICE_IN = Number(process.env.GEMINI_PRICE_IN || 0.30);
const PRICE_OUT = Number(process.env.GEMINI_PRICE_OUT || 2.50);

class ScanError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// What we ask for. One object per sector, plus the header facts that are
// written once on the page. `confidence` is per field, 0..1 — the review screen
// turns anything low into an amber "please look".
const INSTRUCTIONS = `You are reading a pilot's voyage report (also called a flight report or journey log).
The page may be photographed sideways or upside down — read it whichever way up it is.
Return every flown sector on the page, in the order they appear.

MANY REPORTS USE THE AIR CAIRO "FL-OPS: 02" LAYOUT. On that form:
- "AIRCRAFT REGN: SU ____" — the prefix SU is printed and only the last letters are handwritten. Return the whole registration, e.g. "SU-BVM".
- "FLIGHT No.: MSC 2926/2927" — one flight number per sector, in sector order. Return "MSC 2926" for the first sector, "MSC 2927" for the second.
- "Date: dd/mm/yyyy".
- Each time column holds TWO stacked values per sector row:
    ATD: top = "Chox off" = OUT,  bottom = "A/B" (airborne) = OFF
    ATA: top = "T/Down" (touchdown) = ON,  bottom = "Chox on" = IN
  STD and STA are SCHEDULED times — return them as std/sta, and never as out/off/on/in.
- "TIME D / N / T" on each sector row is the crew's own day / night / total(block) time in hours and minutes. Return them as formDay / formNight / formTotal ("H:MM"). The "TOTAL" row is the page total — return it as totals, not as a sector.
- The lower table has, per sector, "INITIALS / STAFF NO." under PF and PM. Return pfStaff and pmStaff exactly as written (digits or initials).
- Ignore everything else on the page: fuel, S.G., burn-off, delays, pax, ZFW, TOW, remarks, signatures.
- NEVER return cabin-crew names or their staff numbers. Flight-deck crew: return only the commander's name (CAPT) and, if present, the first officer's name.

General rules:
- Times: 24-hour, as written ("HHMM" or "HH MM" or "HH:MM") -> return "HH:MM".
- A value struck through and rewritten: return the corrected one.
- If a cell is blank or unreadable, return null. NEVER invent, compute or copy a value from another column.
- Airport codes: return exactly as written (3-letter IATA or 4-letter ICAO).
- landings: landings recorded for the sector (usually 1). If the form does not record landings, return null.
- pilotRole: the role of the pilot whose logbook this is, if the page makes it clear; otherwise "UNKNOWN".
- pageOrientation: how the page sits in the image — "upright", "rotated_cw" (the page's top edge is on the right, i.e. it must be turned anticlockwise to read), "rotated_ccw", or "upside_down".
- confidence: for EVERY field you return, 0..1 for how sure you are of the characters. Handwriting you had to guess must be below 0.8.
- Output ONLY the JSON object. No prose, no markdown fence.`;

const SCHEMA = {
  type: 'object',
  properties: {
    date: { type: 'string', description: 'Flight date on the report, ISO yyyy-mm-dd' },
    aircraftType: { type: 'string' },
    registration: { type: 'string' },
    commander: { type: 'string' },
    pilotRole: { type: 'string', enum: ['PIC', 'SIC', 'UNKNOWN'] },
    firstOfficer: { type: 'string' },
    documentKind: { type: 'string', description: 'voyage_report | logbook_page | other' },
    pageOrientation: { type: 'string', enum: ['upright', 'rotated_cw', 'rotated_ccw', 'upside_down'] },
    totals: {
      type: 'object',
      description: "The form's own TOTAL row",
      properties: { day: { type: 'string' }, night: { type: 'string' }, total: { type: 'string' } },
    },
    sectors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          flightNumber: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
          out: { type: 'string' }, off: { type: 'string' },
          on: { type: 'string' }, in: { type: 'string' },
          landings: { type: 'integer' },
          pilotFlying: { type: 'boolean' },
          std: { type: 'string' }, sta: { type: 'string' },
          formDay: { type: 'string' }, formNight: { type: 'string' }, formTotal: { type: 'string' },
          pfStaff: { type: 'string' }, pmStaff: { type: 'string' },
          confidence: {
            type: 'object',
            properties: {
              flightNumber: { type: 'number' }, from: { type: 'number' }, to: { type: 'number' },
              out: { type: 'number' }, off: { type: 'number' }, on: { type: 'number' }, in: { type: 'number' },
              landings: { type: 'number' }, pilotFlying: { type: 'number' },
              formTotal: { type: 'number' }, pfStaff: { type: 'number' },
            },
          },
        },
        required: ['flightNumber', 'from', 'to', 'out', 'off', 'on', 'in', 'landings', 'pilotFlying',
          'std', 'sta', 'formDay', 'formNight', 'formTotal', 'pfStaff', 'pmStaff', 'confidence'],
      },
    },
    confidence: {
      type: 'object',
      properties: {
        date: { type: 'number' }, aircraftType: { type: 'number' },
        registration: { type: 'number' }, commander: { type: 'number' }, pilotRole: { type: 'number' },
      },
    },
  },
  required: ['date', 'aircraftType', 'registration', 'commander', 'pilotRole', 'pageOrientation', 'sectors'],
};

function modelName() {
  return String(process.env.GEMINI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

function estimateCostUsd(usage) {
  const inTok = Number(usage?.promptTokenCount || 0);
  const outTok = Number(usage?.candidatesTokenCount || 0) + Number(usage?.thoughtsTokenCount || 0);
  return Math.round(((inTok / 1e6) * PRICE_IN + (outTok / 1e6) * PRICE_OUT) * 1e6) / 1e6;
}

// Model replies are JSON, but a model can still wrap them; be forgiving here
// rather than failing a scan the pilot waited for.
function parseJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch (_) { /* fall through */ }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (_) { /* ignore */ } }
  return null;
}

async function geminiExtract({ buffer, mimeType }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ScanError('NO_KEY', 'Scanning is not configured.');
  const model = modelName();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: INSTRUCTIONS },
        { inline_data: { mime_type: mimeType, data: buffer.toString('base64') } },
      ],
    }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: SCHEMA,
      // A voyage report is a reading job, not a reasoning one: without a cap the
      // model spends thousands of thinking tokens and then answers in three fields.
      maxOutputTokens: Number(process.env.SCAN_MAX_TOKENS || 4096),
      thinkingConfig: { thinkingLevel: String(process.env.SCAN_THINKING || 'low') },
    },
  };
  const started = Date.now();
  let res;
  try {
    res = await axios.post(url, body, {
      timeout: TIMEOUT_MS,
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      maxBodyLength: Infinity,
    });
  } catch (err) {
    const status = err.response?.status;
    // Never log the request body — it contains the image.
    logger.warn(`voyage scan failed: model=${model} status=${status || err.code || 'ERR'} ms=${Date.now() - started}`);
    if (err.code === 'ECONNABORTED') throw new ScanError('TIMEOUT', 'The scan took too long.');
    if (status === 429) throw new ScanError('BUSY', 'The scanner is busy. Try again in a moment.');
    throw new ScanError('PROVIDER', 'The scanner could not read this file.');
  }
  const cand = res.data?.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text).filter(Boolean).join('');
  const parsed = parseJson(text);
  const usage = res.data?.usageMetadata || {};
  logger.info(`voyage scan ok: model=${model} ms=${Date.now() - started} inTok=${usage.promptTokenCount || 0} outTok=${usage.candidatesTokenCount || 0} sectors=${parsed?.sectors?.length ?? 'none'}`);
  if (!parsed || !Array.isArray(parsed.sectors)) throw new ScanError('UNREADABLE', 'No flights could be read from this file.');
  return {
    model,
    raw: parsed,
    usage: {
      promptTokens: usage.promptTokenCount || 0,
      outputTokens: (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0),
      costUsd: estimateCostUsd(usage),
      ms: Date.now() - started,
    },
  };
}

const PROVIDERS = { gemini: geminiExtract };

/**
 * Read a voyage report. One call, one provider, one shape.
 * @param {{buffer: Buffer, mimeType: string}} file
 */
async function extractVoyageReport({ buffer, mimeType }) {
  if (!buffer || !buffer.length) throw new ScanError('EMPTY', 'No file was uploaded.');
  if (buffer.length > MAX_BYTES) throw new ScanError('TOO_BIG', 'That file is too large (12 MB max).');
  const provider = PROVIDERS[String(process.env.SCAN_PROVIDER || 'gemini')];
  if (!provider) throw new ScanError('NO_PROVIDER', 'Scanning is not configured.');
  return provider({ buffer, mimeType });
}

module.exports = { extractVoyageReport, ScanError, modelName, estimateCostUsd, parseJson, SCHEMA, INSTRUCTIONS };
