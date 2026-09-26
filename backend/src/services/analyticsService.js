const axios = require('axios');

const ANALYTICS_SERVICE_URL = process.env.ANALYTICS_SERVICE_URL || 'http://localhost:8000';

const client = axios.create({
  baseURL: ANALYTICS_SERVICE_URL,
  timeout: 30000,
});

async function analyzePortfolio(portfolioHoldings) {
  try {
    const payload = {
      portfolio: portfolioHoldings.map((h) => ({
        ticker: h.ticker,
        weight: parseFloat(h.weight),
      })),
    };
    const response = await client.post('/analyze', payload);
    return response.data;
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const detail = error.response.data?.detail || 'Analytics engine request failed.';
      const err = new Error(detail);
      err.status = status;
      throw err;
    }
    const err = new Error('Analytics engine is unavailable.');
    err.status = 503;
    throw err;
  }
}

async function runScenario(portfolioHoldings, portfolioValue, scenario, customShocks) {
  try {
    const payload = {
      portfolio: portfolioHoldings.map((h) => ({
        ticker: h.ticker,
        weight: parseFloat(h.weight),
        shock: customShocks && customShocks[h.ticker] !== undefined ? parseFloat(customShocks[h.ticker]) : (h.shock || 0),
      })),
      portfolio_value: parseFloat(portfolioValue || 1000000),
      scenario: scenario || undefined,
    };
    const response = await client.post('/scenario', payload);
    return response.data;
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const detail = error.response.data?.detail || 'Scenario simulation request failed.';
      const err = new Error(detail);
      err.status = status;
      throw err;
    }
    const err = new Error('Analytics engine is unavailable.');
    err.status = 503;
    throw err;
  }
}

async function optimizePortfolio(tickers) {
  try {
    const payload = { tickers };
    const response = await client.post('/optimize', payload);
    return response.data;
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const detail = error.response.data?.detail || 'Portfolio optimization request failed.';
      const err = new Error(detail);
      err.status = status;
      throw err;
    }
    const err = new Error('Analytics engine is unavailable.');
    err.status = 503;
    throw err;
  }
}

async function getScenarioTypes() {
  try {
    const response = await client.get('/scenario/types');
    return response.data;
  } catch (error) {
    return { scenarios: [] };
  }
}


module.exports = {
  analyzePortfolio,
  runScenario,
  optimizePortfolio,
  getScenarioTypes,
};
