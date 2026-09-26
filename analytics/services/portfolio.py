import numpy as np
import pandas as pd

TRADING_DAYS = 252


def calculate_portfolio_returns(
    returns: pd.DataFrame, weights: np.ndarray
) -> pd.Series:
    if returns.empty or len(weights) == 0:
        return pd.Series(dtype=float)
    return returns.dot(weights)


def calculate_annualized_return(portfolio_returns: pd.Series) -> float:
    if portfolio_returns is None or len(portfolio_returns) == 0:
        return 0.0

    years = len(portfolio_returns) / TRADING_DAYS
    if years <= 0:
        return 0.0

    cumulative_return = float((1 + portfolio_returns).prod())
    if cumulative_return <= 0:
        return -1.0

    ann_ret = cumulative_return ** (1.0 / years) - 1.0
    if np.isnan(ann_ret) or np.isinf(ann_ret):
        return 0.0
    return float(ann_ret)


def calculate_volatility(portfolio_returns: pd.Series) -> float:
    if portfolio_returns is None or len(portfolio_returns) < 2:
        return 0.0

    vol = float(portfolio_returns.std() * np.sqrt(TRADING_DAYS))
    if np.isnan(vol) or np.isinf(vol):
        return 0.0
    return vol


def calculate_sharpe_ratio(
    annualized_return: float, volatility: float, risk_free_rate: float = 0.05
) -> float:
    if volatility <= 1e-12 or np.isnan(volatility):
        return 0.0

    sharpe = (annualized_return - risk_free_rate) / volatility
    if np.isnan(sharpe) or np.isinf(sharpe):
        return 0.0
    return float(sharpe)


def calculate_max_drawdown(portfolio_returns: pd.Series) -> float:
    if portfolio_returns is None or portfolio_returns.empty:
        return 0.0

    cumulative = (1 + portfolio_returns).cumprod()
    running_max = cumulative.cummax()
    
    # Avoid zero division
    running_max = running_max.replace(0, np.nan)
    drawdown = (cumulative - running_max) / running_max

    min_dd = float(drawdown.min())
    if np.isnan(min_dd) or np.isinf(min_dd):
        return 0.0
    return min_dd


def calculate_cumulative_values(
    portfolio_returns: pd.Series, initial_value: float = 1000000
) -> pd.Series:
    if portfolio_returns is None or portfolio_returns.empty:
        return pd.Series(dtype=float)

    cumulative = (1 + portfolio_returns).cumprod()
    return cumulative * initial_value


def calculate_holding_returns(prices: pd.DataFrame) -> dict:
    result = {}
    for ticker in prices.columns:
        series = prices[ticker].dropna()
        if series.empty or len(series) < 2:
            result[ticker] = 0.0
            continue

        first = float(series.iloc[0])
        last = float(series.iloc[-1])
        if first == 0:
            result[ticker] = 0.0
        else:
            ret = (last / first) - 1.0
            result[ticker] = 0.0 if np.isnan(ret) or np.isinf(ret) else float(ret)

    return result


def calculate_contribution(holding_returns: dict, weights: dict) -> dict:
    return {
        ticker: float(holding_returns[ticker] * weights[ticker])
        for ticker in holding_returns
        if ticker in weights
    }

