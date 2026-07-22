const winston = require('winston');

// The codebase logs structured objects — logger.info({ source, msg, ... }).
// Winston's `simple` console format prints object messages as the literal
// text "[object Object]", which made every scraper status line unreadable
// (and unsearchable) in Railway. This format flattens object messages into
// "msg {rest-of-fields}" so log search actually works.
const objectMessage = winston.format((info) => {
  if (info.message && typeof info.message === 'object') {
    const { msg, message, ...rest } = info.message;
    info.message = `${msg || message || ''} ${JSON.stringify(rest)}`.trim();
  }
  return info;
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        objectMessage(),
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

module.exports = logger;
