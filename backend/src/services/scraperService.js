const axios = require('axios');
const cheerio = require('cheerio');
const prisma = require('../config/database');
const { matchJobToAllPilots } = require('./matchingService');
const logger = require('../config/logger');

// ─── Requirement extractor ────────────────────────────────────────────────────
const AUTHORITY_KEYWORDS = ['FAA', 'EASA', 'GCAA', 'CAAC', 'DGCA', 'CASA', 'CAA', 'TCCA', 'ANAC', 'JCAB'];
const CERT_KEYWORDS = { ATP: 'ATP', ATPL: 'ATPL', CPL: 'CPL', MPL: 'MPL', PPL: 'PPL' };

function extractHours(text, keyword) {
  const regex = new RegExp(`(\\d[,\\d]*)\\s*(?:hours?|hrs?).*?${keyword}|${keyword}.*?(\\d[,\\d]*)\\s*(?:hours?|hrs?)`, 'i');
  const match = text.match(regex);
  if (!match) return null;
  const raw = (match[1] || match[2]).replace(/,/g, '');
  return parseFloat(raw);
}

function extractRequirements(description) {
  const text = description;
  const reqs = {
    reqAuthorities: AUTHORITY_KEYWORDS.filter((a) => text.toUpperCase().includes(a)),
    reqCertificates: Object.entries(CERT_KEYWORDS)
      .filter(([, kw]) => new RegExp(`\\b${kw}\\b`, 'i').test(text))
      .map(([type]) => type),
    reqAircraftTypes: [],
    reqMinTotalHours: extractHours(text, 'total') || extractHours(text, 'flight time'),
    reqMinPicHours: extractHours(text, 'PIC') || extractHours(text, 'pilot[\\s-]+in[\\s-]+command'),
    reqMinMultiEngineHours: extractHours(text, 'multi[\\s-]*engine'),
    reqMinTurbineHours: extractHours(text, 'turbine'),
    reqMinInstrumentHours: extractHours(text, 'instrument'),
    reqMedicalClass: /class\s*1|first[-\s]class\s*medical/i.test(text) ? 'CLASS_1' : null,
    reqWillingToRelocate: /reloca/i.test(text),
  };

  const aircraftPatterns = [/B7\d{2}/, /A3\d{2}/, /A2\d{2}/, /ATR\s*\d+/, /CRJ\s*\d+/, /E\d{3}/, /DHC\s*\d+/];
  for (const pattern of aircraftPatterns) {
    const match = text.match(pattern);
    if (match) reqs.reqAircraftTypes.push(match[0].replace(/\s+/, ''));
  }

  return reqs;
}

// ─── Source scrapers ──────────────────────────────────────────────────────────

async function scrapeAviationJobSearch() {
  const jobs = [];
  try {
    const { data } = await axios.get('https://www.aviationjobsearch.com/jobs/pilot', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000,
    });
    const $ = cheerio.load(data);
    $('.job-item, .job-listing, article.job').each((_, el) => {
      const title = $(el).find('h2, h3, .job-title').first().text().trim();
      const company = $(el).find('.company, .employer').first().text().trim();
      const location = $(el).find('.location').first().text().trim();
      const applyUrl = $(el).find('a').first().attr('href');
      const description = $(el).find('.description, .summary').first().text().trim();
      if (title && applyUrl) {
        jobs.push({ title, company, location, description, applyUrl, sourceUrl: 'aviationjobsearch.com' });
      }
    });
  } catch (err) {
    logger.error(`AviationJobSearch scrape failed: ${err.message}`);
  }
  return jobs;
}

async function scrapePilotCareerCentre() {
  const jobs = [];
  try {
    const { data } = await axios.get('https://www.pilotcareercentre.com/jobs', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000,
    });
    const $ = cheerio.load(data);
    $('div.job, li.job-listing').each((_, el) => {
      const title = $(el).find('h2, h3, .title').first().text().trim();
      const company = $(el).find('.airline, .company').first().text().trim();
      const location = $(el).find('.location').first().text().trim();
      const applyUrl = $(el).find('a').first().attr('href');
      const description = $(el).text();
      if (title && applyUrl) {
        jobs.push({ title, company, location, description, applyUrl, sourceUrl: 'pilotcareercentre.com' });
      }
    });
  } catch (err) {
    logger.error(`PilotCareerCentre scrape failed: ${err.message}`);
  }
  return jobs;
}

// ─── Persist & match ──────────────────────────────────────────────────────────

async function upsertJob(raw) {
  const reqs = extractRequirements(raw.description || '');
  const country = raw.location?.split(',').pop()?.trim() || null;

  const existing = await prisma.job.findFirst({ where: { applyUrl: raw.applyUrl } });
  if (existing) return null;

  const job = await prisma.job.create({
    data: {
      title: raw.title,
      company: raw.company || 'Unknown',
      location: raw.location || 'Unknown',
      country,
      description: raw.description || '',
      applyUrl: raw.applyUrl,
      sourceUrl: raw.sourceUrl,
      ...reqs,
    },
  });

  return job;
}

async function runScraper() {
  logger.info('Scraper started');
  const allRaw = [
    ...(await scrapeAviationJobSearch()),
    ...(await scrapePilotCareerCentre()),
  ];

  logger.info(`Scraped ${allRaw.length} raw listings`);

  let created = 0;
  for (const raw of allRaw) {
    const job = await upsertJob(raw);
    if (job) {
      created++;
      await matchJobToAllPilots(job);
    }
  }
  logger.info(`Scraper done — ${created} new jobs saved`);
}

module.exports = { runScraper, extractRequirements };
