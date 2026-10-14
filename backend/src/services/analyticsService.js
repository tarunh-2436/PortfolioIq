const axios = require('axios');

const ANALYTICS_SERVICE_URL = process.env.ANALYTICS_SERVICE_URL || 'http://localhost:8000';

// Market-data calls (Yahoo Finance) and LLM commentary can be slow, so allow a generous default.
const client = axios.create({
  baseURL: ANALYTICS_SERVICE_URL,
  timeout: 90000,
});

// Turn an axios failure into an Error carrying an HTTP status for the controllers.
function toError(error, fallbackMessage) {
  if (error.response) {
    const detail = error.response.data?.detail;
    const message = typeof detail === 'string' ? detail : fallbackMessage;
    const err = new Error(message);
    err.status = error.response.status;
    return err;
  }
  const err = new Error('Analytics engine is unavailable.');
  err.status = 503;
  return err;
}

async function call(fn, fallbackMessage) {
  try {
    const response = await fn();
    return response.data;
  } catch (error) {
    throw toError(error, fallbackMessage);
  }
}

function analyzePortfolio(portfolioHoldings) {
  const payload = {
    portfolio: portfolioHoldings.map((h) => ({
      ticker: h.ticker,
      weight: parseFloat(h.weight),
    })),
  };
  return call(() => client.post('/analyze', payload), 'Analytics engine request failed.');
}

// domainShocks: { "Technology": -0.2 } (fractions). scenario: id of a predefined scenario.
function runScenario(portfolioHoldings, portfolioValue, scenario, domainShocks) {
  const payload = {
    portfolio: portfolioHoldings.map((h) => ({
      ticker: h.ticker,
      weight: parseFloat(h.weight),
    })),
    portfolio_value: parseFloat(portfolioValue || 1000000),
    scenario: scenario || undefined,
    domain_shocks: !scenario && domainShocks ? domainShocks : undefined,
  };
  return call(() => client.post('/scenario', payload), 'Scenario simulation request failed.');
}

function optimizePortfolio(tickers, currentWeights) {
  const payload = { tickers, current_weights: currentWeights || undefined };
  return call(() => client.post('/optimize', payload), 'Portfolio optimization request failed.');
}

async function getScenarioTypes() {
  try {
    const response = await client.get('/scenario/types');
    return response.data;
  } catch (error) {
    return { scenarios: [] };
  }
}

function classifyPortfolio(portfolioHoldings) {
  const payload = {
    portfolio: portfolioHoldings.map((h) => ({
      ticker: h.ticker,
      weight: parseFloat(h.weight),
    })),
  };
  return call(() => client.post('/classify', payload), 'Could not classify holdings.');
}

function searchTickers(q, region) {
  return call(
    () => client.get('/search', { params: { q, region: region || 'auto' }, timeout: 20000 }),
    'Ticker search failed.'
  );
}

function resolveTicker(symbol) {
  return call(
    () => client.get('/resolve', { params: { symbol }, timeout: 30000 }),
    'Could not validate ticker.'
  );
}

module.exports = {
  analyzePortfolio,
  runScenario,
  optimizePortfolio,
  getScenarioTypes,
  classifyPortfolio,
  searchTickers,
  resolveTicker,
};
