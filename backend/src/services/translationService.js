'use strict';

/**
 * Job translation — every listing displayed in English (owner directive).
 *
 * Uses DeepL's official API (free tier: 500k chars/month, key ends ':fx').
 * Translation happens ONCE per job, after ingestion:
 *   - sourceLanguage null   → not yet checked
 *   - sourceLanguage 'EN'   → checked, already English, nothing stored
 *   - sourceLanguage 'FR'…  → titleEn/descriptionEn hold the translation
 * Re-upserts refresh title/description but never touch the *_En fields, so
 * quota is spent once per job, not once per scrape run.
 *
 * Env:
 *   DEEPL_API_KEY           — required for translation (free: deepl.com/pro-api)
 *   TRANSLATE_BATCH         — max jobs translated per sweep (default 80)
 */

const axios = require('axios');
const prisma = require('../config/database');
const logger = require('../config/logger');
const { extractRequirements } = require('../scrapers/normalize');

// Cheap English detector — ≥3 common English stopwords in the first 500 chars.
// Saves quota by never sending English text to the API.
const EN_STOPWORDS = /\b(the|and|with|for|you|will|are|this|that|from|have|our|is|of|to)\b/gi;
function looksEnglish(text) {
  const sample = String(text || '').slice(0, 500);
  const hits = sample.match(EN_STOPWORDS);
  return (hits?.length || 0) >= 3;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Foreign-language markers in a (short) TITLE: accented characters common in
// FR/DE/ES/IT/PT plus high-frequency non-English function words. Titles are
// too short for the stopword heuristic, so this errs toward translating.
const TITLE_FOREIGN = new RegExp([
  '[àâäéèêëîïôöùûüçñáíóúãõßẞ]',
  '\\b(?:pour|avec|chez|vols?|équipage|copilotes?|pilotes?\\s+de|für|und\\s+der|flugzeugführer|erfahrene',
  'para|vuelo|tripulación|piloto\\s+de|per\\s+il|di\\s+volo|piloti)\\b',
].join('|'), 'i');
function titleLooksForeign(title) {
  return TITLE_FOREIGN.test(String(title || ''));
}

async function deeplTranslate(texts, apiKey) {
  const base = apiKey.trim().endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
  const resp = await axios.post(
    `${base}/v2/translate`,
    { text: texts, target_lang: 'EN-US' },
    { headers: { Authorization: `DeepL-Auth-Key ${apiKey.trim()}` }, timeout: 30000 },
  );
  return resp.data.translations; // [{ detected_source_language, text }]
}

/**
 * Translate ACTIVE jobs that haven't been language-checked yet.
 * Safe to run repeatedly (idempotent); called after each ingestion + on boot.
 */
async function translateUntranslatedJobs() {
  const apiKey = process.env.DEEPL_API_KEY;
  const batch = Math.max(1, parseInt(process.env.TRANSLATE_BATCH || '80', 10));

  // Self-heal: jobs previously stamped 'EN' by the old body-only heuristic but
  // whose TITLE is clearly foreign get their stamp cleared so this run
  // translates them properly.
  const misStamped = await prisma.job.findMany({
    where: { status: 'ACTIVE', sourceLanguage: 'EN', titleEn: null },
    select: { id: true, title: true },
  });
  const resetIds = misStamped.filter((j) => titleLooksForeign(j.title)).map((j) => j.id);
  if (resetIds.length) {
    await prisma.job.updateMany({ where: { id: { in: resetIds } }, data: { sourceLanguage: null } });
    logger.info({ reset: resetIds.length, msg: 'cleared EN stamp on foreign-titled jobs for retranslation' });
  }

  const jobs = await prisma.job.findMany({
    where: { status: 'ACTIVE', sourceLanguage: null },
    select: { id: true, title: true, description: true },
    orderBy: { postedAt: 'desc' },
  });
  if (jobs.length === 0) return 0;

  let translated = 0;
  let markedEnglish = 0;
  let quotaExhausted = false;

  for (const j of jobs) {
    // English check costs nothing — always do it, even without an API key.
    // Guard against bilingual ads: a mostly-English DESCRIPTION must not let a
    // foreign-language TITLE through untranslated (e.g. "Copilotes pour
    // l'ambulance aérienne..." with an English body). If the title carries
    // foreign-language markers, translate regardless of the body.
    if (looksEnglish(`${j.title} ${j.description}`) && !titleLooksForeign(j.title)) {
      await prisma.job.update({ where: { id: j.id }, data: { sourceLanguage: 'EN' } }).catch(() => {});
      markedEnglish++;
      continue;
    }
    if (!apiKey || translated >= batch || quotaExhausted) continue;

    try {
      const [t, d] = await deeplTranslate([j.title, String(j.description || '').slice(0, 4000)], apiKey);

      // The requirement extractor only understands English patterns ("1,500
      // hours", "ATPL required"), so extraction on the original text came up
      // empty for FR/DE/ES ads. Re-run it on the translation and fill any
      // requirement fields that are still blank — never overwrite existing data.
      const full = await prisma.job.findUnique({ where: { id: j.id } });
      const reqs = extractRequirements(`${t.text} ${d?.text ?? ''}`);
      const fill = {};
      for (const [k, v] of Object.entries(reqs)) {
        if (v == null) continue;
        const cur = full?.[k];
        const empty = cur == null || (Array.isArray(cur) && cur.length === 0);
        if (empty && (!Array.isArray(v) || v.length > 0)) fill[k] = v;
      }

      await prisma.job.update({
        where: { id: j.id },
        data: {
          titleEn: t.text,
          descriptionEn: d?.text ?? null,
          sourceLanguage: t.detected_source_language || 'UNKNOWN',
          ...fill,
        },
      });
      translated++;
      await sleep(400); // polite pacing for the free tier
    } catch (err) {
      if (err.response?.status === 456) { // DeepL: quota exceeded
        quotaExhausted = true;
        logger.warn('DeepL monthly quota exhausted — remaining jobs will translate next month');
      } else {
        logger.error({ jobId: j.id, err: err.message, msg: 'translation failed' });
      }
    }
  }

  // Backfill: jobs translated BEFORE requirement re-extraction existed — run
  // the extractor over their stored English text (free, no API calls).
  const translatedNoReqs = await prisma.job.findMany({
    where: {
      status: 'ACTIVE',
      descriptionEn: { not: null },
      reqCertificates: { isEmpty: true },
      reqMinTotalHours: null,
      reqMinPicHours: null,
    },
    select: { id: true, titleEn: true, descriptionEn: true },
  });
  for (const j of translatedNoReqs) {
    const reqs = extractRequirements(`${j.titleEn ?? ''} ${j.descriptionEn ?? ''}`);
    const fill = Object.fromEntries(
      Object.entries(reqs).filter(([, v]) => v != null && (!Array.isArray(v) || v.length > 0)),
    );
    if (Object.keys(fill).length > 0) {
      await prisma.job.update({ where: { id: j.id }, data: fill }).catch(() => {});
    }
  }

  if (!apiKey && jobs.length > markedEnglish) {
    logger.warn(`DEEPL_API_KEY not set — ${jobs.length - markedEnglish} non-English jobs left untranslated (register free at deepl.com/pro-api)`);
  }
  logger.info({ translated, markedEnglish, msg: 'translation sweep complete' });
  return translated;
}

module.exports = { translateUntranslatedJobs, looksEnglish };
