'use strict';

const router       = require('express').Router();
const authMiddleware = require('../middleware/auth');
const requireAdmin   = require('../middleware/requireAdmin');
const c            = require('../controllers/adminController');

router.use(authMiddleware);
router.use(requireAdmin);

router.get('/contributions',            c.getContributions);
router.post('/contributions/:id/approve', c.approve);
router.post('/contributions/:id/reject',  c.reject);

module.exports = router;
