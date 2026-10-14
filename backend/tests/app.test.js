const request = require('supertest');

// Set env to test before requiring app
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_12345';

// Mock database pool
jest.mock('../src/config/db', () => {
  const users = [];
  const portfolios = [];
  const holdings = [];

  return {
    query: jest.fn(async (text, params) => {
      const lower = text.toLowerCase();

      // Auth queries
      if (lower.includes('select id from users where email =')) {
        const found = users.find((u) => u.email === params[0]);
        return { rows: found ? [found] : [] };
      }
      if (lower.includes('insert into users')) {
        const newUser = {
          id: users.length + 1,
          name: params[0],
          email: params[1],
          password_hash: params[2],
          created_at: new Date().toISOString(),
        };
        users.push(newUser);
        return { rows: [newUser] };
      }
      if (lower.includes('select * from users where email =')) {
        const found = users.find((u) => u.email === params[0]);
        return { rows: found ? [found] : [] };
      }
      if (lower.includes('select id, name, email, created_at from users where id =')) {
        const found = users.find((u) => u.id === params[0]);
        return { rows: found ? [found] : [] };
      }

      // Portfolio queries
      if (lower.includes('select p.*, count(h.id)')) {
        return {
          rows: portfolios.map((p) => ({
            ...p,
            holdings_count: holdings.filter((h) => h.portfolio_id === p.id).length,
          })),
        };
      }
      if (lower.includes('insert into portfolios')) {
        const newP = {
          id: portfolios.length + 1,
          user_id: params[0],
          name: params[1],
          description: params[2],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        portfolios.push(newP);
        return { rows: [newP] };
      }
      if (lower.includes('from portfolios where id =')) {
        const found = portfolios.find((p) => p.id === params[0] && p.user_id === params[1]);
        return { rows: found ? [found] : [] };
      }
      if (lower.includes('from portfolios where id =')) {
        const found = portfolios.find((p) => p.id === params[0] && p.user_id === params[1]);
        return { rows: found ? [found] : [] };
      }

      // Holdings queries
      if (lower.includes('select * from holdings where portfolio_id =')) {
        return { rows: holdings.filter((h) => h.portfolio_id === params[0]) };
      }
      if (lower.includes('select ticker, weight from holdings')) {
        return { rows: holdings.filter((h) => h.portfolio_id === params[0]) };
      }
      if (lower.includes('select id from holdings where portfolio_id =')) {
        const found = holdings.find((h) => h.portfolio_id === params[0] && h.ticker === params[1]);
        return { rows: found ? [found] : [] };
      }
      if (lower.includes('insert into holdings')) {
        const newH = {
          id: holdings.length + 1,
          portfolio_id: params[0],
          ticker: params[1],
          weight: params[2],
          created_at: new Date().toISOString(),
        };
        holdings.push(newH);
        return { rows: [newH] };
      }
      if (lower.includes('update holdings set')) {
        const h = holdings.find((x) => x.id === params[1] && x.portfolio_id === params[2]);
        if (h) h.weight = params[0];
        return { rows: h ? [h] : [] };
      }

      return { rows: [] };
    }),
    pool: {
      connect: jest.fn(async () => ({
        query: jest.fn(async (text, params) => {
          const lower = text.toLowerCase();
          if (lower.includes('insert into portfolios')) {
            const newP = {
              id: portfolios.length + 1,
              user_id: params[0],
              name: params[1],
              description: params[2],
            };
            portfolios.push(newP);
            return { rows: [newP] };
          }
          if (lower.includes('insert into holdings')) {
            const newH = {
              id: holdings.length + 1,
              portfolio_id: params[0],
              ticker: params[1],
              weight: params[2],
            };
            holdings.push(newH);
            return { rows: [newH] };
          }
          return { rows: [] };
        }),
        release: jest.fn(),
      })),
    },
  };
});

// Mock analytics service
jest.mock('../src/services/analyticsService', () => ({
  analyzePortfolio: jest.fn(async () => ({
    metrics: { annual_return: 12.5, volatility: 18.2, sharpe_ratio: 0.65, beta: 1.05, max_drawdown: -14.2 },
    health: { score: 78.5 },
    holdings: [{ ticker: 'AAPL', weight: 60.0 }, { ticker: 'MSFT', weight: 40.0 }],
  })),
  runScenario: jest.fn(async () => ({
    initial_value: 1000000,
    final_value: 850000,
    absolute_change: -150000,
    percentage_change: -15.0,
  })),
  optimizePortfolio: jest.fn(async () => ({
    weights: { AAPL: 0.5, MSFT: 0.5 },
    expected_return: 14.2,
    volatility: 16.5,
    sharpe_ratio: 0.82,
  })),
  getScenarioTypes: jest.fn(async () => ({
    scenarios: [{ id: 'market_crash', name: 'Market Crash' }],
  })),
  classifyPortfolio: jest.fn(async () => ({
    domains: [{ domain: 'Technology', weight: 1, holdings_count: 2 }],
  })),
  searchTickers: jest.fn(async () => ({
    results: [{ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', region: 'US', recommended: true }],
  })),
  resolveTicker: jest.fn(async (symbol) => {
    if (symbol === 'ZZZZ') {
      const err = new Error("Ticker 'ZZZZ' was not found on any supported exchange.");
      err.status = 404;
      throw err;
    }
    if (symbol === 'DOWN') {
      const err = new Error('Analytics engine is unavailable.');
      err.status = 503;
      throw err;
    }
    if (symbol === 'RELIANCE') {
      return { symbol: 'RELIANCE.NS', name: 'Reliance Industries', exchange: 'NSE India', region: 'India' };
    }
    return { symbol, name: symbol, exchange: 'NASDAQ', region: 'US' };
  }),
}));

const app = require('../src/app');
const analyticsService = require('../src/services/analyticsService');

describe('Node/Express Backend API Suite', () => {
  let authToken = '';

  test('GET /health returns 200 healthy', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });


  test('POST /api/auth/register creates a user and returns token', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Test Investor',
      email: 'investor@test.com',
      password: 'securepassword123',
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('investor@test.com');
    authToken = res.body.token;
  });

  test('POST /api/auth/login authenticates user', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'investor@test.com',
      password: 'securepassword123',
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('GET /api/auth/me returns user profile', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Test Investor');
  });

  test('Protected endpoint without token returns 401', async () => {
    const res = await request(app).get('/api/portfolios');
    expect(res.status).toBe(401);
  });

  test('POST /api/portfolios creates portfolio', async () => {
    const res = await request(app)
      .post('/api/portfolios')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Growth Tech',
        description: 'Tech holdings',
        holdings: [
          { ticker: 'AAPL', weight: 0.6 },
          { ticker: 'MSFT', weight: 0.4 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.portfolio.name).toBe('Growth Tech');
  });

  test('POST /api/portfolios/:id/analyze proxies call to FastAPI', async () => {
    const res = await request(app)
      .post('/api/portfolios/1/analyze')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.metrics.annual_return).toBe(12.5);
  });

  test('POST /api/portfolios/:id/scenario proxies scenario calculation', async () => {
    const res = await request(app)
      .post('/api/portfolios/1/scenario')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ scenario: 'market_crash', portfolio_value: 1000000 });
    expect(res.status).toBe(200);
    expect(res.body.final_value).toBe(850000);
  });

  test('POST /api/portfolios/:id/optimize proxies optimization', async () => {
    const res = await request(app)
      .post('/api/portfolios/1/optimize')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ tickers: ['AAPL', 'MSFT'] });
    expect(res.status).toBe(200);
    expect(res.body.weights.AAPL).toBe(0.5);
  });
});

describe('Input validation, ticker resolution and domain features', () => {
  let token = '';
  let emptyPortfolioId = 0;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const reg = await request(app).post('/api/auth/register').send({
      name: 'Validation User',
      email: 'validation@test.com',
      password: 'secret123',
    });
    token = reg.body.token;
    const created = await request(app)
      .post('/api/portfolios')
      .set(auth())
      .send({ name: 'Empty one' });
    emptyPortfolioId = created.body.portfolio.id;
  });

  beforeEach(() => jest.clearAllMocks());

  describe('auth input', () => {
    test('rejects malformed email, short name and over-long password', async () => {
      const base = { name: 'Valid Name', email: 'ok@test.com', password: 'secret123' };
      let res = await request(app).post('/api/auth/register').send({ ...base, email: 'not-an-email' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/valid email/i);

      res = await request(app).post('/api/auth/register').send({ ...base, name: 'A' });
      expect(res.status).toBe(400);

      res = await request(app).post('/api/auth/register').send({ ...base, password: 'x'.repeat(129) });
      expect(res.status).toBe(400);

      res = await request(app).post('/api/auth/register').send({ ...base, password: 'short' });
      expect(res.status).toBe(400);
    });

    test('login rejects non-string credentials instead of crashing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: { $ne: null }, password: ['a'] });
      expect(res.status).toBe(400);
    });
  });

  describe('holdings', () => {
    test('picks the right exchange automatically (RELIANCE -> RELIANCE.NS)', async () => {
      const res = await request(app)
        .post(`/api/portfolios/${emptyPortfolioId}/holdings`)
        .set(auth())
        .send({ ticker: 'reliance', weight: 0.3 });
      expect(res.status).toBe(201);
      expect(res.body.holding.ticker).toBe('RELIANCE.NS');
      expect(res.body.resolved).toMatchObject({ symbol: 'RELIANCE.NS', exchange: 'NSE India', changed: true });
    });

    test('rejects invalid ticker format, unknown tickers and bad weights', async () => {
      const url = `/api/portfolios/${emptyPortfolioId}/holdings`;
      let res = await request(app).post(url).set(auth()).send({ ticker: 'bad ticker!', weight: 0.1 });
      expect(res.status).toBe(400);

      res = await request(app).post(url).set(auth()).send({ ticker: 'ZZZZ', weight: 0.1 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not found/i);

      for (const weight of [0, -0.2, 1.5, 'abc', null, true]) {
        res = await request(app).post(url).set(auth()).send({ ticker: 'AAPL', weight });
        expect(res.status).toBe(400);
      }
    });

    test('accepts a well-formed ticker when the market data service is down', async () => {
      const res = await request(app)
        .post(`/api/portfolios/${emptyPortfolioId}/holdings`)
        .set(auth())
        .send({ ticker: 'down', weight: 0.1 });
      expect(res.status).toBe(201);
      expect(res.body.resolved.unverified).toBe(true);
    });

    test('rejects duplicates and totals above 100%', async () => {
      const url = `/api/portfolios/${emptyPortfolioId}/holdings`;
      // RELIANCE.NS (0.3) and DOWN (0.1) exist already
      let res = await request(app).post(url).set(auth()).send({ ticker: 'RELIANCE', weight: 0.1 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already exists/i);

      res = await request(app).post(url).set(auth()).send({ ticker: 'MSFT', weight: 0.7 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/unallocated/i);

      res = await request(app).post(url).set(auth()).send({ ticker: 'MSFT', weight: 0.6 });
      expect(res.status).toBe(201);
    });

    test('editing a weight cannot push the total above 100%', async () => {
      const list = await request(app).get(`/api/portfolios/${emptyPortfolioId}`).set(auth());
      const first = list.body.portfolio.holdings[0];
      let res = await request(app)
        .put(`/api/portfolios/${emptyPortfolioId}/holdings/${first.id}`)
        .set(auth())
        .send({ weight: 0.95 });
      expect(res.status).toBe(400);

      res = await request(app)
        .put(`/api/portfolios/${emptyPortfolioId}/holdings/${first.id}`)
        .set(auth())
        .send({ weight: 0.2 });
      expect(res.status).toBe(200);
    });

    test('malformed IDs are a 400, not a crash', async () => {
      const res = await request(app).get('/api/portfolios/abc').set(auth());
      expect(res.status).toBe(400);
    });

    test('creating a portfolio validates name and initial holdings', async () => {
      let res = await request(app).post('/api/portfolios').set(auth()).send({ name: '   ' });
      expect(res.status).toBe(400);

      res = await request(app)
        .post('/api/portfolios')
        .set(auth())
        .send({ name: 'x'.repeat(101) });
      expect(res.status).toBe(400);

      res = await request(app)
        .post('/api/portfolios')
        .set(auth())
        .send({
          name: 'Over',
          holdings: [
            { ticker: 'AAPL', weight: 0.7 },
            { ticker: 'MSFT', weight: 0.7 },
          ],
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/exceeds 100%/);

      res = await request(app)
        .post('/api/portfolios')
        .set(auth())
        .send({
          name: 'Dupes',
          holdings: [
            { ticker: 'AAPL', weight: 0.3 },
            { ticker: 'aapl', weight: 0.3 },
          ],
        });
      expect(res.status).toBe(400);
    });
  });

  describe('scenarios', () => {
    test('requires a scenario or at least one domain shock', async () => {
      const res = await request(app)
        .post(`/api/portfolios/${emptyPortfolioId}/scenario`)
        .set(auth())
        .send({ portfolio_value: 1000 });
      expect(res.status).toBe(400);
    });

    test('rejects out-of-range shocks and bad portfolio values', async () => {
      const url = `/api/portfolios/${emptyPortfolioId}/scenario`;
      let res = await request(app).post(url).set(auth()).send({ custom_shocks: { Technology: -2 } });
      expect(res.status).toBe(400);

      res = await request(app).post(url).set(auth()).send({ custom_shocks: { Technology: 'abc' } });
      expect(res.status).toBe(400);

      res = await request(app)
        .post(url)
        .set(auth())
        .send({ scenario: 'market_crash', portfolio_value: -5 });
      expect(res.status).toBe(400);

      res = await request(app)
        .post(url)
        .set(auth())
        .send({ scenario: 'market_crash', portfolio_value: 1e15 });
      expect(res.status).toBe(400);
    });

    test('forwards custom domain shocks to the analytics engine', async () => {
      const res = await request(app)
        .post(`/api/portfolios/${emptyPortfolioId}/scenario`)
        .set(auth())
        .send({ custom_shocks: { Technology: -0.2 }, portfolio_value: 50000 });
      expect(res.status).toBe(200);
      const args = analyticsService.runScenario.mock.calls[0];
      expect(args[1]).toBe(50000);
      expect(args[2]).toBeUndefined();
      expect(args[3]).toEqual({ Technology: -0.2 });
    });

    test('GET domains returns holdings grouped by domain', async () => {
      const res = await request(app).get(`/api/portfolios/${emptyPortfolioId}/domains`).set(auth());
      expect(res.status).toBe(200);
      expect(res.body.domains[0].domain).toBe('Technology');
    });

    test("GET domains for someone else's portfolio is a 404", async () => {
      const res = await request(app).get('/api/portfolios/9999/domains').set(auth());
      expect(res.status).toBe(404);
    });
  });

  describe('optimizer', () => {
    test('passes current weights so the engine can explain the changes', async () => {
      const res = await request(app)
        .post(`/api/portfolios/${emptyPortfolioId}/optimize`)
        .set(auth())
        .send({ tickers: ['RELIANCE.NS', 'msft'] });
      expect(res.status).toBe(200);
      const [tickers, current] = analyticsService.optimizePortfolio.mock.calls[0];
      expect(tickers).toEqual(['RELIANCE.NS', 'MSFT']);
      expect(current['RELIANCE.NS']).toBe(0.2);
    });

    test('validates tickers and requires two distinct ones', async () => {
      const url = `/api/portfolios/${emptyPortfolioId}/optimize`;
      let res = await request(app).post(url).set(auth()).send({ tickers: ['AAPL', 'AAPL'] });
      expect(res.status).toBe(400);

      res = await request(app).post(url).set(auth()).send({ tickers: ['AAPL', 'not valid!'] });
      expect(res.status).toBe(400);

      res = await request(app).post(url).set(auth()).send({ tickers: 'AAPL,MSFT' });
      expect(res.status).toBe(400);
    });

    test("cannot optimise through someone else's portfolio", async () => {
      const res = await request(app)
        .post('/api/portfolios/9999/optimize')
        .set(auth())
        .send({ tickers: ['AAPL', 'MSFT'] });
      expect(res.status).toBe(404);
    });
  });

  describe('market search', () => {
    test('requires authentication', async () => {
      const res = await request(app).get('/api/market/search?q=apple');
      expect(res.status).toBe(401);
    });

    test('returns matches and validates input', async () => {
      let res = await request(app).get('/api/market/search?q=apple').set(auth());
      expect(res.status).toBe(200);
      expect(res.body.results[0].symbol).toBe('AAPL');
      expect(analyticsService.searchTickers).toHaveBeenCalledWith('apple', 'auto');

      res = await request(app).get('/api/market/search').set(auth());
      expect(res.status).toBe(400);

      res = await request(app).get('/api/market/search?q=apple&region=mars').set(auth());
      expect(res.status).toBe(400);

      res = await request(app).get(`/api/market/search?q=${'x'.repeat(80)}`).set(auth());
      expect(res.status).toBe(400);
    });

    test('resolve endpoint validates and maps unknown tickers to 404', async () => {
      let res = await request(app).get('/api/market/resolve?symbol=reliance').set(auth());
      expect(res.status).toBe(200);
      expect(res.body.symbol).toBe('RELIANCE.NS');

      res = await request(app).get('/api/market/resolve?symbol=ZZZZ').set(auth());
      expect(res.status).toBe(404);

      res = await request(app).get('/api/market/resolve?symbol=bad%20one!').set(auth());
      expect(res.status).toBe(400);
    });
  });
});
