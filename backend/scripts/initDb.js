// Applies database/schema.sql (and optionally seed.sql) to the configured Postgres database.
// Usage: npm run db:init [-- --seed]
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const dbDir = process.env.DB_SQL_DIR || path.join(__dirname, '..', '..', 'database');

const url = process.env.DATABASE_URL;
const pool = new Pool(
  url
    ? {
        connectionString: url,
        ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'portfolioiq',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
      }
);

(async () => {
  try {
    const files = ['schema.sql'];
    if (process.argv.includes('--seed')) files.push('seed.sql');
    for (const f of files) {
      await pool.query(fs.readFileSync(path.join(dbDir, f), 'utf8'));
      console.log(`Applied ${f}`);
    }
  } catch (err) {
    console.error('Database init failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
