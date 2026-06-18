'use strict';

const router       = require('express').Router();
const authMiddleware = require('../middleware/auth');
const requireAdmin   = require('../middleware/requireAdmin');
const c            = require('../controllers/adminController');
const ec           = require('../controllers/employerAdminController');

router.use(authMiddleware);
router.use(requireAdmin);

router.get('/stats',                    c.getStats);
router.get('/contributions',            c.getContributions);
router.post('/contributions/:id/approve', c.approve);
router.post('/contributions/:id/reject',  c.reject);

// Employer portal moderation
router.get('/employers',                ec.listEmployers);
router.get('/employers/pending',        ec.listPendingEmployers);
router.post('/employers/:id/approve',   ec.approveEmployer);
router.post('/employers/:id/reject',    ec.rejectEmployer);
router.post('/employers/:id/suspend',   ec.suspendEmployer);
router.get('/jobs/pending',             ec.listPendingJobs);

module.exports = router;
