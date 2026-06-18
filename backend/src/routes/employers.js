'use strict';

const router = require('express').Router();
const { body } = require('express-validator');
const requireEmployerAuth = require('../middleware/requireEmployerAuth');
const requireApprovedEmployer = require('../middleware/requireApprovedEmployer');
const c = require('../controllers/employerAuthController');
const jc = require('../controllers/employerJobController');

// Public
router.post(
  '/register',
  [
    body('companyName').trim().notEmpty().withMessage('Company name is required'),
    body('companyType').notEmpty().withMessage('Company type is required'),
    body('country').trim().notEmpty().withMessage('Country is required'),
    body('contactName').trim().notEmpty().withMessage('Contact name is required'),
    body('contactEmail').isEmail().withMessage('A valid contact email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  c.register
);

router.post('/login', c.login);

// Authenticated (employer)
router.get('/me', requireEmployerAuth, c.me);
router.put('/me', requireEmployerAuth, c.updateMe);

// Job CRUD. Create/update/repost require an APPROVED employer; list/delete
// only require authentication (a suspended employer can still see/retire jobs).
router.post('/jobs', requireEmployerAuth, requireApprovedEmployer, jc.createJob);
router.get('/jobs', requireEmployerAuth, jc.listMyJobs);
router.put('/jobs/:id', requireEmployerAuth, requireApprovedEmployer, jc.updateJob);
router.delete('/jobs/:id', requireEmployerAuth, jc.deleteJob);
router.post('/jobs/:id/repost', requireEmployerAuth, requireApprovedEmployer, jc.repostJob);

// Applicants (E1) — APPROVED employers only; ownership enforced in the controller.
router.get('/jobs/:id/applicants', requireEmployerAuth, requireApprovedEmployer, jc.listApplicants);
router.patch('/applications/:id/status', requireEmployerAuth, requireApprovedEmployer, jc.updateApplicationStatus);

module.exports = router;
