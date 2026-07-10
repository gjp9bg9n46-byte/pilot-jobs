if (typeof File === 'undefined') global.File = class File {};
require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const logger = require('./config/logger');
const errorHandler = require('./middleware/errorHandler');
const { runIngestion } = require('./scrapers/index');
const { runFullMatch } = require('./services/matchingService');
const { recomputeJobDerivedStats, refreshWikiFleet } = require('./services/airlineEnrichmentService');

const app = express();
app.use(helmet());
app.use(cors({
  origin: [
    'https://cockpithire.com',
    'https://www.cockpithire.com',
    /\.vercel\.app$/,
  ],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Landing page
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/flight-logs', require('./routes/flightLogs'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/cv',   require('./routes/cv'));
app.use('/api/airlines', require('./routes/airlines'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/admin',   require('./routes/admin'));
app.use('/api/employers', require('./routes/employers'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

// Scheduled scraping every N hours
const intervalHours = parseInt(process.env.SCRAPE_INTERVAL_HOURS || '6', 10);
cron.schedule(`0 */${intervalHours} * * *`, async () => {
  try {
    await runIngestion();
  } catch (err) {
    logger.error(`Scheduled scrape failed: ${err.message}`);
  }
  // Airline factfiles derive hiring status / pay ranges from the fresh job data.
  try {
    await recomputeJobDerivedStats();
  } catch (err) {
    logger.error(`Airline stats recompute failed: ${err.message}`);
  }
});

// Weekly airline fleet refresh from Wikipedia (Mondays 04:00 UTC) — fleetDetail
// is enrichment-owned and refreshed; community-contributed fields are untouched.
cron.schedule('0 4 * * 1', async () => {
  try {
    await refreshWikiFleet();
  } catch (err) {
    logger.error(`Airline fleet refresh failed: ${err.message}`);
  }
});

// Immediate run on dev startup so fresh data is available without waiting for cron
if (process.env.NODE_ENV !== 'production') {
  setImmediate(() => runIngestion().catch((err) => logger.error(`Dev startup scrape failed: ${err.message}`)));
}

// On every boot (incl. production deploys): purge stored jobs that fail the
// current filter rules or are past their expiry date — stale/invalid listings
// vanish immediately instead of waiting for the next scrape cron.
setImmediate(async () => {
  try {
    const { revalidateActiveJobs, expirePastDue } = require('./scrapers/runner');
    const employerConfigs = require('./scrapers/config/employers');
    await revalidateActiveJobs(employerConfigs);
    await expirePastDue();
    await require('./scrapers/dedup').collapseSameAdAcrossLocations();
    await require('./services/translationService').translateUntranslatedJobs();
  } catch (err) {
    logger.error(`Startup job cleanup failed: ${err.message}`);
  }
});

// Run matching on startup to catch missed matches
cron.schedule('0 2 * * *', async () => {
  try {
    await runFullMatch();
  } catch (err) {
    logger.error(`Scheduled match failed: ${err.message}`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => logger.info(`Server running on port ${PORT}`));

module.exports = app;
