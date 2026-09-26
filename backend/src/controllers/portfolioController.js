const db = require('../config/db');

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
    const { name, description, holdings } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Portfolio name is required.' });
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const portfolioRes = await client.query(
        'INSERT INTO portfolios (user_id, name, description) VALUES ($1, $2, $3) RETURNING *',
        [userId, name.trim(), description ? description.trim() : null]
      );
      const portfolio = portfolioRes.rows[0];

      let createdHoldings = [];
      if (Array.isArray(holdings) && holdings.length > 0) {
        for (const h of holdings) {
          if (!h.ticker || !h.weight || h.weight <= 0) continue;
          const tickerUpper = h.ticker.trim().toUpperCase();
          const holdingRes = await client.query(
            'INSERT INTO holdings (portfolio_id, ticker, weight) VALUES ($1, $2, $3) RETURNING *',
            [portfolio.id, tickerUpper, parseFloat(h.weight)]
          );
          createdHoldings.push(holdingRes.rows[0]);
        }
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
    const portfolioId = parseInt(req.params.id, 10);

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
    const portfolioId = parseInt(req.params.id, 10);
    const { name, description } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Portfolio name is required.' });
    }

    const result = await db.query(
      'UPDATE portfolios SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND user_id = $4 RETURNING *',
      [name.trim(), description ? description.trim() : null, portfolioId, userId]
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
    const portfolioId = parseInt(req.params.id, 10);

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
    const portfolioId = parseInt(req.params.id, 10);
    const { ticker, weight } = req.body;

    if (!ticker || !weight || parseFloat(weight) <= 0 || parseFloat(weight) > 1) {
      return res.status(400).json({ error: 'Valid ticker and weight (0 < weight <= 1) are required.' });
    }

    const portfolioRes = await db.query('SELECT id FROM portfolios WHERE id = $1 AND user_id = $2', [portfolioId, userId]);
    if (portfolioRes.rows.length === 0) {
      return res.status(404).json({ error: 'Portfolio not found.' });
    }

    const tickerUpper = ticker.trim().toUpperCase();

    // Check duplicate
    const existing = await db.query('SELECT id FROM holdings WHERE portfolio_id = $1 AND ticker = $2', [portfolioId, tickerUpper]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: `Holding for ticker ${tickerUpper} already exists in this portfolio.` });
    }

    const result = await db.query(
      'INSERT INTO holdings (portfolio_id, ticker, weight) VALUES ($1, $2, $3) RETURNING *',
      [portfolioId, tickerUpper, parseFloat(weight)]
    );

    await db.query('UPDATE portfolios SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [portfolioId]);

    return res.status(201).json({ holding: result.rows[0] });
  } catch (error) {
    console.error('Error adding holding:', error);
    return res.status(500).json({ error: 'Failed to add holding.' });
  }
}

async function updateHolding(req, res) {
  try {
    const userId = req.user.id;
    const portfolioId = parseInt(req.params.id, 10);
    const holdingId = parseInt(req.params.holdingId, 10);
    const { weight, ticker } = req.body;

    const portfolioRes = await db.query('SELECT id FROM portfolios WHERE id = $1 AND user_id = $2', [portfolioId, userId]);
    if (portfolioRes.rows.length === 0) {
      return res.status(404).json({ error: 'Portfolio not found.' });
    }

    const updates = [];
    const params = [];
    let paramIdx = 1;

    if (weight !== undefined) {
      const w = parseFloat(weight);
      if (isNaN(w) || w <= 0 || w > 1) {
        return res.status(400).json({ error: 'Weight must be between 0 and 1.' });
      }
      updates.push(`weight = $${paramIdx++}`);
      params.push(w);
    }

    if (ticker) {
      updates.push(`ticker = $${paramIdx++}`);
      params.push(ticker.trim().toUpperCase());
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No update parameters provided.' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(holdingId, portfolioId);

    const queryText = `
      UPDATE holdings
      SET ${updates.join(', ')}
      WHERE id = $${paramIdx++} AND portfolio_id = $${paramIdx++}
      RETURNING *
    `;

    const result = await db.query(queryText, params);
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
    const portfolioId = parseInt(req.params.id, 10);
    const holdingId = parseInt(req.params.holdingId, 10);

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

