const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const jobController = require('../controllers/jobController');

router.use(authMiddleware);

router.get('/', jobController.getJobs);
router.get('/saved', jobController.getSavedJobs);
router.get('/alerts', jobController.getMyAlerts);
router.get('/:id', jobController.getJob);
router.patch('/alerts/:id/read', jobController.markAlertRead);
router.post('/:id/save', jobController.saveJob);
router.delete('/:id/save', jobController.unsaveJob);
router.post('/:id/apply', jobController.applyToJob);
router.post('/:id/report', jobController.reportJob);

module.exports = router;
