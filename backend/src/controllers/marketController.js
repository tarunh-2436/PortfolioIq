const analyticsService = require('../services/analyticsService');
const { parseTicker } = require('../utils/validation');

const REGIONS = ['auto', 'us', 'india', 'global'];

// GET /api/market/search?q=apple&region=auto - find tickers by company name
async function searchEndpoint(req, res) {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const region = typeof req.query.region === 'string' ? req.query.region.toLowerCase() : 'auto';

    if (q.length < 1) return res.status(400).json({ error: 'Enter a company name or ticker to search.' });
    if (q.length > 60) return res.status(400).json({ error: 'Search text is too long.' });
    if (!REGIONS.includes(region)) {
      return res.status(400).json({ error: `Region must be one of: ${REGIONS.join(', ')}.` });
    }

    const data = await analyticsService.searchTickers(q, region);
    return res.json(data);
  } catch (error) {
    const status = error.status === 503 ? 503 : 502;
    return res.status(status).json({ error: 'Ticker search is temporarily unavailable.', results: [] });
  }
}

// GET /api/market/resolve?symbol=RELIANCE - validate a ticker and pick its exchange
async function resolveEndpoint(req, res) {
  const parsed = parseTicker(req.query.symbol);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  try {
    const data = await analyticsService.resolveTicker(parsed.value);
    return res.json(data);
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Could not validate ticker.' });
  }
}

module.exports = { searchEndpoint, resolveEndpoint };
