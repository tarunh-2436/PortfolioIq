const db = require('../config/db');
const analyticsService = require('../services/analyticsService');
const {
  LIMITS,
  parseId,
  parseTicker,
  parsePortfolioValue,
  parseDomainShocks,
} = require('../utils/validation');

// Returns the portfolio ID if the user owns it; otherwise sends the error response and returns null.
async function loadOwnedPortfolio(req, res) {
  const idCheck = parseId(req.params.id, 'portfolio ID');
  if (idCheck.error) {
    res.status(400).json({ error: idCheck.error });
    return null;
  }
  const portfolioRes = await db.query(
    'SELECT id FROM portfolios WHERE id = $1 AND user_id = $2',
    [idCheck.value, req.user.id]
  );
  if (portfolioRes.rows.length === 0) {
    res.status(404).json({ error: 'Portfolio not found.' });
    return null;
  }
  return idCheck.value;
}

async function analyzePortfolioEndpoint(req, res) {
  try {
    const portfolioId = await loadOwnedPortfolio(req, res);
    if (portfolioId === null) return undefined;

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
    const { scenario, portfolio_value, custom_shocks } = req.body || {};

    if (scenario !== undefined && scenario !== null && typeof scenario !== 'string') {
      return res.status(400).json({ error: 'Scenario must be a scenario ID.' });
    }
    const valueCheck = parsePortfolioValue(portfolio_value === undefined ? 1000000 : portfolio_value);
    if (valueCheck.error) return res.status(400).json({ error: valueCheck.error });
    const shocksCheck = parseDomainShocks(custom_shocks);
    if (shocksCheck.error) return res.status(400).json({ error: shocksCheck.error });
    if (!scenario && Object.keys(shocksCheck.value).length === 0) {
      return res.status(400).json({ error: 'Choose a scenario or enter at least one domain shock.' });
    }

    const portfolioId = await loadOwnedPortfolio(req, res);
    if (portfolioId === null) return undefined;

    const holdingsRes = await db.query(
      'SELECT ticker, weight FROM holdings WHERE portfolio_id = $1',
      [portfolioId]
    );

    if (holdingsRes.rows.length === 0) {
      return res.status(400).json({ error: 'Cannot run scenario on an empty portfolio.' });
    }

    const scenarioResult = await analyticsService.runScenario(
      holdingsRes.rows,
      valueCheck.value,
      scenario,
      shocksCheck.value
    );

    try {
      await db.query(
        'INSERT INTO scenario_runs (portfolio_id, scenario_type, portfolio_value, result) VALUES ($1, $2, $3, $4)',
        [portfolioId, scenario || 'custom', valueCheck.value, JSON.stringify(scenarioResult)]
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
    const portfolioId = await loadOwnedPortfolio(req, res);
    if (portfolioId === null) return undefined;

    const holdingsRes = await db.query(
      'SELECT ticker, weight FROM holdings WHERE portfolio_id = $1',
      [portfolioId]
    );
    const holdings = holdingsRes.rows;

    let { tickers } = req.body || {};
    if (tickers === undefined || tickers === null || (Array.isArray(tickers) && tickers.length === 0)) {
      tickers = holdings.map((h) => h.ticker);
    }
    if (!Array.isArray(tickers)) {
      return res.status(400).json({ error: 'Tickers must be a list.' });
    }
    if (tickers.length > LIMITS.maxHoldings) {
      return res.status(400).json({ error: `Optimization supports at most ${LIMITS.maxHoldings} tickers.` });
    }

    const cleaned = [];
    for (const raw of tickers) {
      const t = parseTicker(raw);
      if (t.error) return res.status(400).json({ error: t.error });
      if (!cleaned.includes(t.value)) cleaned.push(t.value);
    }
    if (cleaned.length < 2) {
      return res.status(400).json({ error: 'Optimization requires at least two distinct tickers.' });
    }

    // Current weights let the optimizer explain what changes versus the existing portfolio
    const currentWeights = {};
    for (const h of holdings) {
      if (cleaned.includes(h.ticker)) currentWeights[h.ticker] = parseFloat(h.weight);
    }

    const optimizationResult = await analyticsService.optimizePortfolio(
      cleaned,
      Object.keys(currentWeights).length > 0 ? currentWeights : undefined
    );
    return res.json(optimizationResult);
  } catch (error) {
    console.error('Error in optimize endpoint:', error.message);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Failed to optimize portfolio.' });
  }
}

// Holdings grouped into investment domains (used to build the per-domain shock inputs)
async function domainsEndpoint(req, res) {
  try {
    const portfolioId = await loadOwnedPortfolio(req, res);
    if (portfolioId === null) return undefined;

    const holdingsRes = await db.query(
      'SELECT ticker, weight FROM holdings WHERE portfolio_id = $1',
      [portfolioId]
    );
    if (holdingsRes.rows.length === 0) {
      return res.json({ domains: [] });
    }
    const result = await analyticsService.classifyPortfolio(holdingsRes.rows);
    return res.json(result);
  } catch (error) {
    console.error('Error in domains endpoint:', error.message);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Failed to classify holdings.' });
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
  domainsEndpoint,
  getScenarioTypesEndpoint,
};

