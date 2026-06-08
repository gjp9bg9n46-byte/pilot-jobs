'use strict';

const router = require('express').Router();
const c = require('../controllers/statsController');

// Public — no auth. Aggregate counts for the marketing landing page.
router.get('/', c.getStats);

module.exports = router;
