from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import numpy as np
import logging

from models.portfolio import PortfolioRequest
from models.scenario import ScenarioRequest, ClassifyRequest
from models.optimization import OptimizationRequest

from services.explanation import generate_explanation, generate_optimization_narrative
from services.domains import group_by_domain, DOMAINS
from services.symbols import search_symbols, resolve_symbol, SymbolNotFound
from services.optimization import optimize_portfolio
from services.scenario import (
    run_custom_scenario,
    run_named_scenario,
    get_available_scenarios,
)
from services.market_data import (
    MarketDataUnavailable,
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

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("analytics")

app = FastAPI(
    title="PortfolioIQ Analytics API",
    description="Financial analytics engine for PortfolioIQ",
    version="1.0.0",
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    first_msg = errors[0].get("msg", "Invalid input data") if errors else "Invalid input data"
    return JSONResponse(
        status_code=400,
        content={"detail": f"Validation error: {first_msg}"},
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
        # 1. Portfolio input validation
        # ------------------------------------------------
        if not request.portfolio:
            raise HTTPException(status_code=400, detail="Portfolio cannot be empty.")

        tickers = [holding.ticker.strip().upper() for holding in request.portfolio]

        if len(tickers) != len(set(tickers)):
            raise HTTPException(
                status_code=400, detail="Duplicate tickers are not allowed in portfolio."
            )

        weights = np.array([holding.weight for holding in request.portfolio], dtype=float)

        if any(w <= 0 for w in weights):
            raise HTTPException(
                status_code=400, detail="All portfolio weights must be greater than 0."
            )

        if not np.isclose(weights.sum(), 1.0, atol=1e-3):
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
        try:
            prices = get_historical_prices(tickers)
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))

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
            cp = current_prices.get(ticker)
            holdings_analysis.append(
                {
                    "ticker": ticker,
                    "weight": round(weight_dict[ticker] * 100, 2),
                    "current_price": round(float(cp), 2) if cp is not None else None,
                    "period_return": round(holding_returns.get(ticker, 0.0) * 100, 2),
                    "contribution": round(contributions.get(ticker, 0.0) * 100, 2),
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
        # 7. Health & Recommendations
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
            "recommendations": recommendations,
        }

        # ------------------------------------------------
        # 9. Generate AI insights (must never break /analyze)
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
            logger.warning(f"AI explanation failed: {e}")
            result["ai"] = {
                "available": False,
                "analysis": None,
                "model": None,
                "error": str(e),
            }

        return result

    except HTTPException:
        raise
    except MarketDataUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Error in /analyze: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal analysis engine error.")


@app.get("/scenario/types")
def scenario_types():
    return {"scenarios": get_available_scenarios()}


@app.post("/scenario")
def scenario_analysis(request: ScenarioRequest):
    try:
        if not request.portfolio:
            raise HTTPException(status_code=400, detail="Portfolio cannot be empty.")

        if request.portfolio_value <= 0:
            raise HTTPException(
                status_code=400, detail="Portfolio value must be greater than 0."
            )

        tickers = [h.ticker.strip().upper() for h in request.portfolio]
        if len(tickers) != len(set(tickers)):
            raise HTTPException(
                status_code=400, detail="Duplicate tickers are not allowed."
            )

        weights = [holding.weight for holding in request.portfolio]
        if not np.isclose(sum(weights), 1.0, atol=1e-3):
            raise HTTPException(
                status_code=400, detail="Portfolio weights must sum to 1.0"
            )

        portfolio = [
            {"ticker": holding.ticker.strip().upper(), "weight": holding.weight}
            for holding in request.portfolio
        ]

        if request.scenario:
            return run_named_scenario(
                portfolio, request.scenario, request.portfolio_value
            )

        if not request.domain_shocks:
            raise HTTPException(
                status_code=400,
                detail="Select a scenario or provide at least one domain shock.",
            )

        return run_custom_scenario(
            portfolio, request.portfolio_value, request.domain_shocks
        )

    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error in /scenario: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal scenario engine error.")


@app.post("/optimize")
def optimize(request: OptimizationRequest):
    try:
        if not request.tickers or len(request.tickers) < 2:
            raise HTTPException(
                status_code=400, detail="At least two tickers are required."
            )

        tickers = [ticker.strip().upper() for ticker in request.tickers]
        if len(tickers) != len(set(tickers)):
            raise HTTPException(
                status_code=400, detail="Duplicate tickers in optimization request."
            )

        current = None
        if request.current_weights:
            current = {
                k.strip().upper(): float(v) for k, v in request.current_weights.items()
            }

        result = optimize_portfolio(tickers, current)

        # Optional LLM commentary - the rule-based explanation is always present
        if request.include_ai:
            try:
                result["ai"] = generate_optimization_narrative(result)
            except Exception as e:
                logger.warning(f"Optimization narrative failed: {e}")
                result["ai"] = {"available": False, "analysis": None, "model": None,
                                "error": "LLM unavailable: Gemini is temporarily unavailable due to high traffic, so AI commentary could not be generated right now."}
        return result

    except HTTPException:
        raise
    except MarketDataUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error in /optimize: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal optimization engine error.")


@app.get("/search")
def search(
    q: str = Query(..., min_length=1, max_length=60),
    region: str = Query("auto", pattern="^(auto|us|india|global)$"),
    limit: int = Query(8, ge=1, le=15),
):
    """Find tickers by company name or symbol."""
    try:
        return {"results": search_symbols(q, region, limit)}
    except Exception as e:
        logger.error(f"Error in /search: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail="Ticker search is temporarily unavailable.")


@app.get("/resolve")
def resolve(symbol: str = Query(..., min_length=1, max_length=30)):
    """Validate a ticker and pick the right exchange automatically."""
    try:
        return resolve_symbol(symbol)
    except SymbolNotFound as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Error in /resolve: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not validate ticker.")


@app.get("/domains")
def domains():
    return {"domains": DOMAINS}


@app.post("/classify")
def classify(request: ClassifyRequest):
    """Group holdings into investment domains with their combined weights."""
    portfolio = [
        {"ticker": h.ticker.strip().upper(), "weight": h.weight}
        for h in request.portfolio
    ]
    return {"domains": group_by_domain(portfolio)}


@app.post("/explain")
def explain_portfolio(request: dict):
    try:
        return generate_explanation(request)
    except Exception as e:
        logger.error(f"Error in /explain: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal explanation engine error.")

