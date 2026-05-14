const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const c = require('../controllers/jobController');

router.use(authMiddleware);

// Jobs list & detail
router.get('/', c.getJobs);
router.get('/saved', c.getSavedJobs);

// Alerts — fixed paths must come before /:id segments
router.get('/alerts', c.getMyAlerts);
router.patch('/alerts/read-all', c.markAllAlertsRead);
router.patch('/alerts/:id/read', c.markAlertRead);
router.patch('/alerts/:id/dismiss', c.dismissAlert);

// Saved searches
router.get('/saved-searches', c.getSavedSearches);
router.post('/saved-searches', c.createSavedSearch);
router.patch('/saved-searches/:id', c.updateSavedSearch);
router.delete('/saved-searches/:id', c.deleteSavedSearch);

// Job by id + actions
router.get('/:id', c.getJob);
router.post('/:id/save', c.saveJob);
router.delete('/:id/save', c.unsaveJob);
router.post('/:id/apply', c.applyToJob);
router.post('/:id/report', c.reportJob);

module.exports = router;
