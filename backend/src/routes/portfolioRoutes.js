const express = require('express');
const router = express.Router();
const portfolioController = require('../controllers/portfolioController');
const analyticsController = require('../controllers/analyticsController');
const { authenticateToken } = require('../middleware/auth');

// All portfolio routes are protected with JWT auth
router.use(authenticateToken);

// Portfolio CRUD
router.get('/', portfolioController.getPortfolios);
router.post('/', portfolioController.createPortfolio);
router.get('/:id', portfolioController.getPortfolio);
router.put('/:id', portfolioController.updatePortfolio);
router.delete('/:id', portfolioController.deletePortfolio);

// Holdings CRUD
router.post('/:id/holdings', portfolioController.addHolding);
router.put('/:id/holdings/:holdingId', portfolioController.updateHolding);
router.delete('/:id/holdings/:holdingId', portfolioController.deleteHolding);

// Analytics & Scenarios
router.post('/:id/analyze', analyticsController.analyzePortfolioEndpoint);
router.post('/:id/scenario', analyticsController.scenarioEndpoint);
router.post('/:id/optimize', analyticsController.optimizeEndpoint);

module.exports = router;

