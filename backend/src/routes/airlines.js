'use strict';

const router = require('express').Router();
const c = require('../controllers/airlineController');

// Public read — no auth middleware
router.get('/',              c.listAirlines);
router.get('/:id/job-count', c.getJobCount);
router.get('/:id',           c.getAirline);

module.exports = router;
