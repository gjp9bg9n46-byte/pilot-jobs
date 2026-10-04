'use strict';

const router = require('express').Router();
const c = require('../controllers/statsController');

// Public — no auth. Aggregate counts for the marketing landing page.
router.get('/', c.getStats);
// Public — live landing content (hero job, top operators, factfiles).
router.get('/landing', c.getLanding);

module.exports = router;
