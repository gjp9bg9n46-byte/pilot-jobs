'use strict';

const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const c = require('../controllers/airlineController');

// Public read
router.get('/',              c.listAirlines);
router.get('/:id/job-count', c.getJobCount);
router.get('/:id',           c.getAirline);

// Auth-required: contributions
router.post('/:id/contributions',      authMiddleware, c.contribute);
router.get('/:id/contributions/mine',  authMiddleware, c.getMyContributions);

module.exports = router;
