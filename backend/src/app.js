const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const portfolioRoutes = require('./routes/portfolioRoutes');
const marketRoutes = require('./routes/marketRoutes');
const { getScenarioTypesEndpoint } = require('./controllers/analyticsController');

const app = express();
const PORT = process.env.PORT || 5001;


// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/portfolios', portfolioRoutes);
app.use('/api/market', marketRoutes);

// Public scenario types endpoint for frontend dropdowns
app.get('/api/scenarios/types', getScenarioTypesEndpoint);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', app: 'PortfolioIQ Backend' });
});

// Centralized error handling
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`PortfolioIQ Backend running on port ${PORT}`);
  });
}

module.exports = app;

