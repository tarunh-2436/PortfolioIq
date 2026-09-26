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
}));

const app = require('../src/app');

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
