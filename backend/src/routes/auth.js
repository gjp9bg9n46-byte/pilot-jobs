const router = require('express').Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

router.post(
  '/register',
  [
    body('email').isEmail(),
    body('password').isLength({ min: 8 }),
    body('firstName').notEmpty(),
    body('lastName').notEmpty(),
  ],
  authController.register
);

router.post('/login', authController.login);
router.get('/me', authMiddleware, authController.me);
router.patch('/fcm-token', authMiddleware, authController.updateFcmToken);
router.patch('/change-password', authMiddleware, authController.changePassword);
router.delete('/account', authMiddleware, authController.deleteAccount);

// Session management
router.get('/sessions', authMiddleware, authController.getSessions);
router.delete('/sessions', authMiddleware, authController.deleteAllSessions);
router.delete('/sessions/:id', authMiddleware, authController.deleteSession);

module.exports = router;
