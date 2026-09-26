# PortfolioIQ — Investment Analytics & AI Decision-Support Platform

PortfolioIQ is a full-stack investment portfolio analytics, risk management, stress simulation, and AI decision-support platform.

---

## System Architecture & Data Flow

```
React (Port 3000)
       ↓  (HTTP API / JSON)
Node.js / Express Gateway (Port 5000)
       ↓  (PostgreSQL Persistence + API Proxy)
Python / FastAPI Analytics Engine (Port 8000)
       ↓
Market Data (yfinance) + Quant Models + Gemini AI Insights
```

---

## Directory Structure

```
PortfolioIq/
├── analytics/                 # Python FastAPI Analytics Engine
│   ├── main.py                # FastAPI endpoints (/analyze, /scenario, /optimize, /explain)
│   ├── models/                # Pydantic validation models
│   ├── services/              # Financial quant calculations & Gemini integration
│   ├── tests/                 # Pytest suite
│   ├── requirements.txt
│   └── .env.example
│
├── backend/                   # Node.js / Express Application & API Gateway
│   ├── src/
│   │   ├── config/            # Database pool setup
│   │   ├── controllers/       # Auth, Portfolio, Holdings, & Analytics controllers
│   │   ├── middleware/        # JWT Authentication & Error handlers
│   │   ├── routes/            # Express router modules
│   │   ├── services/          # HTTP client proxying FastAPI calls
│   │   └── app.js
│   ├── tests/                 # Jest integration tests
│   ├── package.json
│   └── .env.example
│
├── frontend/                  # React + TypeScript + Tailwind CSS Frontend
│   ├── src/
│   │   ├── components/        # Navbar, HealthBadge, HoldingModal
│   │   ├── pages/             # Login, Register, PortfolioList, PortfolioDetail, Dashboard, ScenarioSimulator, Optimizer
│   │   ├── services/          # Axios API service to Node backend
│   │   ├── context/           # AuthContext & Session management
│   │   ├── types/             # TypeScript interface contracts
│   │   └── App.tsx
│   ├── package.json
│   └── .env.example
│
├── database/                  # PostgreSQL Schema & Seed Scripts
│   ├── schema.sql             # Users, Portfolios, Holdings, Analysis & Scenario Runs
│   └── seed.sql               # Demo data
│
└── README.md
```

---

## Getting Started & Running Services

### 1. PostgreSQL Database Setup
```bash
# Create database and apply schema and seed scripts:
createdb portfolioiq
psql -d portfolioiq -f database/schema.sql
psql -d portfolioiq -f database/seed.sql
```

---

### 2. Python FastAPI Analytics Engine (Port 8000)
```bash
cd analytics

# Create & activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env

# Run FastAPI server
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Run automated tests
pytest tests/
```

---

### 3. Node.js Express Backend API Gateway (Port 5000)
```bash
cd backend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env

# Run backend server
npm start

# Run unit & integration tests
npm test
```

---

### 4. React TypeScript Frontend (Port 3000)
```bash
cd frontend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env

# Start React dev server
npm run dev
```

---

## Features & Verification

- **User Authentication**: Secure registration, JWT authentication, and protected endpoints.
- **Portfolio Management**: Create portfolios, add/edit/delete holdings, real-time weight sum validation.
- **Quantitative Analytics**: Returns, Volatility, Sharpe ratio, Market Beta (S&P 500 benchmark), Maximum Drawdown, Correlation matrix, Sector breakdown, and Health Score (0-100).
- **AI Portfolio Insights**: Interprets quantitative results using Google Gemini API without recalculating metrics.
- **Scenario Stress Testing**: Named market crash/downturn scenarios and custom per-asset return shocks.
- **Markowitz Optimization**: Efficient frontier portfolio optimization powered by `PyPortfolioOpt`.

