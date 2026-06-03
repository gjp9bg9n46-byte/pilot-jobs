'use strict';

const router = require('express').Router();
const { body } = require('express-validator');
const requireEmployerAuth = require('../middleware/requireEmployerAuth');
const c = require('../controllers/employerAuthController');

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

module.exports = router;
