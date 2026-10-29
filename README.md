# PortfolioIQ — Investment Analytics & AI Decision-Support Platform

PortfolioIQ is a full-stack investment portfolio analytics, risk management, stress simulation, and AI decision-support platform.

---

## System Architecture & Data Flow

```
React (Port 3000; nginx in Docker)
       ↓  (HTTP API / JSON)
Node.js / Express Gateway (Port 5000)
       ├─ PostgreSQL persistence → Neon cloud Postgres (DATABASE_URL)
       ↓  (API Proxy)
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
│   ├── scripts/initDb.js      # Applies schema/seed to the cloud DB (npm run db:init)
│   ├── Dockerfile
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
├── docker-compose.yml         # Runs frontend, backend & analytics containers
├── neon.ts                    # Neon cloud project config
├── database/                  # PostgreSQL Schema & Seed Scripts
│   ├── schema.sql             # Users, Portfolios, Holdings, Analysis & Scenario Runs
│   └── seed.sql               # Demo data
│
└── README.md
```

---

## Docker & Cloud Database

The database is hosted in the cloud on [Neon](https://neon.tech) (serverless PostgreSQL; any hosted Postgres such as Supabase or AWS RDS also works), and the three services run in Docker containers via `docker-compose.yml`. There is no database container.

```
Browser → frontend (nginx :80, host :3000) ──/api──▶ backend (:5000) ──▶ analytics (:8000)
                                                        │
                                                        └──▶ Neon cloud Postgres (SSL)
```

### Prerequisites
- Docker Desktop (running)
- Node.js 20+ (only to run the one-time DB init script)
- A Neon account and a Gemini API key

### Steps
1. **Create the cloud database.** Create a project at [neon.tech](https://neon.tech) and copy the connection string (it looks like `postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`). The pooled URL is recommended.
2. **Configure env files:**
   ```bash
   cp backend/.env.example backend/.env       # set DATABASE_URL and JWT_SECRET
   cp analytics/.env.example analytics/.env   # set GEMINI_API_KEY
   ```
3. **Create the tables in the cloud DB** (one time; `--seed` adds the demo user):
   ```bash
   cd backend && npm install && npm run db:init -- --seed && cd ..
   ```
4. **Build and start everything:**
   ```bash
   docker compose up --build
   ```
5. Open **http://localhost:3000**. If port 3000 is busy, pick another one:
   ```powershell
   $env:FRONTEND_PORT="8080"; docker compose up -d      # PowerShell
   FRONTEND_PORT=8080 docker compose up -d              # bash
   ```

Demo login: `demo@portfolioiq.com` / `password123`

### Useful commands
```bash
docker compose up -d --build      # rebuild and run in the background
docker compose logs -f backend    # follow logs (backend | analytics | frontend)
docker compose down               # stop and remove containers
```

### Environment variables

| File | Variable | Purpose |
|---|---|---|
| `backend/.env` | `DATABASE_URL` | Neon connection string (SSL on automatically) |
| `backend/.env` | `JWT_SECRET`, `JWT_EXPIRES_IN` | Signing key and lifetime for login tokens |
| `backend/.env` | `ANALYTICS_SERVICE_URL` | Set to `http://analytics:8000` by docker-compose |
| `analytics/.env` | `GEMINI_API_KEY` | Google Gemini key for AI insights |
| shell | `FRONTEND_PORT` | Host port for the frontend (default `3000`) |

### Verifying it works
```bash
docker compose ps                       # frontend, backend, analytics should all be "Up"
curl http://localhost:3000/api/scenarios/types
```
Then log in as the demo user. Restarting the containers does not lose data, because it lives in Neon.

### Sharing the project
A teammate needs the repo, Docker Desktop, and your `backend/.env` and `analytics/.env` (send them privately, never commit them). Then `docker compose up --build`. Everyone using the same `DATABASE_URL` sees the same data.

### Troubleshooting
- **`$env:...` "syntax is incorrect"**: you are in cmd, not PowerShell. In cmd use `set FRONTEND_PORT=8080`.
- **"port is already allocated" / bind error**: port 3000 is busy (often the Vite dev server). Use another `FRONTEND_PORT`.
- **First request is slow**: Neon's free tier pauses idle databases; it wakes in a second or two.
- **Login fails with "Invalid email or password"**: run `npm run db:init -- --seed` once, and make sure `DATABASE_URL` is set in `backend/.env`.
- **Backend can't reach the database**: check the connection string, then `docker compose logs backend`.

### Notes
- When `DATABASE_URL` is set, SSL is enabled automatically and the in-memory fallback is disabled, so connection problems show up as errors instead of silently losing data. Without `DATABASE_URL`, the app uses the local `DB_*` settings and falls back to an in-memory store if Postgres is unreachable.
- `.env` files hold secrets and are git-ignored; never commit your `DATABASE_URL`.
- Neon project config lives in `neon.ts` (managed with the `neon` CLI: `neon login`, `neon deploy`).

---

## Getting Started & Running Services

### 1. PostgreSQL Database Setup (local, without Docker/cloud)
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

