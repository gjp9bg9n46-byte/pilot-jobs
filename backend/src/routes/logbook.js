const router = require('express').Router();
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const authMiddleware = require('../middleware/auth');
const flightLogController = require('../controllers/flightLogController');
const scan = require('../controllers/logbookScanController');
const prefs = require('../controllers/logbookPrefsController');

// A phone photo of a voyage report; 12 MB covers a 12-megapixel JPEG.
const scanUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

// Burst guard in front of the per-pilot daily cap in the controller (30/day):
// this one stops a stuck client hammering the provider.
const scanBurst = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 12,
  keyGenerator: (req) => req.pilot?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many scans at once. Wait a minute and try again.' },
});

router.use(authMiddleware);

// Hours-dashboard summary shared by web + app (see services/logbookSummary).
router.get('/summary', flightLogController.summary);

// Logbook preferences (hh:mm vs decimal, role preset, remembered values, staff number).
router.get('/prefs', prefs.getPrefs);
router.put('/prefs', prefs.updatePrefs);

// Voyage-report scanning.
router.get('/scan-quota', scan.quota);
router.post('/scan', scanBurst, scanUpload.single('file'), scan.createScan);
router.get('/scan/:id', scan.getScan);
router.get('/scan/:id/image', scan.getScanImage);
router.get('/scan/:id/row/:index/image', scan.getRowImage);
router.post('/scan/:id/save', scan.saveScan);
router.delete('/scan/:id', scan.discardScan);

module.exports = router;
