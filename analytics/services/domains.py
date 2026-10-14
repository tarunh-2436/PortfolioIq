"""Classify tickers into investment domains (Technology, Defense & Aerospace, ...).

Scenario simulation and sector allocation work at the domain level rather than
per ticker. Classification order:
  1. built-in map of well known tickers (instant, works offline)
  2. Yahoo Finance sector / industry (cached)
  3. "Other"
"""

import logging
from concurrent.futures import ThreadPoolExecutor

from .market_data import get_ticker_info

logger = logging.getLogger("analytics.domains")

DOMAINS = [
    "Technology",
    "Semiconductors",
    "Communication Services",
    "Consumer Discretionary",
    "Consumer Staples",
    "Healthcare",
    "Financials",
    "Energy",
    "Industrials",
    "Defense & Aerospace",
    "Utilities",
    "Materials",
    "Real Estate",
    "Crypto",
    "Diversified / ETFs",
    "Other",
]

_SECTOR_TO_DOMAIN = {
    "technology": "Technology",
    "communication services": "Communication Services",
    "consumer cyclical": "Consumer Discretionary",
    "consumer discretionary": "Consumer Discretionary",
    "consumer defensive": "Consumer Staples",
    "consumer staples": "Consumer Staples",
    "healthcare": "Healthcare",
    "health care": "Healthcare",
    "financial services": "Financials",
    "financials": "Financials",
    "financial": "Financials",
    "energy": "Energy",
    "industrials": "Industrials",
    "utilities": "Utilities",
    "basic materials": "Materials",
    "materials": "Materials",
    "real estate": "Real Estate",
}

# ETF "category" text from Yahoo -> domain (substring match, first hit wins)
_CATEGORY_HINTS = [
    ("semiconductor", "Semiconductors"),
    ("technology", "Technology"),
    ("communication", "Communication Services"),
    ("health", "Healthcare"),
    ("financial", "Financials"),
    ("energy", "Energy"),
    ("natural resources", "Energy"),
    ("utilities", "Utilities"),
    ("real estate", "Real Estate"),
    ("consumer defensive", "Consumer Staples"),
    ("consumer staples", "Consumer Staples"),
    ("consumer cyclical", "Consumer Discretionary"),
    ("consumer discretionary", "Consumer Discretionary"),
    ("industrial", "Industrials"),
    ("materials", "Materials"),
    ("defense", "Defense & Aerospace"),
]


def _build_static_map() -> dict:
    groups = {
        "Technology": (
            "AAPL MSFT ORCL CRM ADBE NOW INTU IBM CSCO PLTR SNOW PANW CRWD NET DDOG SHOP SAP SNPS CDNS ANET "
            "TCS.NS INFY.NS WIPRO.NS HCLTECH.NS TECHM.NS LTIM.NS PERSISTENT.NS COFORGE.NS MPHASIS.NS "
            "INFY TCS.BO INFY.BO"
        ),
        "Semiconductors": (
            "NVDA AMD INTC AVGO QCOM TXN MU AMAT LRCX KLAC TSM ASML ARM MRVL ON NXPI ADI SMCI "
            "SOXX SMH"
        ),
        "Communication Services": (
            "GOOGL GOOG META NFLX DIS CMCSA T VZ TMUS SPOT SNAP PINS RBLX EA TTWO WBD "
            "BHARTIARTL.NS IDEA.NS INDUSTOWER.NS"
        ),
        "Consumer Discretionary": (
            "AMZN TSLA HD MCD NKE SBUX LOW TJX BKNG ABNB UBER F GM RIVN LCID CMG LULU MAR YUM "
            "MARUTI.NS M&M.NS TATAMOTORS.NS BAJAJ-AUTO.NS EICHERMOT.NS TITAN.NS HEROMOTOCO.NS "
            "ZOMATO.NS TMPV.NS TMCV.NS"
        ),
        "Consumer Staples": (
            "WMT COST PG KO PEP PM MO MDLZ CL KMB TGT GIS KHC STZ "
            "HINDUNILVR.NS ITC.NS NESTLEIND.NS BRITANNIA.NS TATACONSUM.NS DABUR.NS"
        ),
        "Healthcare": (
            "JNJ UNH PFE MRK ABBV LLY TMO ABT AMGN GILD BMY CVS MDT ISRG VRTX REGN MRNA "
            "SUNPHARMA.NS DRREDDY.NS CIPLA.NS APOLLOHOSP.NS DIVISLAB.NS LUPIN.NS"
        ),
        "Financials": (
            "JPM BAC WFC C GS MS V MA AXP BLK SCHW BRK-B BRK.B PYPL COF USB PNC "
            "HDFCBANK.NS ICICIBANK.NS SBIN.NS KOTAKBANK.NS AXISBANK.NS BAJFINANCE.NS BAJAJFINSV.NS "
            "INDUSINDBK.NS LICI.NS SBILIFE.NS HDFCLIFE.NS"
        ),
        "Energy": (
            "XOM CVX COP SLB EOG OXY PSX MPC VLO BP SHEL "
            "RELIANCE.NS ONGC.NS BPCL.NS IOC.NS COALINDIA.NS GAIL.NS"
        ),
        "Industrials": (
            "CAT DE HON UPS UNP BA GE MMM FDX WM EMR ETN ITW "
            "LT.NS SIEMENS.NS ABB.NS ADANIPORTS.NS BEL.NS"
        ),
        "Defense & Aerospace": (
            "LMT RTX NOC GD LHX HII TDG TXT LDOS KTOS AVAV BWXT "
            "HAL.NS BEL.NS BDL.NS MAZDOCK.NS COCHINSHIP.NS BEML.NS"
        ),
        "Utilities": (
            "NEE DUK SO D AEP EXC SRE XEL PCG "
            "NTPC.NS POWERGRID.NS TATAPOWER.NS ADANIPOWER.NS ADANIGREEN.NS"
        ),
        "Materials": (
            "LIN SHW APD FCX NEM NUE DOW DD ECL "
            "TATASTEEL.NS JSWSTEEL.NS HINDALCO.NS ULTRACEMCO.NS GRASIM.NS VEDL.NS ASIANPAINT.NS"
        ),
        "Real Estate": "PLD AMT EQIX SPG O PSA WELL DLR DLF.NS GODREJPROP.NS OBEROIRLTY.NS",
        "Crypto": "COIN MSTR MARA RIOT",
        "Diversified / ETFs": (
            "SPY VOO IVV VTI QQQ DIA IWM VEA VWO EFA EEM AGG BND TLT GLD SLV "
            "^GSPC ^DJI ^IXIC ^NSEI ^BSESN NIFTYBEES.NS"
        ),
    }
    mapping = {}
    for domain, tickers in groups.items():
        for t in tickers.split():
            mapping.setdefault(t, domain)
    # BEL is both listed above; defense wins for Indian defense names
    mapping["BEL.NS"] = "Defense & Aerospace"
    mapping["HAL.NS"] = "Defense & Aerospace"
    return mapping


_STATIC = _build_static_map()


def _from_info(info: dict) -> str | None:
    quote_type = (info.get("quote_type") or "").upper()
    sector = (info.get("sector") or "").strip().lower()
    industry = (info.get("industry") or "").strip().lower()

    if quote_type == "CRYPTOCURRENCY":
        return "Crypto"
    if quote_type in ("INDEX", "MUTUALFUND", "ETF", "FUTURE", "CURRENCY") and not sector:
        category = (info.get("category") or "").lower()
        for hint, domain in _CATEGORY_HINTS:
            if hint in category:
                return domain
        return "Diversified / ETFs"

    if "aerospace" in industry and "defense" in industry:
        return "Defense & Aerospace"
    if "semiconductor" in industry:
        return "Semiconductors"
    if sector in _SECTOR_TO_DOMAIN:
        return _SECTOR_TO_DOMAIN[sector]
    return None


def classify_ticker(ticker: str) -> str:
    t = ticker.strip().upper()
    if t in _STATIC:
        return _STATIC[t]
    try:
        domain = _from_info(get_ticker_info(t))
        if domain:
            return domain
    except Exception as e:
        logger.debug("Classification lookup failed for %s: %s", t, e)
    return "Other"


def classify_tickers(tickers: list[str]) -> dict[str, str]:
    """Map every ticker to a domain (parallel lookups for unknown tickers)."""
    unique = list(dict.fromkeys(t.strip().upper() for t in tickers))
    if len(unique) <= 1:
        return {t: classify_ticker(t) for t in unique}
    with ThreadPoolExecutor(max_workers=min(3, len(unique))) as pool:
        return dict(zip(unique, pool.map(classify_ticker, unique)))


def group_by_domain(portfolio: list[dict]) -> list[dict]:
    """Aggregate [{ticker, weight}] into [{domain, weight, holdings_count}],
    heaviest domain first. ``weight`` is a fraction (0-1)."""
    mapping = classify_tickers([h["ticker"] for h in portfolio])
    grouped: dict[str, dict] = {}
    for h in portfolio:
        domain = mapping[h["ticker"].strip().upper()]
        g = grouped.setdefault(domain, {"domain": domain, "weight": 0.0, "holdings_count": 0})
        g["weight"] += float(h["weight"])
        g["holdings_count"] += 1
    result = list(grouped.values())
    for g in result:
        g["weight"] = round(g["weight"], 6)
    result.sort(key=lambda g: g["weight"], reverse=True)
    return result
