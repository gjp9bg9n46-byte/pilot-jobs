require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const logger = require('./config/logger');
const errorHandler = require('./middleware/errorHandler');
const { runScraper } = require('./services/scraperService');
const { runFullMatch } = require('./services/matchingService');

const app = express();
app.get('/', (req, res) => {
  res.send('The CockpitHire API is officially alive!');
});
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/flight-logs', require('./routes/flightLogs'));
app.use('/api/jobs', require('./routes/jobs'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

// Scheduled scraping every N hours
const intervalHours = parseInt(process.env.SCRAPE_INTERVAL_HOURS || '6', 10);
cron.schedule(`0 */${intervalHours} * * *`, async () => {
  try {
    await runScraper();
  } catch (err) {
    logger.error(`Scheduled scrape failed: ${err.message}`);
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
