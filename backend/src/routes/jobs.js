const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const c = require('../controllers/jobController');

// Per-route auth: everything requires auth EXCEPT GET /:id (public job detail,
// optional auth → personalised isSaved/isApplied only when a pilot is known).
// NOTE: fixed paths (/saved, /alerts, /saved-searches) must stay declared before
// the /:id segment so they aren't captured by it.

// Jobs list
router.get('/', authMiddleware, c.getJobs);
router.get('/saved', authMiddleware, c.getSavedJobs);

// Alerts
router.get('/alerts', authMiddleware, c.getMyAlerts);
router.post('/alerts/run-match', authMiddleware, c.triggerMatch);
router.patch('/alerts/read-all', authMiddleware, c.markAllAlertsRead);
router.patch('/alerts/:id/read', authMiddleware, c.markAlertRead);
router.patch('/alerts/:id/dismiss', authMiddleware, c.dismissAlert);

// Saved searches
router.get('/saved-searches', authMiddleware, c.getSavedSearches);
router.post('/saved-searches', authMiddleware, c.createSavedSearch);
router.patch('/saved-searches/:id', authMiddleware, c.updateSavedSearch);
router.delete('/saved-searches/:id', authMiddleware, c.deleteSavedSearch);

// Job detail — PUBLIC (optional auth); actions below require auth.
router.get('/:id', optionalAuth, c.getJob);
router.post('/:id/save', authMiddleware, c.saveJob);
router.delete('/:id/save', authMiddleware, c.unsaveJob);
router.post('/:id/apply', authMiddleware, c.applyToJob);
router.post('/:id/report', authMiddleware, c.reportJob);

module.exports = router;
