const db = require('../config/db');
const analyticsService = require('../services/analyticsService');

async function analyzePortfolioEndpoint(req, res) {
  try {
    const userId = req.user.id;
    const portfolioId = parseInt(req.params.id, 10);

    // Verify portfolio ownership
    const portfolioRes = await db.query(
      'SELECT id, name FROM portfolios WHERE id = $1 AND user_id = $2',
      [portfolioId, userId]
    );

    if (portfolioRes.rows.length === 0) {
      return res.status(404).json({ error: 'Portfolio not found.' });
    }

    // Fetch holdings
    const holdingsRes = await db.query(
      'SELECT ticker, weight FROM holdings WHERE portfolio_id = $1 ORDER BY id ASC',
      [portfolioId]
    );

    if (holdingsRes.rows.length === 0) {
      return res.status(400).json({ error: 'Cannot analyze an empty portfolio. Add holdings first.' });
    }

    const holdings = holdingsRes.rows.map((h) => ({
      ticker: h.ticker,
      weight: parseFloat(h.weight),
    }));

    // Call Python FastAPI service
    const analyticsResult = await analyticsService.analyzePortfolio(holdings);

    // Optionally record run in database (ignore non-fatal db save error)
    try {
      await db.query(
        'INSERT INTO analysis_runs (portfolio_id, result) VALUES ($1, $2)',
        [portfolioId, JSON.stringify(analyticsResult)]
      );
    } catch (dbErr) {
      console.warn('Could not store analysis_run in db:', dbErr.message);
    }

    return res.json(analyticsResult);
  } catch (error) {
    console.error('Error in analyze endpoint:', error.message);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Failed to analyze portfolio.' });
  }
}

async function scenarioEndpoint(req, res) {
  try {
    const userId = req.user.id;
    const portfolioId = parseInt(req.params.id, 10);
    const { scenario, portfolio_value, custom_shocks } = req.body;

    const portfolioRes = await db.query(
      'SELECT id FROM portfolios WHERE id = $1 AND user_id = $2',
      [portfolioId, userId]
    );

    if (portfolioRes.rows.length === 0) {
      return res.status(404).json({ error: 'Portfolio not found.' });
    }

    const holdingsRes = await db.query(
      'SELECT ticker, weight FROM holdings WHERE portfolio_id = $1',
      [portfolioId]
    );

    if (holdingsRes.rows.length === 0) {
      return res.status(400).json({ error: 'Cannot run scenario on an empty portfolio.' });
    }

    const scenarioResult = await analyticsService.runScenario(
      holdingsRes.rows,
      portfolio_value || 1000000,
      scenario,
      custom_shocks
    );

    try {
      await db.query(
        'INSERT INTO scenario_runs (portfolio_id, scenario_type, portfolio_value, result) VALUES ($1, $2, $3, $4)',
        [portfolioId, scenario || 'custom', portfolio_value || 1000000, JSON.stringify(scenarioResult)]
      );
    } catch (dbErr) {
      console.warn('Could not store scenario_run in db:', dbErr.message);
    }

    return res.json(scenarioResult);
  } catch (error) {
    console.error('Error in scenario endpoint:', error.message);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Failed to run scenario simulation.' });
  }
}

async function optimizeEndpoint(req, res) {
  try {
    const userId = req.user.id;
    const portfolioId = parseInt(req.params.id, 10);
    let { tickers } = req.body;

    // If tickers not explicitly passed, load from portfolio holdings
    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      const portfolioRes = await db.query(
        'SELECT id FROM portfolios WHERE id = $1 AND user_id = $2',
        [portfolioId, userId]
      );

      if (portfolioRes.rows.length === 0) {
        return res.status(404).json({ error: 'Portfolio not found.' });
      }

      const holdingsRes = await db.query(
        'SELECT ticker FROM holdings WHERE portfolio_id = $1',
        [portfolioId]
      );

      tickers = holdingsRes.rows.map((h) => h.ticker);
    }

    if (!tickers || tickers.length < 2) {
      return res.status(400).json({ error: 'Optimization requires at least two distinct tickers.' });
    }

    const optimizationResult = await analyticsService.optimizePortfolio(tickers);
    return res.json(optimizationResult);
  } catch (error) {
    console.error('Error in optimize endpoint:', error.message);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Failed to optimize portfolio.' });
  }
}

async function getScenarioTypesEndpoint(req, res) {
  try {
    const data = await analyticsService.getScenarioTypes();
    return res.json(data);
  } catch (error) {
    return res.json({ scenarios: [] });
  }
}

module.exports = {
  analyzePortfolioEndpoint,
  scenarioEndpoint,
  optimizeEndpoint,
  getScenarioTypesEndpoint,
};

