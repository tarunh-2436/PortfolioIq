import numpy as np
import pandas as pd

TRADING_DAYS = 252


def calculate_portfolio_returns(
    returns: pd.DataFrame, weights: np.ndarray
) -> pd.Series:

    return returns.dot(weights)


def calculate_annualized_return(portfolio_returns: pd.Series) -> float:

    cumulative_return = (1 + portfolio_returns).prod()

    years = len(portfolio_returns) / TRADING_DAYS

    if years <= 0:
        return 0.0

    return cumulative_return ** (1 / years) - 1


def calculate_volatility(portfolio_returns: pd.Series) -> float:

    return portfolio_returns.std() * np.sqrt(TRADING_DAYS)


def calculate_sharpe_ratio(
    annualized_return: float, volatility: float, risk_free_rate: float = 0.05
) -> float:

    if volatility == 0:
        return 0.0

    return (annualized_return - risk_free_rate) / volatility


def calculate_max_drawdown(portfolio_returns: pd.Series) -> float:

    cumulative = (1 + portfolio_returns).cumprod()

    running_max = cumulative.cummax()

    drawdown = (cumulative - running_max) / running_max

    return float(drawdown.min())


def calculate_cumulative_values(
    portfolio_returns: pd.Series, initial_value: float = 1000000
) -> pd.Series:

    cumulative = (1 + portfolio_returns).cumprod()

    return cumulative * initial_value


def calculate_holding_returns(prices: pd.DataFrame) -> dict:

    result = {}

    for ticker in prices.columns:

        first = prices[ticker].dropna().iloc[0]
        last = prices[ticker].dropna().iloc[-1]

        result[ticker] = (last / first) - 1

    return result


def calculate_contribution(holding_returns: dict, weights: dict) -> dict:

    return {
        ticker: holding_returns[ticker] * weights[ticker]
        for ticker in holding_returns
        if ticker in weights
    }
