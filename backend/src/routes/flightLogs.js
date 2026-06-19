const router = require('express').Router();
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const authMiddleware = require('../middleware/auth');
const flightLogController = require('../controllers/flightLogController');

// Existing upload: 20 MB, used by the legacy ForeFlight/LogbookPro importer
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Separate upload for the new importer: stricter 10 MB cap
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Per-user rate limit on /import/parse (10 requests per hour)
const importParseLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.pilot?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many import requests. Please wait before trying again (limit: 10/hour).' },
});

// Same per-user limit on /import/confirm (separate bucket from /parse so a normal
// parse→confirm round trip never collides). Confirm writes rows, so cap abuse.
const importConfirmLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.pilot?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many import requests. Please wait before trying again (limit: 10/hour).' },
});

router.use(authMiddleware);

router.get('/recent-aircraft', flightLogController.recentAircraft);
router.get('/', flightLogController.getLogs);
router.post('/', flightLogController.createLog);
router.post('/bulk', flightLogController.bulkCreate);
router.patch('/:id', flightLogController.updateLog);
router.delete('/:id', flightLogController.deleteLog);
router.post('/import', upload.single('file'), flightLogController.importLogbook);

// New two-step importer
router.post('/import/parse',   importParseLimit, importUpload.single('file'), flightLogController.importParse);
router.post('/import/confirm', importConfirmLimit, flightLogController.importConfirm);

module.exports = router;
