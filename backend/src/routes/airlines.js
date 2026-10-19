'use strict';

const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const c = require('../controllers/airlineController');

// Public read. optionalAuth so a signed-in pilot also gets "how many of these
// jobs are open to me", while an anonymous visitor still sees the fact file.
router.get('/',              optionalAuth, c.listAirlines);
// Before '/:id' — otherwise 'logos' is read as an airline id.
router.get('/logos',         c.listAirlineLogos);
router.get('/:id/job-count', c.getJobCount);
router.get('/:id',           optionalAuth, c.getAirline);

// Auth-required: contributions
router.post('/:id/contributions',      authMiddleware, c.contribute);
router.get('/:id/contributions/mine',  authMiddleware, c.getMyContributions);

module.exports = router;
