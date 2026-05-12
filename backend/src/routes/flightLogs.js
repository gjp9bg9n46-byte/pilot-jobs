const router = require('express').Router();
const multer = require('multer');
const authMiddleware = require('../middleware/auth');
const flightLogController = require('../controllers/flightLogController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(authMiddleware);

router.get('/recent-aircraft', flightLogController.recentAircraft);
router.get('/', flightLogController.getLogs);
router.post('/', flightLogController.createLog);
router.post('/bulk', flightLogController.bulkCreate);
router.patch('/:id', flightLogController.updateLog);
router.delete('/:id', flightLogController.deleteLog);
router.post('/import', upload.single('file'), flightLogController.importLogbook);

module.exports = router;
