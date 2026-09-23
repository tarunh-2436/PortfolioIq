import numpy as np
import pandas as pd

from .market_data import get_historical_prices, get_daily_returns


def calculate_beta(portfolio_returns: pd.Series, benchmark_returns: pd.Series) -> float:

    combined = pd.concat([portfolio_returns, benchmark_returns], axis=1).dropna()

    if len(combined) < 2:
        return 0.0

    portfolio = combined.iloc[:, 0]
    benchmark = combined.iloc[:, 1]

    covariance = np.cov(portfolio, benchmark)[0][1]

    benchmark_variance = np.var(benchmark)

    if benchmark_variance == 0:
        return 0.0

    return float(covariance / benchmark_variance)


def get_market_beta(portfolio_returns: pd.Series) -> float:

    market_prices = get_historical_prices(["^GSPC"])

    market_returns = get_daily_returns(market_prices)["^GSPC"]

    return calculate_beta(portfolio_returns, market_returns)


def calculate_correlation_matrix(returns) -> dict:

    correlation = returns.corr()

    return {
        ticker: {
            other: round(float(correlation.loc[ticker, other]), 3)
            for other in correlation.columns
        }
        for ticker in correlation.index
    }
