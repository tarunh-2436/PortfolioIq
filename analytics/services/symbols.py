"""Ticker search and symbol resolution.

* ``search_symbols("apple")`` -> candidate listings (symbol, name, exchange, region)
  with the best listing flagged as ``recommended``.
* ``resolve_symbol("RELIANCE")`` -> validated canonical symbol (``RELIANCE.NS``),
  automatically picking the right exchange (US, NSE/BSE India, other markets).
"""

from __future__ import annotations

import logging
import re
import threading
import time

import yfinance as yf

from . import market_data  # noqa: F401  (applies the Yahoo resilience patches)

logger = logging.getLogger("analytics.symbols")

SYMBOL_RE = re.compile(r"^[A-Z0-9^][A-Z0-9.\-=&^]{0,19}$")
ALLOWED_QUOTE_TYPES = {"EQUITY", "ETF", "CRYPTOCURRENCY"}
# NSE/BSE trading-series variants (block deals, SME, etc.) that duplicate a company
_INDIAN_SERIES_RE = re.compile(r"-(BL|SM|BE|ST|SG|IL|BZ|GB|GS|N\d)\.(NS|BO)$")

# Yahoo exchange code -> (display name, region)
EXCHANGES = {
    "NMS": ("NASDAQ", "US"),
    "NGM": ("NASDAQ", "US"),
    "NCM": ("NASDAQ", "US"),
    "NYQ": ("NYSE", "US"),
    "ASE": ("NYSE American", "US"),
    "PCX": ("NYSE Arca", "US"),
    "BTS": ("Cboe BZX", "US"),
    "NSI": ("NSE India", "India"),
    "BSE": ("BSE India", "India"),
    "LSE": ("London", "Global"),
    "IOB": ("London IOB", "Global"),
    "TOR": ("Toronto", "Global"),
    "VAN": ("TSX Venture", "Global"),
    "GER": ("XETRA", "Global"),
    "FRA": ("Frankfurt", "Global"),
    "PAR": ("Euronext Paris", "Global"),
    "AMS": ("Euronext Amsterdam", "Global"),
    "MIL": ("Milan", "Global"),
    "JPX": ("Tokyo", "Global"),
    "HKG": ("Hong Kong", "Global"),
    "SHH": ("Shanghai", "Global"),
    "SHZ": ("Shenzhen", "Global"),
    "ASX": ("Australia", "Global"),
    "SES": ("Singapore", "Global"),
    "KSC": ("Korea", "Global"),
    "TAI": ("Taiwan", "Global"),
    "SAO": ("Sao Paulo", "Global"),
    "CCC": ("Crypto", "Global"),
}

SUFFIX_EXCHANGE = {
    ".NS": ("NSE India", "India"),
    ".BO": ("BSE India", "India"),
    ".L": ("London", "Global"),
    ".TO": ("Toronto", "Global"),
    ".DE": ("XETRA", "Global"),
    ".PA": ("Euronext Paris", "Global"),
    ".T": ("Tokyo", "Global"),
    ".HK": ("Hong Kong", "Global"),
    ".AX": ("Australia", "Global"),
}

# Offline fallback so search still works when Yahoo is unreachable.
_FALLBACK = [
    ("AAPL", "Apple Inc.", "NMS"), ("MSFT", "Microsoft Corporation", "NMS"),
    ("GOOGL", "Alphabet Inc. (Class A)", "NMS"), ("AMZN", "Amazon.com, Inc.", "NMS"),
    ("META", "Meta Platforms, Inc.", "NMS"), ("NVDA", "NVIDIA Corporation", "NMS"),
    ("TSLA", "Tesla, Inc.", "NMS"), ("NFLX", "Netflix, Inc.", "NMS"),
    ("AMD", "Advanced Micro Devices, Inc.", "NMS"), ("INTC", "Intel Corporation", "NMS"),
    ("ORCL", "Oracle Corporation", "NYQ"), ("CRM", "Salesforce, Inc.", "NYQ"),
    ("JPM", "JPMorgan Chase & Co.", "NYQ"), ("BAC", "Bank of America Corporation", "NYQ"),
    ("GS", "The Goldman Sachs Group, Inc.", "NYQ"), ("V", "Visa Inc.", "NYQ"),
    ("MA", "Mastercard Incorporated", "NYQ"), ("JNJ", "Johnson & Johnson", "NYQ"),
    ("PFE", "Pfizer Inc.", "NYQ"), ("UNH", "UnitedHealth Group Incorporated", "NYQ"),
    ("LLY", "Eli Lilly and Company", "NYQ"), ("XOM", "Exxon Mobil Corporation", "NYQ"),
    ("CVX", "Chevron Corporation", "NYQ"), ("WMT", "Walmart Inc.", "NYQ"),
    ("KO", "The Coca-Cola Company", "NYQ"), ("PEP", "PepsiCo, Inc.", "NMS"),
    ("DIS", "The Walt Disney Company", "NYQ"), ("BA", "The Boeing Company", "NYQ"),
    ("LMT", "Lockheed Martin Corporation", "NYQ"), ("RTX", "RTX Corporation", "NYQ"),
    ("NOC", "Northrop Grumman Corporation", "NYQ"), ("GD", "General Dynamics Corporation", "NYQ"),
    ("SPY", "SPDR S&P 500 ETF Trust", "PCX"), ("QQQ", "Invesco QQQ Trust", "NMS"),
    ("RELIANCE.NS", "Reliance Industries Limited", "NSI"), ("TCS.NS", "Tata Consultancy Services Limited", "NSI"),
    ("INFY.NS", "Infosys Limited", "NSI"), ("INFY", "Infosys Limited (ADR)", "NYQ"),
    ("HDFCBANK.NS", "HDFC Bank Limited", "NSI"), ("ICICIBANK.NS", "ICICI Bank Limited", "NSI"),
    ("SBIN.NS", "State Bank of India", "NSI"), ("ITC.NS", "ITC Limited", "NSI"),
    ("BHARTIARTL.NS", "Bharti Airtel Limited", "NSI"), ("LT.NS", "Larsen & Toubro Limited", "NSI"),
    ("HINDUNILVR.NS", "Hindustan Unilever Limited", "NSI"), ("WIPRO.NS", "Wipro Limited", "NSI"),
    ("TATAMOTORS.NS", "Tata Motors Limited", "NSI"), ("TATASTEEL.NS", "Tata Steel Limited", "NSI"),
    ("MARUTI.NS", "Maruti Suzuki India Limited", "NSI"), ("SUNPHARMA.NS", "Sun Pharmaceutical Industries Limited", "NSI"),
    ("ADANIENT.NS", "Adani Enterprises Limited", "NSI"), ("HAL.NS", "Hindustan Aeronautics Limited", "NSI"),
    ("BEL.NS", "Bharat Electronics Limited", "NSI"), ("BAJFINANCE.NS", "Bajaj Finance Limited", "NSI"),
    ("ONGC.NS", "Oil and Natural Gas Corporation Limited", "NSI"), ("NTPC.NS", "NTPC Limited", "NSI"),
    ("BTC-USD", "Bitcoin USD", "CCC"), ("ETH-USD", "Ethereum USD", "CCC"),
]

_CACHE_TTL_S = 3600
_cache_lock = threading.Lock()
_search_cache: dict[tuple, tuple[float, list]] = {}
_resolve_cache: dict[str, tuple[float, dict]] = {}


class SymbolNotFound(ValueError):
    def __init__(self, message: str, suggestions: list[dict] | None = None):
        super().__init__(message)
        self.suggestions = suggestions or []


def normalize_symbol(raw: str) -> str:
    return re.sub(r"\s+", "", (raw or "")).upper()


def describe_listing(symbol: str, exchange_code: str | None = None) -> dict:
    """Exchange display name + region for a symbol."""
    if exchange_code and exchange_code in EXCHANGES:
        exchange, region = EXCHANGES[exchange_code]
        return {"exchange": exchange, "region": region}
    for suffix, (exchange, region) in SUFFIX_EXCHANGE.items():
        if symbol.endswith(suffix):
            return {"exchange": exchange, "region": region}
    if symbol.endswith("-USD") or symbol.endswith("-INR"):
        return {"exchange": "Crypto", "region": "Global"}
    # No suffix: Yahoo treats these as US listings
    return {"exchange": exchange_code or "US", "region": "US"}


def _rank(entry: dict, position: int, region_pref: str) -> float:
    """Lower is better. US & India primary listings beat foreign cross-listings."""
    score = float(position)
    region = entry["region"]
    if region_pref in ("us", "india"):
        if region.lower() != region_pref:
            score += 100
    elif region == "Global":
        score += 4  # cross-listings (CDRs, GDRs, secondary exchanges)
    if entry["exchange"] == "BSE India":
        score += 1.5  # prefer NSE over BSE when both exist
    return score


def _from_yahoo(query: str, limit: int) -> list[dict]:
    search = yf.Search(query, max_results=max(limit * 2, 10), news_count=0)
    results = []
    for q in getattr(search, "quotes", None) or []:
        symbol = (q.get("symbol") or "").upper()
        if not symbol or q.get("quoteType") not in ALLOWED_QUOTE_TYPES:
            continue
        if not SYMBOL_RE.match(symbol) or _INDIAN_SERIES_RE.search(symbol):
            continue
        listing = describe_listing(symbol, q.get("exchange"))
        results.append(
            {
                "symbol": symbol,
                "name": q.get("longname") or q.get("shortname") or symbol,
                "exchange": listing["exchange"],
                "region": listing["region"],
                "type": q.get("quoteType"),
            }
        )
    return results


def _from_fallback(query: str) -> list[dict]:
    q = query.lower()
    results = []
    for symbol, name, code in _FALLBACK:
        if q in symbol.lower() or q in name.lower():
            listing = describe_listing(symbol, code)
            results.append(
                {
                    "symbol": symbol,
                    "name": name,
                    "exchange": listing["exchange"],
                    "region": listing["region"],
                    "type": "ETF" if symbol in ("SPY", "QQQ") else "EQUITY",
                }
            )
    return results


def search_symbols(query: str, region: str = "auto", limit: int = 8) -> list[dict]:
    """Find listings by company name or ticker.

    ``region``: "auto" (best listing across markets), "us", "india" or "global".
    The first result is flagged ``recommended`` - the exchange we would pick
    automatically.
    """
    query = (query or "").strip()
    region = (region or "auto").lower()
    if len(query) < 1:
        return []

    key = (query.lower(), region, limit)
    now = time.time()
    with _cache_lock:
        hit = _search_cache.get(key)
        if hit and now - hit[0] < _CACHE_TTL_S:
            return [dict(r) for r in hit[1]]

    try:
        results = _from_yahoo(query, limit)
        source_ok = True
    except Exception as e:
        logger.warning("Yahoo search failed for %r: %s", query, e)
        results = []
        source_ok = False
    if not results:
        results = _from_fallback(query)

    # Region filter ("global" = everything outside US/India)
    if region == "global":
        results = [r for r in results if r["region"] == "Global"]
    elif region in ("us", "india"):
        results = [r for r in results if r["region"].lower() == region]

    # Drop BSE listings when the same company already has an NSE listing
    nse_bases = {r["symbol"][:-3] for r in results if r["symbol"].endswith(".NS")}
    results = [
        r for r in results if not (r["symbol"].endswith(".BO") and r["symbol"][:-3] in nse_bases)
    ]

    # De-duplicate and rank
    seen = set()
    unique = []
    for pos, r in enumerate(results):
        if r["symbol"] in seen:
            continue
        seen.add(r["symbol"])
        unique.append((_rank(r, pos, region), r))
    unique.sort(key=lambda x: x[0])
    final = [r for _, r in unique[:limit]]
    for i, r in enumerate(final):
        r["recommended"] = i == 0

    if source_ok or final:
        with _cache_lock:
            _search_cache[key] = (now, [dict(r) for r in final])
    return final


def _has_price_data(symbol: str) -> bool | None:
    """True/False if Yahoo answered; None if Yahoo could not be reached."""
    try:
        hist = yf.Ticker(symbol).history(period="1mo", auto_adjust=True)
    except Exception as e:
        logger.warning("Price check failed for %s: %s", symbol, e)
        return None
    return bool(hist is not None and not hist.empty and "Close" in hist.columns)


def _display_name(symbol: str) -> str:
    try:
        for r in _from_yahoo(symbol, 3):
            if r["symbol"] == symbol:
                return r["name"]
    except Exception:
        pass
    for s, name, _ in _FALLBACK:
        if s == symbol:
            return name
    return symbol


def _describe(symbol: str) -> dict:
    listing = describe_listing(symbol)
    # Prefer the exchange code Yahoo reports when it is available
    try:
        for q in getattr(yf.Search(symbol, max_results=5, news_count=0), "quotes", None) or []:
            if (q.get("symbol") or "").upper() == symbol:
                listing = describe_listing(symbol, q.get("exchange"))
                return {
                    "symbol": symbol,
                    "name": q.get("longname") or q.get("shortname") or symbol,
                    **listing,
                }
    except Exception:
        pass
    return {"symbol": symbol, "name": _display_name(symbol), **listing}


def resolve_symbol(raw: str) -> dict:
    """Validate a user supplied ticker and pick the right exchange.

    "AAPL" -> AAPL (NASDAQ); "RELIANCE" -> RELIANCE.NS (NSE India).
    Raises SymbolNotFound (with suggestions) for unknown symbols and
    ConnectionError when Yahoo can't be reached to verify.
    """
    symbol = normalize_symbol(raw)
    if not symbol or not SYMBOL_RE.match(symbol):
        raise SymbolNotFound(
            f"'{raw}' is not a valid ticker symbol. Use letters/numbers, e.g. AAPL or RELIANCE.NS."
        )

    now = time.time()
    with _cache_lock:
        hit = _resolve_cache.get(symbol)
        if hit and now - hit[0] < _CACHE_TTL_S:
            return dict(hit[1])

    candidates = [symbol]
    has_market_suffix = "." in symbol or symbol.startswith("^") or "=" in symbol or "-" in symbol
    if not has_market_suffix:
        # Bare symbol that is not a US listing is probably Indian: try NSE then BSE
        candidates += [f"{symbol}.NS", f"{symbol}.BO"]

    unreachable = 0
    for cand in candidates:
        found = _has_price_data(cand)
        if found is None:
            unreachable += 1
            continue
        if found:
            result = _describe(cand)
            with _cache_lock:
                _resolve_cache[symbol] = (now, result)
            return dict(result)

    if unreachable == len(candidates):
        raise ConnectionError("Market data provider is unreachable; could not verify the ticker.")

    suggestions = []
    try:
        suggestions = search_symbols(symbol, limit=5)
    except Exception:
        pass
    hint = ""
    if suggestions:
        hint = " Did you mean " + ", ".join(f"{s['symbol']} ({s['name']})" for s in suggestions[:3]) + "?"
    raise SymbolNotFound(f"Ticker '{symbol}' was not found on any supported exchange.{hint}", suggestions)
