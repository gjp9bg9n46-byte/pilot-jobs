const router      = require('express').Router();
const multer      = require('multer');
const rateLimit   = require('express-rate-limit');
const authMiddleware = require('../middleware/auth');
const cvController   = require('../controllers/cvController');

// 15 MB — modern phone photos (esp. HEIC) routinely exceed the old 5 MB cap.
const PHOTO_MAX_MB = 15;
const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: PHOTO_MAX_MB * 1024 * 1024 } });

// Translate multer's own errors (e.g. file-too-large) into a clear 400 instead
// of a generic 500 — otherwise the user just sees "Upload failed".
function uploadPhotoMw(req, res, next) {
  photoUpload.single('photo')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `Image is too large — please use a photo under ${PHOTO_MAX_MB} MB.` });
    }
    return res.status(400).json({ error: 'Could not read the uploaded file — please try a different image.' });
  });
}

const photoRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.pilot?.id || req.ip,
  message: { error: 'Too many photo uploads — try again in an hour' },
});

router.use(authMiddleware);

router.get('/',  cvController.getCvData);
router.put('/',  cvController.updateCvData);

router.post('/photo',   photoRateLimit, uploadPhotoMw, cvController.uploadPhoto);
router.delete('/photo', cvController.deletePhoto);

module.exports = router;
