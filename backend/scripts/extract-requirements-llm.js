#!/usr/bin/env node
'use strict';

/**
 * LLM structured requirement extraction (Anthropic claude-haiku, JSON output).
 *
 * Regex extraction over (often truncated) text produces junk — a bare "ATPL",
 * a lone hours number, or nothing. This reads the FULL description and fills the
 * structured req fields far more accurately, REPLACING the regex output when it
 * runs. Each job is processed once (requirementsExtractedAt marker).
 *
 * Env: ANTHROPIC_API_KEY (required — no-ops without it),
 *      ANTHROPIC_MODEL (optional, default claude-haiku-4-5).
 *
 *   node scripts/extract-requirements-llm.js [--limit N] [--dry-run]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const prisma = require('../src/config/database');
const logger = require('../src/config/logger');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
const MIN_DESC = 400; // only worth an LLM call on a real (non-snippet) description

const SYSTEM = `You extract structured pilot-job requirements from a job description.
Return ONLY a JSON object (no prose, no markdown) with EXACTLY these keys:
{"minTotalHours":number|null,"minPicHours":number|null,"minMultiEngineHours":number|null,
"minTurbineHours":number|null,"minInstrumentHours":number|null,"minCrossCountryHours":number|null,
"certificates":string[],"authorities":string[],"aircraftTypes":string[],
"medicalClass":string|null,"englishLevel":number|null,"workAuthorization":string|null}
Rules: use null / [] when a requirement is NOT stated. Do NOT infer or guess beyond the text.
certificates: licence codes only, e.g. ["ATPL","CPL","MPL","PPL"]. authorities: e.g. ["EASA","FAA","CAA","GCAA"].
aircraftTypes: ICAO-ish type codes the candidate must be rated on, e.g. ["A320","B737"] — NOT the role.
medicalClass: "1" or "2" (the number only). englishLevel: ICAO 1-6 integer. workAuthorization: "EU"|"US"|"UK"|null.
Never put a job title/role (e.g. "First Officer") in any array.`;

async function callAnthropic(apiKey, description) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Job description:\n\n${String(description).slice(0, 8000)}` }],
    }),
  });
  if (!resp.ok) throw new Error(`anthropic HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  const text = (data.content || []).map((c) => c.text || '').join('');
  const jsonStr = text.replace(/```json|```/g, '').trim();
  return JSON.parse(jsonStr);
}

// Coerce the model output into the Job req columns (defensive — trust nothing).
const ROLE_RE = /first officer|captain|second officer|\bpilot\b|cadet|instructor|examiner/i;
const posNum = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null);
const cleanArr = (v) => (Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim().toUpperCase()).filter((x) => x && x.length <= 12 && !ROLE_RE.test(x)))] : []);

function toReqFields(o) {
  const eng = Number(o.englishLevel);
  return {
    reqMinTotalHours: posNum(o.minTotalHours),
    reqMinPicHours: posNum(o.minPicHours),
    reqMinMultiEngineHours: posNum(o.minMultiEngineHours),
    reqMinTurbineHours: posNum(o.minTurbineHours),
    reqMinInstrumentHours: posNum(o.minInstrumentHours),
    reqMinCrossCountryHours: posNum(o.minCrossCountryHours),
    reqCertificates: cleanArr(o.certificates),
    reqAuthorities: cleanArr(o.authorities),
    reqAircraftTypes: cleanArr(o.aircraftTypes),
    reqMedicalClass: o.medicalClass != null ? String(o.medicalClass).replace(/[^12]/g, '') || null : null,
    reqEnglishLevel: Number.isInteger(eng) && eng >= 1 && eng <= 6 ? eng : null,
    reqWorkAuthorization: o.workAuthorization ? String(o.workAuthorization).toUpperCase().slice(0, 8) : null,
  };
}

async function extractRequirementsLLM({ limit = 25, dryRun = false } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { logger.warn({ source: 'REQ-LLM', msg: 'ANTHROPIC_API_KEY not set — skipping' }); return { considered: 0, extracted: 0 }; }

  const jobs = await prisma.$queryRaw`
    SELECT id, description FROM "Job"
    WHERE status = 'ACTIVE' AND "requirementsExtractedAt" IS NULL
      AND char_length(description) >= ${MIN_DESC}
    ORDER BY "createdAt" DESC LIMIT ${limit}`;

  let extracted = 0, failed = 0;
  for (const j of jobs) {
    const now = new Date();
    try {
      const raw = await callAnthropic(apiKey, j.description);
      const fields = toReqFields(raw);
      if (!dryRun) await prisma.job.update({ where: { id: j.id }, data: { ...fields, requirementsExtractedAt: now } });
      extracted++;
      logger.info({ source: 'REQ-LLM', id: j.id, msg: 'requirements extracted', certs: fields.reqCertificates.length, hours: fields.reqMinTotalHours });
    } catch (err) {
      failed++;
      logger.error({ source: 'REQ-LLM', id: j.id, err: err.message, msg: 'extraction failed' });
      // Do NOT stamp on failure — retry next run.
    }
  }
  logger.info({ source: 'REQ-LLM', msg: 'LLM requirement extraction complete', considered: jobs.length, extracted, failed, dryRun });
  return { considered: jobs.length, extracted, failed };
}

module.exports = { extractRequirementsLLM, toReqFields };

if (require.main === module) {
  const li = process.argv.indexOf('--limit');
  const limit = li >= 0 ? parseInt(process.argv[li + 1], 10) : 25;
  const dryRun = process.argv.includes('--dry-run');
  extractRequirementsLLM({ limit, dryRun })
    .then((r) => { console.log(JSON.stringify(r)); return prisma.$disconnect(); })
    .then(() => process.exit(0))
    .catch((e) => { console.error('REQ-LLM FAILED:', e.message); process.exit(1); });
}
