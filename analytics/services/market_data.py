import yfinance as yf
import pandas as pd
import numpy as np


def get_historical_prices(tickers: list[str], period: str = "1y") -> pd.DataFrame:
    if not tickers:
        raise ValueError("Ticker list cannot be empty.")

    data = yf.download(tickers, period=period, auto_adjust=True, progress=False)

    if data is None or data.empty:
        raise ValueError(f"Unable to retrieve market data for tickers: {tickers}")

    # Handle MultiIndex vs SingleIndex columns in yfinance output
    if isinstance(data.columns, pd.MultiIndex):
        if "Close" in data.columns.levels[0]:
            prices = data["Close"].copy()
        else:
            prices = data.iloc[:, data.columns.get_level_values(0) == "Close"]
            prices.columns = prices.columns.get_level_values(1)
    elif "Close" in data.columns:
        prices = data[["Close"]].copy()
        if len(tickers) == 1:
            prices.columns = [tickers[0]]
    else:
        prices = data.copy()

    # Ensure all requested tickers exist as columns
    missing = [t for t in tickers if t not in prices.columns]
    if missing:
        raise ValueError(f"Market data unavailable for ticker(s): {missing}")

    prices = prices[tickers]

    # Drop columns that are completely empty / NaN
    all_nan_cols = [c for c in prices.columns if prices[c].dropna().empty]
    if all_nan_cols:
        raise ValueError(f"Market data unavailable for ticker(s): {all_nan_cols}")

    # Forward fill then backward fill for small missing data gaps (holidays, etc.)
    prices = prices.ffill().bfill()

    if prices.empty or prices.isna().all().all():
        raise ValueError(f"Market data invalid or empty for tickers: {tickers}")

    return prices


def get_daily_returns(prices: pd.DataFrame) -> pd.DataFrame:
    returns = prices.pct_change().dropna(how="all")
    return returns.fillna(0.0)


def get_current_prices(tickers: list[str]) -> dict:
    try:
        prices = get_historical_prices(tickers, period="5d")
        latest = prices.iloc[-1]
        result = {}
        for ticker in tickers:
            if ticker in latest.index and pd.notna(latest[ticker]):
                val = float(latest[ticker])
                result[ticker] = val if not np.isnan(val) else None
            else:
                result[ticker] = None
        return result
    except Exception:
        return {ticker: None for ticker in tickers}


def get_ticker_info(ticker: str) -> dict:
    try:
        stock = yf.Ticker(ticker)
        info = stock.info or {}
    except Exception:
        info = {}

    return {
        "name": info.get("longName") or info.get("shortName") or ticker,
        "sector": info.get("sector") or "Unknown",
        "industry": info.get("industry") or "Unknown",
    }

