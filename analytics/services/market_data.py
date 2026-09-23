import yfinance as yf
import pandas as pd


def get_historical_prices(tickers: list[str], period: str = "1y") -> pd.DataFrame:

    data = yf.download(tickers, period=period, auto_adjust=True, progress=False)

    if data.empty:
        raise ValueError("Unable to retrieve market data.")

    if isinstance(data.columns, pd.MultiIndex):
        prices = data["Close"]
    else:
        prices = data[["Close"]]

        if len(tickers) == 1:
            prices.columns = tickers

    prices = prices.dropna(how="all")

    return prices


def get_daily_returns(prices: pd.DataFrame) -> pd.DataFrame:

    return prices.pct_change().dropna()


def get_current_prices(tickers: list[str]) -> dict:

    prices = get_historical_prices(tickers, period="5d")

    latest = prices.iloc[-1]

    return {
        ticker: float(latest[ticker]) for ticker in tickers if ticker in latest.index
    }


def get_ticker_info(ticker: str) -> dict:

    stock = yf.Ticker(ticker)

    try:
        info = stock.info
    except Exception:
        info = {}

    return {
        "name": info.get("longName", ticker),
        "sector": info.get("sector", "Unknown"),
        "industry": info.get("industry", "Unknown"),
    }
