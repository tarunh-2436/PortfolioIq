"""Tests for ticker search/resolution, domain scenarios, optimizer explanations and LLM resilience.

Nothing here touches the network: Yahoo Finance and Gemini are mocked.
"""

import os
import sys
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app  # noqa: E402

client = TestClient(app)


# ---------------------------------------------------------------------------
# Domain scenarios
# ---------------------------------------------------------------------------

def test_scenario_groups_holdings_by_domain():
    response = client.post(
        "/scenario",
        json={
            "portfolio": [
                {"ticker": "AAPL", "weight": 0.3},
                {"ticker": "MSFT", "weight": 0.3},
                {"ticker": "LMT", "weight": 0.4},
            ],
            "portfolio_value": 100000,
            "scenario": "geopolitical_conflict",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "assets" not in data  # tickers are not exposed, only domains
    domains = {d["domain"]: d for d in data["domains"]}
    assert domains["Technology"]["holdings_count"] == 2
    assert domains["Technology"]["weight"] == 60.0
    assert domains["Defense & Aerospace"]["shock"] > 0  # defense benefits from conflict
    assert data["insights"]


def test_scenario_custom_domain_shocks_only_touch_listed_domains():
    response = client.post(
        "/scenario",
        json={
            "portfolio": [{"ticker": "AAPL", "weight": 0.5}, {"ticker": "JPM", "weight": 0.5}],
            "portfolio_value": 100000,
            "domain_shocks": {"Technology": -0.10},
        },
    )
    assert response.status_code == 200
    domains = {d["domain"]: d for d in response.json()["domains"]}
    assert domains["Technology"]["change"] == -5000
    assert domains["Financials"]["change"] == 0


def test_scenario_rejects_unknown_domain_and_bad_shock():
    portfolio = [{"ticker": "AAPL", "weight": 1.0}]
    r = client.post("/scenario", json={"portfolio": portfolio, "domain_shocks": {"Bogus": 0.1}})
    assert r.status_code == 400
    assert "Unknown domain" in r.json()["detail"]
    r = client.post("/scenario", json={"portfolio": portfolio, "domain_shocks": {"Technology": -1.5}})
    assert r.status_code == 400
    r = client.post("/scenario", json={"portfolio": portfolio})
    assert r.status_code == 400  # neither a scenario nor shocks


def test_scenario_catalog_is_rich():
    data = client.get("/scenario/types").json()["scenarios"]
    assert len(data) >= 12
    ids = {s["id"] for s in data}
    assert {"market_crash", "technology_downturn", "market_recovery"} <= ids
    for s in data:
        assert s["domain_shocks"]
        assert s["category"]


def test_classify_endpoint():
    r = client.post(
        "/classify",
        json={"portfolio": [{"ticker": "NVDA", "weight": 0.5}, {"ticker": "XOM", "weight": 0.5}]},
    )
    assert r.status_code == 200
    assert {d["domain"] for d in r.json()["domains"]} == {"Semiconductors", "Energy"}


def test_domain_classification_from_yahoo_info():
    from services import domains as dom

    with patch.object(dom, "get_ticker_info", return_value={"sector": "Industrials", "industry": "Aerospace & Defense"}):
        assert dom.classify_ticker("SOMEDEFENSECO") == "Defense & Aerospace"
    with patch.object(dom, "get_ticker_info", return_value={"quote_type": "ETF", "category": "Health"}):
        assert dom.classify_ticker("SOMEHEALTHETF") == "Healthcare"
    with patch.object(dom, "get_ticker_info", side_effect=Exception("boom")):
        assert dom.classify_ticker("UNKNOWNCO") == "Other"


# ---------------------------------------------------------------------------
# Ticker search / exchange resolution
# ---------------------------------------------------------------------------

def test_search_ranking_marks_best_match_and_drops_bse_duplicates():
    from services import symbols

    fake = [
        {"symbol": "INFY.BO", "name": "Infosys", "exchange": "BSE India", "region": "India", "type": "EQUITY"},
        {"symbol": "INFY.NS", "name": "Infosys", "exchange": "NSE India", "region": "India", "type": "EQUITY"},
        {"symbol": "INFY.VI", "name": "Infosys", "exchange": "Vienna", "region": "Global", "type": "EQUITY"},
        {"symbol": "INFY", "name": "Infosys ADR", "exchange": "NYSE", "region": "US", "type": "EQUITY"},
    ]
    symbols._search_cache.clear()
    with patch.object(symbols, "_from_yahoo", return_value=fake):
        results = client.get("/search", params={"q": "infosys"}).json()["results"]
        found = [r["symbol"] for r in results]
        assert "INFY.BO" not in found  # BSE duplicate of the NSE listing is dropped
        assert found[-1] == "INFY.VI"  # cross-listings rank last
        assert results[0]["recommended"] is True

        symbols._search_cache.clear()
        india = client.get("/search", params={"q": "infosys", "region": "india"}).json()["results"]
        assert [r["symbol"] for r in india] == ["INFY.NS"]
    symbols._search_cache.clear()


def test_search_falls_back_offline():
    from services import symbols

    symbols._search_cache.clear()
    with patch.object(symbols, "_from_yahoo", side_effect=Exception("yahoo down")):
        results = client.get("/search", params={"q": "reliance"}).json()["results"]
    assert results and results[0]["symbol"] == "RELIANCE.NS"
    symbols._search_cache.clear()


def test_search_validates_input():
    assert client.get("/search", params={"q": ""}).status_code == 400
    assert client.get("/search", params={"q": "x" * 100}).status_code == 400
    assert client.get("/search", params={"q": "apple", "region": "mars"}).status_code == 400


def test_resolve_picks_indian_exchange_automatically():
    from services import symbols

    symbols._resolve_cache.clear()
    seen = []

    def fake_has_data(sym):
        seen.append(sym)
        return sym == "RELIANCE.NS"

    with patch.object(symbols, "_has_price_data", side_effect=fake_has_data), patch.object(
        symbols,
        "_describe",
        side_effect=lambda s: {"symbol": s, "name": "Reliance", "exchange": "NSE India", "region": "India"},
    ):
        r = client.get("/resolve", params={"symbol": "reliance"})
    assert r.status_code == 200
    assert r.json()["symbol"] == "RELIANCE.NS"
    assert seen == ["RELIANCE", "RELIANCE.NS"]  # US first, then NSE
    symbols._resolve_cache.clear()


def test_resolve_unknown_invalid_and_unreachable():
    from services import symbols

    symbols._resolve_cache.clear()
    with patch.object(symbols, "_has_price_data", return_value=False), patch.object(
        symbols, "search_symbols", return_value=[]
    ):
        assert client.get("/resolve", params={"symbol": "ZZZZQQ"}).status_code == 404
    assert client.get("/resolve", params={"symbol": "bad symbol!"}).status_code == 404
    symbols._resolve_cache.clear()
    with patch.object(symbols, "_has_price_data", return_value=None):
        assert client.get("/resolve", params={"symbol": "AAPL"}).status_code == 503
    symbols._resolve_cache.clear()


# ---------------------------------------------------------------------------
# Optimizer explanation
# ---------------------------------------------------------------------------

def _prices(seed, drifts, vols):
    rng = np.random.default_rng(seed)
    dates = pd.date_range("2025-01-01", periods=250)
    return pd.DataFrame(
        {
            name: 100 * np.cumprod(1 + rng.normal(drift, vol, 250))
            for (name, drift), vol in zip(drifts.items(), vols)
        },
        index=dates,
    )


def test_optimize_returns_explanation_and_current_comparison():
    data = _prices(7, {"AAA": 0.0012, "BBB": 0.0003, "CCC": 0.0008}, [0.01, 0.015, 0.012])
    with patch("services.optimization.get_historical_prices", return_value=data):
        response = client.post(
            "/optimize",
            json={
                "tickers": ["AAA", "BBB", "CCC"],
                "current_weights": {"AAA": 0.2, "BBB": 0.5, "CCC": 0.3},
                "include_ai": False,
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert abs(sum(body["weights"].values()) - 1.0) < 0.01
    assert body["current"]["sharpe_ratio"] is not None
    exp = body["explanation"]
    assert exp["summary"] and exp["notes"]
    assets = {a["ticker"]: a for a in exp["assets"]}
    assert set(assets) == {"AAA", "BBB", "CCC"}
    for a in assets.values():
        assert a["reasons"], "every asset needs an explanation"
        assert a["action"] in {"Hold", "Exit", "Add", "Increase", "Reduce"}
    assert "ai" not in body  # include_ai=False skips the LLM


def test_optimize_falls_back_to_min_volatility_when_nothing_beats_risk_free():
    data = _prices(3, {"AAA": -0.001, "BBB": -0.0015}, [0.01, 0.012])
    with patch("services.optimization.get_historical_prices", return_value=data):
        response = client.post("/optimize", json={"tickers": ["AAA", "BBB"], "include_ai": False})
    assert response.status_code == 200
    assert response.json()["method"] == "min_volatility"


def test_optimize_survives_llm_outage():
    data = _prices(5, {"AAPL": 0.001, "MSFT": 0.0008}, [0.01, 0.012])
    with patch("services.optimization.get_historical_prices", return_value=data), patch(
        "main.generate_optimization_narrative", side_effect=Exception("LLM exploded")
    ):
        response = client.post("/optimize", json={"tickers": ["AAPL", "MSFT"]})
    assert response.status_code == 200
    body = response.json()
    assert body["ai"]["available"] is False
    assert "LLM unavailable" in body["ai"]["error"]
    assert body["explanation"]["summary"]


# ---------------------------------------------------------------------------
# LLM wrapper reliability
# ---------------------------------------------------------------------------

class _APIError(Exception):
    def __init__(self, code, msg="err"):
        super().__init__(f"{code} {msg}")
        self.code = code


class _FakeResponse:
    def __init__(self, text):
        self.text = text
        self.candidates = []


def _fake_client(behaviour):
    """behaviour(model) returns text or raises."""

    class Models:
        calls = []

        def list(self):
            raise Exception("no discovery")

        def generate_content(self, model, contents, config):
            Models.calls.append(model)
            return _FakeResponse(behaviour(model))

    class Client:
        models = Models()

    return Client()


def _raise(code, msg="err"):
    def inner(model):
        raise _APIError(code, msg)

    return inner


@pytest.fixture
def llm(monkeypatch):
    from services import llm as llm_mod

    llm_mod.reset_state()
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_MODELS", "m-a,m-b,m-c")
    monkeypatch.setattr(llm_mod.time, "sleep", lambda s: None)
    yield llm_mod
    llm_mod.reset_state()


def test_llm_fails_over_to_next_model(llm):
    def behaviour(model):
        if model == "m-a":
            raise _APIError(503, "overloaded")
        if model == "m-b":
            raise _APIError(429, "quota")
        return "hello"

    with patch.object(llm, "_get_client", return_value=_fake_client(behaviour)):
        result = llm.generate_text("prompt")
    assert result == {"available": True, "text": "hello", "model": "m-c"}


def test_llm_skips_retired_models_and_remembers_last_good(llm):
    def behaviour(model):
        if model == "m-a":
            raise _APIError(404, "retired")
        return "ok"

    client_obj = _fake_client(behaviour)
    with patch.object(llm, "_get_client", return_value=client_obj):
        assert llm.generate_text("first")["model"] == "m-b"
        before = len(client_obj.models.calls)
        assert llm.generate_text("second")["model"] == "m-b"
        # goes straight to the last good model; the retired one is not retried
        assert client_obj.models.calls[before:] == ["m-b"]


def test_llm_unavailable_returns_clean_result_and_trips_breaker(llm):
    client_obj = _fake_client(_raise(503, "high demand"))
    with patch.object(llm, "_get_client", return_value=client_obj):
        first = llm.generate_text("p1")
        assert first["available"] is False
        assert first["text"] is None
        assert first["error"].startswith("LLM unavailable")
        calls = len(client_obj.models.calls)
        # circuit breaker is open: new prompts fail instantly without calling the API
        second = llm.generate_text("p2")
        assert second["available"] is False
        assert len(client_obj.models.calls) == calls


def test_llm_caches_identical_prompts(llm):
    client_obj = _fake_client(lambda model: "cached answer")
    with patch.object(llm, "_get_client", return_value=client_obj):
        llm.generate_text("same")
        llm.generate_text("same")
    assert len(client_obj.models.calls) == 1


def test_llm_without_api_key(monkeypatch):
    from services import llm as llm_mod

    llm_mod.reset_state()
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    result = llm_mod.generate_text("p")
    assert result["available"] is False
    assert "GEMINI_API_KEY" in result["error"]


def test_llm_rejected_key_stops_immediately(llm):
    client_obj = _fake_client(_raise(403, "bad key"))
    with patch.object(llm, "_get_client", return_value=client_obj):
        result = llm.generate_text("p")
    assert result["available"] is False
    assert len(client_obj.models.calls) == 1


def test_analyze_returns_everything_when_llm_is_down(llm):
    dates = pd.date_range("2025-01-01", periods=60)
    data = pd.DataFrame({"AAPL": np.linspace(150, 180, 60), "MSFT": np.linspace(300, 350, 60)}, index=dates)
    client_obj = _fake_client(_raise(503, "down"))
    with patch.object(llm, "_get_client", return_value=client_obj), patch(
        "main.get_historical_prices", return_value=data
    ), patch("main.get_current_prices", return_value={"AAPL": 180.0, "MSFT": 350.0}), patch(
        "main.get_market_beta", return_value=1.0
    ):
        response = client.post(
            "/analyze",
            json={"portfolio": [{"ticker": "AAPL", "weight": 0.5}, {"ticker": "MSFT", "weight": 0.5}]},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["ai"]["available"] is False
    assert "LLM unavailable" in body["ai"]["error"]
    assert body["metrics"]["annual_return"] is not None
    assert body["diversification"]["sector_allocation"]  # domains still present


# ---------------------------------------------------------------------------
# Market data resilience
# ---------------------------------------------------------------------------

def _series(n=60, start=100.0):
    return pd.Series(np.linspace(start, start + 10, n), index=pd.date_range("2025-01-01", periods=n))


@pytest.fixture
def clean_market_cache():
    from services import market_data as md

    md._price_cache.clear()
    md._stale_cache.clear()
    yield md
    md._price_cache.clear()
    md._stale_cache.clear()


def test_stale_prices_are_used_when_yahoo_fails(clean_market_cache):
    md = clean_market_cache
    md._stale_cache[("AAA", "1y")] = (__import__("time").time() - 3600, _series())
    with patch.object(md, "_fetch_from_yahoo", return_value=pd.DataFrame()):
        prices = md.get_historical_prices(["AAA"])
    assert list(prices.columns) == ["AAA"] and len(prices) == 60


def test_yahoo_outage_is_503_not_a_bad_ticker(clean_market_cache):
    md = clean_market_cache
    with patch.object(md, "_fetch_from_yahoo", return_value=pd.DataFrame()), patch.object(
        md, "_provider_is_up", return_value=False
    ):
        r = client.post(
            "/analyze",
            json={"portfolio": [{"ticker": "AAA", "weight": 0.5}, {"ticker": "BBB", "weight": 0.5}]},
        )
        assert r.status_code == 503
        assert "not responding" in r.json()["detail"]
        r = client.post("/optimize", json={"tickers": ["AAA", "BBB"], "include_ai": False})
        assert r.status_code == 503


def test_unknown_ticker_is_400_when_yahoo_is_up(clean_market_cache):
    md = clean_market_cache
    with patch.object(md, "_fetch_from_yahoo", return_value=pd.DataFrame()), patch.object(
        md, "_provider_is_up", return_value=True
    ):
        r = client.post(
            "/analyze",
            json={"portfolio": [{"ticker": "NOPE", "weight": 0.5}, {"ticker": "NOPE2", "weight": 0.5}]},
        )
    assert r.status_code == 400
    assert "Market data unavailable" in r.json()["detail"]


def test_fresh_cache_avoids_refetching(clean_market_cache):
    md = clean_market_cache
    import time as _t

    md._price_cache[("AAA", "1y")] = (_t.time() + 600, _series())
    with patch.object(md, "_fetch_from_yahoo", side_effect=AssertionError("should not fetch")):
        prices = md.get_historical_prices(["AAA"])
    assert len(prices) == 60
