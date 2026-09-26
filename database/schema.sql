-- PortfolioIQ Relational Database Schema (PostgreSQL)

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS portfolios (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS holdings (
    id SERIAL PRIMARY KEY,
    portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    ticker VARCHAR(20) NOT NULL,
    weight NUMERIC(6, 4) NOT NULL CHECK (weight > 0 AND weight <= 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_portfolio_ticker UNIQUE (portfolio_id, ticker)
);

CREATE TABLE IF NOT EXISTS analysis_runs (
    id SERIAL PRIMARY KEY,
    portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    result JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scenario_runs (
    id SERIAL PRIMARY KEY,
    portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    scenario_type VARCHAR(100),
    portfolio_value NUMERIC(15, 2),
    result JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_holdings_portfolio_id ON holdings(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_holdings_ticker ON holdings(ticker);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_portfolio_id ON analysis_runs(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_scenario_runs_portfolio_id ON scenario_runs(portfolio_id);

