const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const profileController = require('../controllers/profileController');

router.use(authMiddleware);

router.get('/', profileController.getProfile);
router.patch('/', profileController.updateProfile);
router.get('/totals',         profileController.getFlightTotals);
router.get('/carry-forward',  profileController.getCarryForward);
router.put('/carry-forward',  profileController.updateCarryForward);

router.post('/certificates', profileController.addCertificate);
router.delete('/certificates/:id', profileController.deleteCertificate);

router.post('/ratings', profileController.addRating);
router.delete('/ratings/:id', profileController.deleteRating);

router.post('/medicals', profileController.addMedical);
router.delete('/medicals/:id', profileController.deleteMedical);

router.post('/training', profileController.addTraining);
router.delete('/training/:id', profileController.deleteTraining);

router.get('/recurrent', profileController.getRecurrent);
router.post('/recurrent', profileController.addRecurrent);
router.delete('/recurrent/:id', profileController.deleteRecurrent);

router.get('/elp', profileController.getELP);
router.post('/elp', profileController.addELP);
router.delete('/elp/:id', profileController.deleteELP);

router.get('/rtw', profileController.getRTW);
router.post('/rtw', profileController.addRTW);
router.delete('/rtw/:id', profileController.deleteRTW);

router.post('/right-to-work', profileController.addRightToWork);
router.delete('/right-to-work/:id', profileController.deleteRightToWork);

router.put('/preferences', profileController.updatePreferences);
router.patch('/privacy', profileController.updatePrivacy);
router.get('/counts', profileController.getCounts);
router.get('/export', profileController.exportData);

module.exports = router;
