import numpy as np
import pandas as pd

from .market_data import get_historical_prices, get_daily_returns


def calculate_beta(portfolio_returns: pd.Series, benchmark_returns: pd.Series) -> float:
    if portfolio_returns is None or benchmark_returns is None:
        return 1.0

    combined = pd.concat([portfolio_returns, benchmark_returns], axis=1).dropna()

    if len(combined) < 2:
        return 1.0

    portfolio = combined.iloc[:, 0]
    benchmark = combined.iloc[:, 1]

    cov_matrix = np.cov(portfolio, benchmark)
    covariance = cov_matrix[0][1]

    benchmark_variance = float(np.var(benchmark, ddof=1))

    if benchmark_variance <= 1e-12 or np.isnan(benchmark_variance):
        return 1.0

    beta = covariance / benchmark_variance
    if np.isnan(beta) or np.isinf(beta):
        return 1.0

    return float(beta)


def get_market_beta(portfolio_returns: pd.Series) -> float:
    try:
        market_prices = get_historical_prices(["^GSPC"])
        market_returns = get_daily_returns(market_prices)["^GSPC"]
        return calculate_beta(portfolio_returns, market_returns)
    except Exception:
        return 1.0


def calculate_correlation_matrix(returns: pd.DataFrame) -> dict:
    if returns.empty or len(returns.columns) == 0:
        return {}

    correlation = returns.corr().fillna(0.0)

    result = {}
    for ticker in correlation.index:
        result[ticker] = {}
        for other in correlation.columns:
            val = float(correlation.loc[ticker, other])
            if np.isnan(val) or np.isinf(val):
                val = 1.0 if ticker == other else 0.0
            result[ticker][other] = round(val, 3)

    return result

