const router      = require('express').Router();
const multer      = require('multer');
const rateLimit   = require('express-rate-limit');
const authMiddleware = require('../middleware/auth');
const cvController   = require('../controllers/cvController');

const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const photoRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.pilot?.id || req.ip,
  message: { error: 'Too many photo uploads — try again in an hour' },
});

router.use(authMiddleware);

router.get('/',  cvController.getCvData);
router.put('/',  cvController.updateCvData);

router.post('/photo',   photoRateLimit, photoUpload.single('photo'), cvController.uploadPhoto);
router.delete('/photo', cvController.deletePhoto);

module.exports = router;
