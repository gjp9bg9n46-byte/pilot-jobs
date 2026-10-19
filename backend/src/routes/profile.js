const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const profileController = require('../controllers/profileController');
const { invalidateMatchContext } = require('../services/matchContextCache');
const bundles = require('../controllers/bundleController');

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


router.get('/', profileController.getProfile);
router.get('/readiness', profileController.getReadiness);
// One call for everything the Profile tab opens with (profile + readiness +
// logbook totals + applications + CV). See controllers/bundleController.js.
router.get('/overview', bundles.profileOverview);
router.patch('/', profileController.updateProfile);
router.get('/totals',         profileController.getFlightTotals);
router.get('/airports',       profileController.getAirports);
router.get('/carry-forward',  profileController.getCarryForward);
router.put('/carry-forward',  profileController.updateCarryForward);

router.post('/certificates', profileController.addCertificate);
router.delete('/certificates/:id', profileController.deleteCertificate);
router.patch('/certificates/:id', profileController.updateCertificate);

router.post('/ratings', profileController.addRating);
router.delete('/ratings/:id', profileController.deleteRating);
router.patch('/ratings/:id', profileController.updateRating);

router.post('/medicals', profileController.addMedical);
router.delete('/medicals/:id', profileController.deleteMedical);
router.patch('/medicals/:id', profileController.updateMedical);

router.post('/training', profileController.addTraining);
router.delete('/training/:id', profileController.deleteTraining);
router.patch('/training/:id', profileController.updateTraining);

router.get('/recurrent', profileController.getRecurrent);
router.post('/recurrent', profileController.addRecurrent);
router.delete('/recurrent/:id', profileController.deleteRecurrent);

router.get('/elp', profileController.getELP);
router.post('/elp', profileController.addELP);
router.delete('/elp/:id', profileController.deleteELP);
router.patch('/elp/:id', profileController.updateELP);

router.get('/rtw', profileController.getRTW);
router.post('/rtw', profileController.addRTW);
router.delete('/rtw/:id', profileController.deleteRTW);
router.patch('/rtw/:id', profileController.updateRTW);

router.post('/right-to-work', profileController.addRightToWork);
router.delete('/right-to-work/:id', profileController.deleteRightToWork);

router.put('/preferences', profileController.updatePreferences);
router.patch('/privacy', profileController.updatePrivacy);
router.get('/counts', profileController.getCounts);
router.get('/export', profileController.exportData);

module.exports = router;
