const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const flightLogController = require('../controllers/flightLogController');

router.use(authMiddleware);

// Hours-dashboard summary shared by web + app (see services/logbookSummary).
router.get('/summary', flightLogController.summary);

module.exports = router;
