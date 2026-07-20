const router = require('express').Router();
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const authAnyUser = require('../middleware/authAnyUser');

// 3 password-reset requests per hour, keyed by target email (falls back to IP).
const forgotPasswordLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => (req.body?.email || '').trim().toLowerCase() || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reset requests. Please wait an hour before trying again.' },
});

// 3 resend-verification requests per hour, keyed by the authenticated user.
const resendVerificationLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => req.account?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification requests. Please wait an hour before trying again.' },
});

router.post(
  '/register',
  [
    body('email').isEmail(),
    body('password').isLength({ min: 8 }),
    body('firstName').optional(),
    body('lastName').optional(),
  ],
  authController.register
);

router.post('/login', authController.login);
router.post('/google', authController.googleAuth);

// Password reset (Phase B1) — shared by pilots + employers, public.
router.post('/forgot-password', forgotPasswordLimit, authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// Email verification (Phase B2). verify-email is public (token-based);
// resend-verification is auth-gated (pilot OR employer) + rate-limited.
router.post('/verify-email', authController.verifyEmail);
router.post('/resend-verification', authAnyUser, resendVerificationLimit, authController.resendVerification);

router.get('/me', authMiddleware, authController.me);
router.patch('/fcm-token', authMiddleware, authController.updateFcmToken);
router.patch('/change-password', authMiddleware, authController.changePassword);
router.delete('/account', authMiddleware, authController.deleteAccount);

// Session management
router.get('/sessions', authMiddleware, authController.getSessions);
router.delete('/sessions', authMiddleware, authController.deleteAllSessions);
router.delete('/sessions/:id', authMiddleware, authController.deleteSession);

module.exports = router;
