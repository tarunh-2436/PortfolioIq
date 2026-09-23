from fastapi import FastAPI, HTTPException

import numpy as np

from models.portfolio import PortfolioRequest
from models.scenario import ScenarioRequest
from models.optimization import OptimizationRequest

from services.explanation import generate_explanation
from services.optimization import optimize_portfolio
from services.scenario import (
    run_custom_scenario,
    run_named_scenario,
    get_available_scenarios,
)
from services.market_data import (
    get_historical_prices,
    get_daily_returns,
    get_current_prices,
)

from services.portfolio import (
    calculate_portfolio_returns,
    calculate_annualized_return,
    calculate_volatility,
    calculate_sharpe_ratio,
    calculate_max_drawdown,
    calculate_cumulative_values,
    calculate_holding_returns,
    calculate_contribution,
)

from services.risk import get_market_beta, calculate_correlation_matrix

from services.diversification import (
    calculate_diversification_score,
    calculate_top_holdings,
)

from services.sectors import calculate_sector_allocation

from services.recommendations import calculate_health_score, generate_recommendations

app = FastAPI(
    title="PortfolioIQ Analytics API",
    description="Financial analytics engine for PortfolioIQ",
    version="1.0.0",
)


@app.get("/")
def root():

    return {"service": "PortfolioIQ Analytics", "status": "running"}


@app.get("/health")
def health():

    return {"status": "healthy"}


@app.post("/analyze")
def analyze_portfolio(request: PortfolioRequest):

    try:

        # ------------------------------------------------
        # 1. Portfolio input
        # ------------------------------------------------

        tickers = [holding.ticker.upper() for holding in request.portfolio]

        weights = np.array([holding.weight for holding in request.portfolio])

        if not np.isclose(weights.sum(), 1.0):

            raise HTTPException(
                status_code=400, detail="Portfolio weights must sum to 1.0"
            )

        portfolio = [
            {"ticker": ticker, "weight": float(weight)}
            for ticker, weight in zip(tickers, weights)
        ]

        # ------------------------------------------------
        # 2. Historical market data
        # ------------------------------------------------

        prices = get_historical_prices(tickers)

        prices = prices.dropna(axis=1, how="all")

        missing = [ticker for ticker in tickers if ticker not in prices.columns]

        if missing:

            raise HTTPException(
                status_code=400, detail=("Market data unavailable for: " f"{missing}")
            )

        prices = prices[tickers]

        returns = get_daily_returns(prices)

        # ------------------------------------------------
        # 3. Portfolio returns
        # ------------------------------------------------

        portfolio_returns = calculate_portfolio_returns(returns, weights)

        annual_return = calculate_annualized_return(portfolio_returns)

        volatility = calculate_volatility(portfolio_returns)

        sharpe = calculate_sharpe_ratio(annual_return, volatility)

        max_drawdown = calculate_max_drawdown(portfolio_returns)

        beta = get_market_beta(portfolio_returns)

        # ------------------------------------------------
        # 4. Portfolio value history
        # ------------------------------------------------

        portfolio_values = calculate_cumulative_values(portfolio_returns)

        performance = [
            {"date": date.strftime("%Y-%m-%d"), "value": round(float(value), 2)}
            for date, value in portfolio_values.items()
        ]

        # ------------------------------------------------
        # 5. Holding analysis
        # ------------------------------------------------

        holding_returns = calculate_holding_returns(prices)

        weight_dict = {
            ticker: float(weight) for ticker, weight in zip(tickers, weights)
        }

        contributions = calculate_contribution(holding_returns, weight_dict)

        current_prices = get_current_prices(tickers)

        holdings_analysis = []

        for ticker in tickers:

            holdings_analysis.append(
                {
                    "ticker": ticker,
                    "weight": round(weight_dict[ticker] * 100, 2),
                    "current_price": round(current_prices.get(ticker, 0), 2),
                    "period_return": round(holding_returns.get(ticker, 0) * 100, 2),
                    "contribution": round(contributions.get(ticker, 0) * 100, 2),
                }
            )

        # ------------------------------------------------
        # 6. Diversification
        # ------------------------------------------------

        diversification_score = calculate_diversification_score(weights.tolist())

        top_holdings = calculate_top_holdings(portfolio)

        sector_allocation = calculate_sector_allocation(portfolio)

        correlation_matrix = calculate_correlation_matrix(returns)

        # ------------------------------------------------
        # 7. Health
        # ------------------------------------------------

        health_score = calculate_health_score(
            diversification_score, volatility, sharpe, max_drawdown
        )

        recommendations = generate_recommendations(
            diversification_score,
            volatility,
            sharpe,
            max_drawdown,
            beta,
            sector_allocation,
        )

        # ------------------------------------------------
        # 8. Build quantitative result
        # ------------------------------------------------

        result = {
            "portfolio": portfolio,
            "metrics": {
                "annual_return": round(annual_return * 100, 2),
                "volatility": round(volatility * 100, 2),
                "sharpe_ratio": round(sharpe, 2),
                "beta": round(beta, 2),
                "max_drawdown": round(max_drawdown * 100, 2),
            },
            "diversification": {
                "score": diversification_score,
                "top_holdings": top_holdings,
                "sector_allocation": sector_allocation,
            },
            "health": {"score": health_score},
            "performance": performance,
            "holdings": holdings_analysis,
            "correlation": correlation_matrix,
            # Existing deterministic Python recommendations
            "recommendations": recommendations,
        }

        # ------------------------------------------------
        # 9. Generate AI insights
        # ------------------------------------------------

        try:

            ai_input = {
                "metrics": result["metrics"],
                "diversification": result["diversification"],
                "health": result["health"],
                "holdings": result["holdings"],
                "correlation": result["correlation"],
            }

            result["ai"] = generate_explanation(ai_input)

        except Exception as e:

            # AI failure should never break quantitative analytics
            result["ai"] = {
                "available": False,
                "analysis": None,
                "error": str(e),
            }

        # ------------------------------------------------
        # 10. Final response
        # ------------------------------------------------

        return result

    except HTTPException:
        raise

    except Exception as e:

        raise HTTPException(status_code=500, detail=str(e))


@app.get("/scenario/types")
def scenario_types():

    return {"scenarios": get_available_scenarios()}


@app.post("/scenario")
def scenario_analysis(request: ScenarioRequest):

    try:

        weights = [holding.weight for holding in request.portfolio]

        if not np.isclose(sum(weights), 1.0):

            raise HTTPException(
                status_code=400, detail="Portfolio weights must sum to 1.0"
            )

        portfolio = [
            {
                "ticker": holding.ticker.upper(),
                "weight": holding.weight,
                "shock": holding.shock or 0,
            }
            for holding in request.portfolio
        ]

        if request.scenario:

            return run_named_scenario(
                portfolio, request.scenario, request.portfolio_value
            )

        return run_custom_scenario(portfolio, request.portfolio_value)

    except HTTPException:
        raise

    except Exception as e:

        raise HTTPException(status_code=500, detail=str(e))


@app.post("/optimize")
def optimize(request: OptimizationRequest):

    try:

        if len(request.tickers) < 2:

            raise HTTPException(
                status_code=400, detail="At least two tickers are required."
            )

        tickers = [ticker.upper() for ticker in request.tickers]

        return optimize_portfolio(tickers)

    except HTTPException:
        raise

    except Exception as e:

        raise HTTPException(status_code=500, detail=str(e))


@app.post("/explain")
def explain_portfolio(request: dict):

    try:
        result = generate_explanation(request)

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
