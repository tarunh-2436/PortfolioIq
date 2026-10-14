import time
import logging
import threading
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


_PRICE_TTL_S = 15 * 60
_STALE_MAX_AGE_S = 3 * 24 * 3600  # last-known-good prices stay usable for 3 days if Yahoo is down
_price_cache: dict[tuple[str, str], tuple[float, pd.Series]] = {}
_stale_cache: dict[tuple[str, str], tuple[float, pd.Series]] = {}

# Yahoo rate-limits bursts of parallel requests; keep concurrency low.
_yahoo_slots = threading.BoundedSemaphore(3)


class MarketDataUnavailable(ConnectionError):
    """Yahoo Finance is failing/unreachable, as opposed to a ticker not existing."""


def _provider_is_up() -> bool:
    """Canary request used to tell a Yahoo outage apart from a bad ticker."""
    for symbol in ("^GSPC", "SPY"):
        try:
            hist = yf.Ticker(symbol).history(period="5d")
            if hist is not None and not hist.empty:
                return True
        except Exception:
            pass
    return False


def _fetch_from_yahoo(to_fetch: list[str], period: str) -> pd.DataFrame:
    """Batch download, then per-ticker retries with backoff, for tickers not yet cached."""
    prices = pd.DataFrame()
    with _yahoo_slots:
        # Batch download with a couple of attempts (Yahoo resets connections intermittently)
        for attempt in range(3):
            try:
                data = yf.download(to_fetch, period=period, auto_adjust=True, progress=False)
                prices = _extract_close(data, to_fetch)
                if all(t in prices.columns and not prices[t].dropna().empty for t in to_fetch):
                    return prices
            except Exception as e:
                logger.warning(f"Batch yf.download error (attempt {attempt + 1}): {e}")
            time.sleep(0.5 * (attempt + 1) + 0.3 * attempt)

        # Retry any missing or empty ticker individually
        for ticker in to_fetch:
            if ticker in prices.columns and not prices[ticker].dropna().empty:
                continue
            for attempt in range(4):
                try:
                    hist = yf.Ticker(ticker).history(period=period, auto_adjust=True)
                    if hist is not None and not hist.empty and "Close" in hist.columns:
                        series = hist["Close"]
                        # Indexes differ in tz between download() and history(); normalise
                        if getattr(series.index, "tz", None) is not None:
                            series = series.copy()
                            series.index = series.index.tz_localize(None)
                        prices[ticker] = series
                        break
                except Exception as ex:
                    logger.debug(f"Ticker {ticker} retry {attempt + 1} failed: {ex}")
                time.sleep(0.4 * (attempt + 1))
    return prices


def _extract_close(data: pd.DataFrame, clean_tickers: list[str]) -> pd.DataFrame:
    if data is None or data.empty:
        return pd.DataFrame()
    if isinstance(data.columns, pd.MultiIndex):
        if "Close" in data.columns.levels[0]:
            return data["Close"].copy()
        prices = data.iloc[:, data.columns.get_level_values(0) == "Close"].copy()
        prices.columns = prices.columns.get_level_values(1)
        return prices
    if "Close" in data.columns:
        prices = data[["Close"]].copy()
        if len(clean_tickers) == 1:
            prices.columns = [clean_tickers[0]]
        return prices
    return data.copy()


def get_historical_prices(tickers: list[str], period: str = "1y") -> pd.DataFrame:
    if not tickers:
        raise ValueError("Ticker list cannot be empty.")

    clean_tickers = [t.strip().upper() for t in tickers]
    now = time.time()

    # Step 0: serve recent data from the in-memory cache
    series_by_ticker: dict[str, pd.Series] = {}
    for t in clean_tickers:
        hit = _price_cache.get((t, period))
        if hit and hit[0] > now and not hit[1].dropna().empty:
            series_by_ticker[t] = hit[1]
    to_fetch = [t for t in clean_tickers if t not in series_by_ticker]

    # Step 1: fetch whatever is missing from Yahoo (batched, retried, rate-limited)
    if to_fetch:
        prices = _fetch_from_yahoo(to_fetch, period)
        for t in to_fetch:
            if t in prices.columns and not prices[t].dropna().empty:
                series_by_ticker[t] = prices[t]
                _price_cache[(t, period)] = (now + _PRICE_TTL_S, prices[t])
                _stale_cache[(t, period)] = (now, prices[t])

    # Step 2: tickers still missing -> fall back to last-known-good data if we have it
    still_missing = [t for t in clean_tickers if t not in series_by_ticker]
    for t in list(still_missing):
        stale = _stale_cache.get((t, period))
        if stale and now - stale[0] < _STALE_MAX_AGE_S and not stale[1].dropna().empty:
            logger.warning(f"Using cached prices for {t} (Yahoo did not respond).")
            series_by_ticker[t] = stale[1]
            still_missing.remove(t)

    # Step 3: still missing -> was it Yahoo failing, or genuinely unknown tickers?
    if still_missing:
        if not _provider_is_up():
            raise MarketDataUnavailable(
                "The market data provider (Yahoo Finance) is not responding right now. "
                "Please try again in a minute."
            )
        hints = []
        for t in still_missing:
            if "." not in t:
                hints.append(f"'{t}' (did you mean '{t}.NS' or '{t}.BO' for Indian stocks?)")
        hint_msg = f" Suggestions: {', '.join(hints)}" if hints else ""
        raise ValueError(f"Market data unavailable for ticker(s): {still_missing}.{hint_msg}")

    prices = pd.concat([series_by_ticker[t].rename(t) for t in clean_tickers], axis=1)

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


_INFO_TTL_S = 24 * 3600
_info_cache: dict[str, tuple[float, dict]] = {}


def get_ticker_info(ticker: str) -> dict:
    """Company metadata from Yahoo Finance, cached for 24h.

    Failed lookups are cached only briefly so a transient Yahoo error does not
    pin a ticker to "Unknown" for a whole day."""
    key = ticker.strip().upper()
    now = time.time()
    cached = _info_cache.get(key)
    if cached and cached[0] > now:
        return cached[1]

    ok = True
    try:
        info = yf.Ticker(key).info or {}
    except Exception:
        info = {}
        ok = False

    result = {
        "name": info.get("longName") or info.get("shortName") or key,
        "sector": info.get("sector") or "Unknown",
        "industry": info.get("industry") or "Unknown",
        "quote_type": info.get("quoteType"),
        "category": info.get("category"),
        "currency": info.get("currency"),
        "exchange": info.get("exchange"),
    }
    ok = ok and bool(info)
    _info_cache[key] = (now + (_INFO_TTL_S if ok else 120), result)
    return result
