const router = require('express').Router();
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const authMiddleware = require('../middleware/auth');
const flightLogController = require('../controllers/flightLogController');
const scan = require('../controllers/logbookScanController');
const bundles = require('../controllers/bundleController');
const prefs = require('../controllers/logbookPrefsController');
const { invalidateMatchContext } = require('../services/matchContextCache');

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

// Any write here changes what the matcher sees for this pilot, so the cached
// match context is dropped when the response finishes. One hook per router
// beats remembering it in every handler (services/matchContextCache.js).
router.use((req, res, next) => {
  if (req.method !== 'GET' && req.pilot && req.pilot.id) {
    const id = req.pilot.id;
    res.on('finish', () => invalidateMatchContext(id));
  }
  next();
});


// Hours-dashboard summary shared by web + app (see services/logbookSummary).
router.get('/summary', flightLogController.summary);
// One call for everything the Logbook tab opens with (prefs + quota + summary
// + first page). See controllers/bundleController.js.
router.get('/bootstrap', bundles.logbookBootstrap);

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
