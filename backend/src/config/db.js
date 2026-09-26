const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'portfolioiq',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 1500,
});

// In-Memory Database Store Fallback (used when PostgreSQL is not running)
let useInMemory = false;

const memoryStore = {
  users: [
    {
      id: 1,
      name: 'Demo Investor',
      email: 'demo@portfolioiq.com',
      password_hash: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', // password123
      created_at: new Date().toISOString(),
    },
  ],
  portfolios: [
    {
      id: 1,
      user_id: 1,
      name: 'Tech & Growth Portfolio',
      description: 'Diversified core technology and market leaders',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  holdings: [
    { id: 1, portfolio_id: 1, ticker: 'AAPL', weight: 0.3, created_at: new Date().toISOString() },
    { id: 2, portfolio_id: 1, ticker: 'MSFT', weight: 0.25, created_at: new Date().toISOString() },
    { id: 3, portfolio_id: 1, ticker: 'NVDA', weight: 0.2, created_at: new Date().toISOString() },
    { id: 4, portfolio_id: 1, ticker: 'JPM', weight: 0.15, created_at: new Date().toISOString() },
    { id: 5, portfolio_id: 1, ticker: 'JNJ', weight: 0.1, created_at: new Date().toISOString() },
  ],
  analysis_runs: [],
  scenario_runs: [],
};

let nextIds = {
  user: 2,
  portfolio: 2,
  holding: 6,
  analysis: 1,
  scenario: 1,
};

function executeInMemoryQuery(text, params = []) {
  const lower = text.toLowerCase().trim();

  // 1. Users Queries
  if (lower.includes('select id from users where email =')) {
    const found = memoryStore.users.find((u) => u.email === params[0]);
    return { rows: found ? [{ id: found.id }] : [] };
  }
  if (lower.includes('select * from users where email =')) {
    const found = memoryStore.users.find((u) => u.email === params[0]);
    return { rows: found ? [found] : [] };
  }
  if (lower.includes('select id, name, email, created_at from users where id =')) {
    const found = memoryStore.users.find((u) => u.id === params[0]);
    return { rows: found ? [{ id: found.id, name: found.name, email: found.email, created_at: found.created_at }] : [] };
  }
  if (lower.includes('insert into users')) {
    const newUser = {
      id: nextIds.user++,
      name: params[0],
      email: params[1],
      password_hash: params[2],
      created_at: new Date().toISOString(),
    };
    memoryStore.users.push(newUser);
    return { rows: [newUser] };
  }

  // 2. Portfolio Queries
  if (lower.includes('select p.*, count(h.id)')) {
    const userId = params[0];
    const userPortfolios = memoryStore.portfolios.filter((p) => p.user_id === userId);
    const rows = userPortfolios.map((p) => {
      const holdingsCount = memoryStore.holdings.filter((h) => h.portfolio_id === p.id).length;
      return { ...p, holdings_count: holdingsCount };
    });
    return { rows };
  }
  if (lower.includes('select * from portfolios where id =') || lower.includes('select id, name from portfolios where id =') || lower.includes('select id from portfolios where id =')) {
    const pId = params[0];
    const uId = params[1];
    const found = memoryStore.portfolios.find((p) => p.id === pId && (uId === undefined || p.user_id === uId));
    return { rows: found ? [found] : [] };
  }
  if (lower.includes('insert into portfolios')) {
    const newP = {
      id: nextIds.portfolio++,
      user_id: params[0],
      name: params[1],
      description: params[2] || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryStore.portfolios.push(newP);
    return { rows: [newP] };
  }
  if (lower.includes('update portfolios set name =')) {
    const name = params[0];
    const desc = params[1];
    const pId = params[2];
    const uId = params[3];
    const p = memoryStore.portfolios.find((item) => item.id === pId && item.user_id === uId);
    if (p) {
      p.name = name;
      p.description = desc;
      p.updated_at = new Date().toISOString();
      return { rows: [p] };
    }
    return { rows: [] };
  }
  if (lower.includes('update portfolios set updated_at =')) {
    const p = memoryStore.portfolios.find((item) => item.id === params[0]);
    if (p) p.updated_at = new Date().toISOString();
    return { rows: [] };
  }
  if (lower.includes('delete from portfolios')) {
    const pId = params[0];
    const uId = params[1];
    const idx = memoryStore.portfolios.findIndex((item) => item.id === pId && item.user_id === uId);
    if (idx !== -1) {
      const deleted = memoryStore.portfolios.splice(idx, 1)[0];
      memoryStore.holdings = memoryStore.holdings.filter((h) => h.portfolio_id !== pId);
      return { rows: [{ id: deleted.id }] };
    }
    return { rows: [] };
  }

  // 3. Holding Queries
  if (lower.includes('select * from holdings where portfolio_id =') || lower.includes('select ticker, weight from holdings') || lower.includes('select ticker from holdings')) {
    const pId = params[0];
    const rows = memoryStore.holdings.filter((h) => h.portfolio_id === pId);
    return { rows };
  }
  if (lower.includes('select id from holdings where portfolio_id =')) {
    const pId = params[0];
    const ticker = params[1];
    const found = memoryStore.holdings.find((h) => h.portfolio_id === pId && h.ticker === ticker);
    return { rows: found ? [{ id: found.id }] : [] };
  }
  if (lower.includes('insert into holdings')) {
    const newH = {
      id: nextIds.holding++,
      portfolio_id: params[0],
      ticker: params[1],
      weight: parseFloat(params[2]),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryStore.holdings.push(newH);
    return { rows: [newH] };
  }
  if (lower.includes('update holdings set')) {
    const weight = params[0];
    const hId = params[params.length - 2];
    const pId = params[params.length - 1];
    const h = memoryStore.holdings.find((item) => item.id === hId && item.portfolio_id === pId);
    if (h) {
      if (typeof weight === 'number') h.weight = weight;
      h.updated_at = new Date().toISOString();
      return { rows: [h] };
    }
    return { rows: [] };
  }
  if (lower.includes('delete from holdings')) {
    const hId = params[0];
    const pId = params[1];
    const idx = memoryStore.holdings.findIndex((item) => item.id === hId && item.portfolio_id === pId);
    if (idx !== -1) {
      const deleted = memoryStore.holdings.splice(idx, 1)[0];
      return { rows: [{ id: deleted.id }] };
    }
    return { rows: [] };
  }

  // 4. Analysis & Scenario Runs
  if (lower.includes('insert into analysis_runs')) {
    const run = { id: nextIds.analysis++, portfolio_id: params[0], result: params[1], created_at: new Date().toISOString() };
    memoryStore.analysis_runs.push(run);
    return { rows: [run] };
  }
  if (lower.includes('insert into scenario_runs')) {
    const run = { id: nextIds.scenario++, portfolio_id: params[0], scenario_type: params[1], portfolio_value: params[2], result: params[3], created_at: new Date().toISOString() };
    memoryStore.scenario_runs.push(run);
    return { rows: [run] };
  }

  return { rows: [] };
}

async function query(text, params) {
  if (useInMemory) {
    return executeInMemoryQuery(text, params);
  }

  try {
    return await pool.query(text, params);
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.message.includes('connect ECONNREFUSED')) {
      if (!useInMemory) {
        console.warn('⚠️  PostgreSQL connection refused. Automatically switching to in-memory database store.');
        useInMemory = true;
      }
      return executeInMemoryQuery(text, params);
    }
    throw err;
  }
}

module.exports = {
  query,
  pool: {
    connect: async () => {
      if (useInMemory) {
        return {
          query: async (text, params) => executeInMemoryQuery(text, params),
          release: () => {},
        };
      }
      try {
        const client = await pool.connect();
        return client;
      } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.message.includes('connect ECONNREFUSED')) {
          if (!useInMemory) {
            console.warn('⚠️  PostgreSQL connection refused. Automatically switching to in-memory database store.');
            useInMemory = true;
          }
          return {
            query: async (text, params) => executeInMemoryQuery(text, params),
            release: () => {},
          };
        }
        throw err;
      }
    },
  },
};
