-- PortfolioIQ Seed Data for Development / Testing

-- Demo user (Password: "password123", bcrypt hash: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy)
INSERT INTO users (id, name, email, password_hash)
VALUES (1, 'Demo Investor', 'demo@portfolioiq.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy')
ON CONFLICT (id) DO NOTHING;

-- Demo Portfolio
INSERT INTO portfolios (id, user_id, name, description)
VALUES (1, 1, 'Tech & Growth Portfolio', 'Diversified core technology and market leaders')
ON CONFLICT (id) DO NOTHING;

-- Demo Holdings (Weights sum to 1.0)
INSERT INTO holdings (portfolio_id, ticker, weight) VALUES
(1, 'AAPL', 0.3000),
(1, 'MSFT', 0.2500),
(1, 'NVDA', 0.2000),
(1, 'JPM',  0.1500),
(1, 'JNJ',  0.1000)
ON CONFLICT (portfolio_id, ticker) DO NOTHING;

SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));
SELECT setval('portfolios_id_seq', (SELECT MAX(id) FROM portfolios));
SELECT setval('holdings_id_seq', (SELECT MAX(id) FROM holdings));

