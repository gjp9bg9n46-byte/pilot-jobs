// Where a caught render error goes.
//
// The app wraps every tab in an error boundary, so a render error shows a
// message instead of killing the app — which also means it produces no crash
// report and TestFlight shows nothing at all. Without this endpoint the only
// evidence is a screenshot of "Something went wrong".
//
// Deliberately narrow: a message, two stacks and the build it happened in.
// No payloads, no request bodies, nothing a pilot typed. Repeats of the same
// error on the same screen bump a counter rather than filling the table.
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const prisma = require('../config/database');
const optionalAuth = require('../middleware/optionalAuth');
const logger = require('../config/logger');

// A device in a render loop could post on every frame. One a second, per
// device, is far more than honest reporting needs.
const burst = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.pilot?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
});

const trim = (v, n) => {
  const s = v == null ? '' : String(v);
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

router.post('/client-error', burst, optionalAuth, async (req, res, next) => {
  try {
    const b = req.body || {};
    const message = trim(b.message, 500).trim();
    if (!message) return res.status(422).json({ error: 'message is required' });

    const data = {
      pilotId: req.pilot?.id || '',
      platform: trim(b.platform || 'unknown', 20),
      appVersion: trim(b.appVersion, 60) || null,
      runtime: trim(b.runtime, 120) || null,
      screen: trim(b.screen || 'unknown', 60),
      name: trim(b.name, 80) || null,
      stack: trim(b.stack, 4000) || null,
      componentStack: trim(b.componentStack, 4000) || null,
    };

    // The same error, on the same screen, for the same pilot is one row with a
    // count — not a thousand rows that bury the next distinct failure.
    const row = await prisma.clientError.upsert({
      where: { pilotId_screen_message: { pilotId: data.pilotId, screen: data.screen, message } },
      create: { ...data, message },
      update: {
        count: { increment: 1 },
        lastSeenAt: new Date(),
        // Keep the newest build's stacks: those are the ones worth reading.
        appVersion: data.appVersion, runtime: data.runtime,
        stack: data.stack, componentStack: data.componentStack,
      },
    });

    logger.warn('client error', {
      screen: data.screen, platform: data.platform, appVersion: data.appVersion,
      pilotId: data.pilotId, message, count: row.count,
    });
    res.status(202).json({ id: row.id, count: row.count });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
