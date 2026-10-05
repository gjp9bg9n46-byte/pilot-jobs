'use strict';
const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const c = require('../controllers/dashboardController');

router.get('/', authMiddleware, c.getDashboard);

module.exports = router;
