const db = require('../config/db');
const analyticsService = require('../services/analyticsService');
const {
  LIMITS,
  WEIGHT_EPSILON,
  parseText,
  parseTicker,
  parseWeight,
  parseId,
  sumWeights,
} = require('../utils/validation');

// Validate a ticker and pick its exchange (e.g. RELIANCE -> RELIANCE.NS) via the analytics
// service. If the market-data service is down, accept a well-formed ticker unverified rather
// than blocking the user.
async function resolveTicker(rawTicker) {
  const parsed = parseTicker(rawTicker);
  if (parsed.error) return { error: parsed.error };
  try {
    const info = await analyticsService.resolveTicker(parsed.value);
    return { symbol: info.symbol, name: info.name, exchange: info.exchange, region: info.region };
  } catch (err) {
    if (err.status === 404) return { error: err.message };
    console.warn(`Could not verify ticker ${parsed.value}:`, err.message);
    return { symbol: parsed.value, unverified: true };
  }
}

function pct(fraction) {
  return `${(fraction * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

async function getPortfolios(req, res) {
  try {
    const userId = req.user.id;
    const queryText = `
      SELECT p.*, COUNT(h.id)::int as holdings_count
      FROM portfolios p
      LEFT JOIN holdings h ON p.id = h.portfolio_id
      WHERE p.user_id = $1
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;
    const result = await db.query(queryText, [userId]);
    return res.json({ portfolios: result.rows });
  } catch (error) {
    console.error('Error fetching portfolios:', error);
    return res.status(500).json({ error: 'Failed to fetch portfolios.' });
  }
}

async function createPortfolio(req, res) {
  try {
    const userId = req.user.id;
    const { name, description, holdings } = req.body || {};

    const nameCheck = parseText(name, 'Portfolio name', LIMITS.portfolioName);
    if (nameCheck.error) return res.status(400).json({ error: nameCheck.error });
    const descCheck = parseText(description, 'Description', { ...LIMITS.description, required: false });
    if (descCheck.error) return res.status(400).json({ error: descCheck.error });

    // Validate optional initial holdings up front so nothing is half-created
    const validHoldings = [];
    if (holdings !== undefined && holdings !== null) {
      if (!Array.isArray(holdings)) {
        return res.status(400).json({ error: 'Holdings must be a list.' });
      }
      if (holdings.length > LIMITS.maxHoldings) {
        return res.status(400).json({ error: `A portfolio can have at most ${LIMITS.maxHoldings} holdings.` });
      }
      const resolved = await Promise.all(holdings.map((h) => resolveTicker(h && h.ticker)));
      const seen = new Set();
      for (let i = 0; i < holdings.length; i++) {
        const r = resolved[i];
        if (r.error) return res.status(400).json({ error: r.error });
        const w = parseWeight(holdings[i].weight);
        if (w.error) return res.status(400).json({ error: `${r.symbol}: ${w.error}` });
        if (seen.has(r.symbol)) {
          return res.status(400).json({ error: `Duplicate holding: ${r.symbol}.` });
        }
        seen.add(r.symbol);
        validHoldings.push({ ticker: r.symbol, weight: w.value });
      }
      const total = validHoldings.reduce((sum, h) => sum + h.weight, 0);
      if (total > 1 + WEIGHT_EPSILON) {
        return res.status(400).json({ error: `Holding weights total ${pct(total)}, which exceeds 100%.` });
      }
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const portfolioRes = await client.query(
        'INSERT INTO portfolios (user_id, name, description) VALUES ($1, $2, $3) RETURNING *',
        [userId, nameCheck.value, descCheck.value]
      );
      const portfolio = portfolioRes.rows[0];

      const createdHoldings = [];
      for (const h of validHoldings) {
        const holdingRes = await client.query(
          'INSERT INTO holdings (portfolio_id, ticker, weight) VALUES ($1, $2, $3) RETURNING *',
          [portfolio.id, h.ticker, h.weight]
        );
        createdHoldings.push(holdingRes.rows[0]);
      }

      await client.query('COMMIT');
      return res.status(201).json({
        portfolio: { ...portfolio, holdings: createdHoldings },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating portfolio:', error);
    return res.status(500).json({ error: 'Failed to create portfolio.' });
  }
}

async function getPortfolio(req, res) {
  try {
    const userId = req.user.id;
    const idCheck = parseId(req.params.id, 'portfolio ID');
    if (idCheck.error) return res.status(400).json({ error: idCheck.error });
    const portfolioId = idCheck.value;

    const portfolioRes = await db.query(
      'SELECT * FROM portfolios WHERE id = $1 AND user_id = $2',
      [portfolioId, userId]
    );

    if (portfolioRes.rows.length === 0) {
      return res.status(404).json({ error: 'Portfolio not found.' });
    }

    const holdingsRes = await db.query(
      'SELECT * FROM holdings WHERE portfolio_id = $1 ORDER BY weight DESC',
      [portfolioId]
    );

    return res.json({
      portfolio: {
        ...portfolioRes.rows[0],
        holdings: holdingsRes.rows,
      },
    });
  } catch (error) {
    console.error('Error fetching portfolio:', error);
    return res.status(500).json({ error: 'Failed to fetch portfolio.' });
  }
}

async function updatePortfolio(req, res) {
  try {
    const userId = req.user.id;
    const idCheck = parseId(req.params.id, 'portfolio ID');
    if (idCheck.error) return res.status(400).json({ error: idCheck.error });
    const portfolioId = idCheck.value;
    const { name, description } = req.body || {};

    const nameCheck = parseText(name, 'Portfolio name', LIMITS.portfolioName);
    if (nameCheck.error) return res.status(400).json({ error: nameCheck.error });
    const descCheck = parseText(description, 'Description', { ...LIMITS.description, required: false });
    if (descCheck.error) return res.status(400).json({ error: descCheck.error });

    const result = await db.query(
      'UPDATE portfolios SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND user_id = $4 RETURNING *',
      [nameCheck.value, descCheck.value, portfolioId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Portfolio not found.' });
    }

    return res.json({ portfolio: result.rows[0] });
  } catch (error) {
    console.error('Error updating portfolio:', error);
    return res.status(500).json({ error: 'Failed to update portfolio.' });
  }
}

async function deletePortfolio(req, res) {
  try {
    const userId = req.user.id;
    const idCheck = parseId(req.params.id, 'portfolio ID');
    if (idCheck.error) return res.status(400).json({ error: idCheck.error });
    const portfolioId = idCheck.value;

    const result = await db.query(
      'DELETE FROM portfolios WHERE id = $1 AND user_id = $2 RETURNING id',
      [portfolioId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Portfolio not found.' });
    }

    return res.json({ message: 'Portfolio deleted successfully.', id: portfolioId });
  } catch (error) {
    console.error('Error deleting portfolio:', error);
    return res.status(500).json({ error: 'Failed to delete portfolio.' });
  }
}

async function addHolding(req, res) {
  try {
    const userId = req.user.id;
    const idCheck = parseId(req.params.id, 'portfolio ID');
    if (idCheck.error) return res.status(400).json({ error: idCheck.error });
    const portfolioId = idCheck.value;
    const { ticker, weight } = req.body || {};

    const tickerCheck = parseTicker(ticker);
    if (tickerCheck.error) return res.status(400).json({ error: tickerCheck.error });
    const weightCheck = parseWeight(weight);
    if (weightCheck.error) return res.status(400).json({ error: weightCheck.error });

    const portfolioRes = await db.query('SELECT id FROM portfolios WHERE id = $1 AND user_id = $2', [portfolioId, userId]);
    if (portfolioRes.rows.length === 0) {
      return res.status(404).json({ error: 'Portfolio not found.' });
    }

    const existingRes = await db.query('SELECT * FROM holdings WHERE portfolio_id = $1', [portfolioId]);
    const existing = existingRes.rows;

    if (existing.length >= LIMITS.maxHoldings) {
      return res.status(400).json({ error: `A portfolio can have at most ${LIMITS.maxHoldings} holdings.` });
    }

    // Validate the ticker and choose the right exchange (US / NSE / BSE / other)
    const resolved = await resolveTicker(tickerCheck.value);
    if (resolved.error) return res.status(400).json({ error: resolved.error });
    const symbol = resolved.symbol;

    if (existing.some((h) => h.ticker === symbol)) {
      return res.status(400).json({ error: `Holding for ticker ${symbol} already exists in this portfolio.` });
    }

    const used = sumWeights(existing);
    if (used + weightCheck.value > 1 + WEIGHT_EPSILON) {
      return res.status(400).json({
        error: `Adding ${pct(weightCheck.value)} would bring the total to ${pct(used + weightCheck.value)}. Only ${pct(Math.max(0, 1 - used))} is still unallocated.`,
      });
    }

    const result = await db.query(
      'INSERT INTO holdings (portfolio_id, ticker, weight) VALUES ($1, $2, $3) RETURNING *',
      [portfolioId, symbol, weightCheck.value]
    );

    await db.query('UPDATE portfolios SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [portfolioId]);

    return res.status(201).json({
      holding: result.rows[0],
      resolved: {
        symbol,
        name: resolved.name || symbol,
        exchange: resolved.exchange || null,
        region: resolved.region || null,
        changed: symbol !== tickerCheck.value,
        unverified: !!resolved.unverified,
      },
    });
  } catch (error) {
    console.error('Error adding holding:', error);
    return res.status(500).json({ error: 'Failed to add holding.' });
  }
}

async function updateHolding(req, res) {
  try {
    const userId = req.user.id;
    const idCheck = parseId(req.params.id, 'portfolio ID');
    if (idCheck.error) return res.status(400).json({ error: idCheck.error });
    const holdingIdCheck = parseId(req.params.holdingId, 'holding ID');
    if (holdingIdCheck.error) return res.status(400).json({ error: holdingIdCheck.error });
    const portfolioId = idCheck.value;
    const holdingId = holdingIdCheck.value;
    const { weight } = req.body || {};

    const portfolioRes = await db.query('SELECT id FROM portfolios WHERE id = $1 AND user_id = $2', [portfolioId, userId]);
    if (portfolioRes.rows.length === 0) {
      return res.status(404).json({ error: 'Portfolio not found.' });
    }

    if (weight === undefined) {
      return res.status(400).json({ error: 'No update parameters provided.' });
    }
    const weightCheck = parseWeight(weight);
    if (weightCheck.error) return res.status(400).json({ error: weightCheck.error });

    // The new weight plus every other holding must not exceed 100%
    const existingRes = await db.query('SELECT * FROM holdings WHERE portfolio_id = $1', [portfolioId]);
    const others = existingRes.rows.filter((h) => Number(h.id) !== holdingId);
    const used = sumWeights(others);
    if (used + weightCheck.value > 1 + WEIGHT_EPSILON) {
      return res.status(400).json({
        error: `That would bring the total to ${pct(used + weightCheck.value)}. The most this holding can have is ${pct(Math.max(0, 1 - used))}.`,
      });
    }

    const result = await db.query(
      'UPDATE holdings SET weight = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND portfolio_id = $3 RETURNING *',
      [weightCheck.value, holdingId, portfolioId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Holding not found.' });
    }

    await db.query('UPDATE portfolios SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [portfolioId]);

    return res.json({ holding: result.rows[0] });
  } catch (error) {
    console.error('Error updating holding:', error);
    return res.status(500).json({ error: 'Failed to update holding.' });
  }
}

async function deleteHolding(req, res) {
  try {
    const userId = req.user.id;
    const idCheck = parseId(req.params.id, 'portfolio ID');
    if (idCheck.error) return res.status(400).json({ error: idCheck.error });
    const holdingIdCheck = parseId(req.params.holdingId, 'holding ID');
    if (holdingIdCheck.error) return res.status(400).json({ error: holdingIdCheck.error });
    const portfolioId = idCheck.value;
    const holdingId = holdingIdCheck.value;

    const portfolioRes = await db.query('SELECT id FROM portfolios WHERE id = $1 AND user_id = $2', [portfolioId, userId]);
    if (portfolioRes.rows.length === 0) {
      return res.status(404).json({ error: 'Portfolio not found.' });
    }

    const result = await db.query(
      'DELETE FROM holdings WHERE id = $1 AND portfolio_id = $2 RETURNING id',
      [holdingId, portfolioId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Holding not found.' });
    }

    await db.query('UPDATE portfolios SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [portfolioId]);

    return res.json({ message: 'Holding deleted successfully.', id: holdingId });
  } catch (error) {
    console.error('Error deleting holding:', error);
    return res.status(500).json({ error: 'Failed to delete holding.' });
  }
}

module.exports = {
  getPortfolios,
  createPortfolio,
  getPortfolio,
  updatePortfolio,
  deletePortfolio,
  addHolding,
  updateHolding,
  deleteHolding,
};
