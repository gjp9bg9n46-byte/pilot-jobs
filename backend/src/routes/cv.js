const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const cvController = require('../controllers/cvController');

router.use(authMiddleware);

router.get('/',  cvController.getCvData);
router.put('/',  cvController.updateCvData);

module.exports = router;
