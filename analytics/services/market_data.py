import time
import logging
import yfinance as yf
import pandas as pd
import numpy as np

logger = logging.getLogger("analytics.market_data")

# ---------------------------------------------------------------------------
# Yahoo Finance & curl_cffi resilience patch
# ---------------------------------------------------------------------------
try:
    import yfinance.data
    from curl_cffi import requests as cffi_requests

    # 1. Patch session default impersonation to chrome110 (avoids TLS handshake connection reset)
    _orig_cffi_init = cffi_requests.Session.__init__

    def _patched_cffi_init(self, *args, **kwargs):
        if kwargs.get("impersonate") in ("chrome", None):
            kwargs["impersonate"] = "chrome110"
        _orig_cffi_init(self, *args, **kwargs)

    cffi_requests.Session.__init__ = _patched_cffi_init

    # 2. Patch Yahoo crumb URL to prefer query2 over query1 (query1 is blocked by Yahoo)
    _orig_get_crumb = yfinance.data.YfData._get_crumb_basic

    def _patched_get_crumb(self, timeout=30):
        if self._crumb is not None:
            return self._crumb
        if not self._get_cookie_basic(timeout):
            return None
        for crumb_url in [
            "https://query2.finance.yahoo.com/v1/test/getcrumb",
            "https://query1.finance.yahoo.com/v1/test/getcrumb",
        ]:
            try:
                resp = self._session.get(url=crumb_url, timeout=timeout, allow_redirects=True)
                if resp.status_code == 200 and resp.text and "Too Many Requests" not in resp.text:
                    self._crumb = resp.text.strip()
                    return self._crumb
            except Exception:
                continue
        return None

    yfinance.data.YfData._get_crumb_basic = _patched_get_crumb
except Exception as e:
    logger.debug(f"Could not apply yfinance patch: {e}")


def get_historical_prices(tickers: list[str], period: str = "1y") -> pd.DataFrame:
    if not tickers:
        raise ValueError("Ticker list cannot be empty.")

    clean_tickers = [t.strip().upper() for t in tickers]

    # Step 1: Attempt batch download
    prices = pd.DataFrame()
    try:
        data = yf.download(clean_tickers, period=period, auto_adjust=True, progress=False)
        if data is not None and not data.empty:
            if isinstance(data.columns, pd.MultiIndex):
                if "Close" in data.columns.levels[0]:
                    prices = data["Close"].copy()
                else:
                    prices = data.iloc[:, data.columns.get_level_values(0) == "Close"].copy()
                    prices.columns = prices.columns.get_level_values(1)
            elif "Close" in data.columns:
                prices = data[["Close"]].copy()
                if len(clean_tickers) == 1:
                    prices.columns = [clean_tickers[0]]
            else:
                prices = data.copy()
    except Exception as e:
        logger.warning(f"Batch yf.download error: {e}. Falling back to individual retrieval.")

    # Step 2: Retry any missing or empty ticker individually with exponential backoff
    for ticker in clean_tickers:
        if ticker not in prices.columns or prices[ticker].dropna().empty:
            fetched_series = None
            for attempt in range(3):
                try:
                    hist = yf.Ticker(ticker).history(period=period, auto_adjust=True)
                    if hist is not None and not hist.empty and "Close" in hist.columns:
                        fetched_series = hist["Close"]
                        break
                except Exception as ex:
                    logger.debug(f"Ticker {ticker} retry {attempt+1} failed: {ex}")
                    time.sleep(0.3 * (attempt + 1))
            if fetched_series is not None:
                prices[ticker] = fetched_series

    # Step 3: Check for missing tickers and provide helpful suggestions
    missing = [t for t in clean_tickers if t not in prices.columns or prices[t].dropna().empty]
    if missing:
        hints = []
        for t in missing:
            if "." not in t:
                hints.append(f"'{t}' (did you mean '{t}.NS' or '{t}.BO' for Indian stocks?)")
        hint_msg = f" Suggestions: {', '.join(hints)}" if hints else ""
        raise ValueError(f"Market data unavailable for ticker(s): {missing}.{hint_msg}")

    prices = prices[clean_tickers]

    # Forward fill then backward fill for holiday differences across exchanges
    prices = prices.ffill().bfill()

    if prices.empty or prices.isna().all().all():
        raise ValueError(f"Market data invalid or empty for tickers: {clean_tickers}")

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
            clean = ticker.strip().upper()
            if clean in latest.index and pd.notna(latest[clean]):
                val = float(latest[clean])
                result[clean] = val if not np.isnan(val) else None
            else:
                result[clean] = None
        return result
    except Exception:
        return {ticker.strip().upper(): None for ticker in tickers}


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


