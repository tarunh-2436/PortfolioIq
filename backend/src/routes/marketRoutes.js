const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/search', marketController.searchEndpoint);
router.get('/resolve', marketController.resolveEndpoint);

module.exports = router;
