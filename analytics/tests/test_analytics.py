import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
import pandas as pd
import numpy as np

import sys
import os

# Add analytics directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_analyze_empty_portfolio():
    response = client.post("/analyze", json={"portfolio": []})
    assert response.status_code == 400


def test_analyze_duplicate_tickers():
    response = client.post(
        "/analyze",
        json={
            "portfolio": [
                {"ticker": "AAPL", "weight": 0.5},
                {"ticker": "AAPL", "weight": 0.5},
            ]
        },
    )
    assert response.status_code == 400
    assert "Duplicate tickers" in response.json()["detail"]


def test_analyze_invalid_weights_sum():
    response = client.post(
        "/analyze",
        json={
            "portfolio": [
                {"ticker": "AAPL", "weight": 0.5},
                {"ticker": "MSFT", "weight": 0.2},
            ]
        },
    )
    assert response.status_code == 400
    assert "weights must sum to 1.0" in response.json()["detail"]


def test_analyze_negative_weights():
    response = client.post(
        "/analyze",
        json={
            "portfolio": [
                {"ticker": "AAPL", "weight": 1.2},
                {"ticker": "MSFT", "weight": -0.2},
            ]
        },
    )
    assert response.status_code == 400


def test_analyze_invalid_ticker():
    with patch("main.get_historical_prices", side_effect=ValueError("Market data unavailable for: ['INVALIDTICKER123']")):
        response = client.post(
            "/analyze",
            json={
                "portfolio": [
                    {"ticker": "INVALIDTICKER123", "weight": 0.5},
                    {"ticker": "MSFT", "weight": 0.5},
                ]
            },
        )
        assert response.status_code == 400
        assert "market data" in response.json()["detail"].lower()


def test_analyze_valid_diversified_portfolio():
    dates = pd.date_range("2025-01-01", periods=100)
    mock_data = pd.DataFrame(
        {
            "AAPL": np.linspace(150, 180, 100),
            "MSFT": np.linspace(300, 350, 100),
            "JPM": np.linspace(140, 160, 100),
        },
        index=dates,
    )
    with patch("main.get_historical_prices", return_value=mock_data), \
         patch("main.get_current_prices", return_value={"AAPL": 180.0, "MSFT": 350.0, "JPM": 160.0}), \
         patch("main.get_market_beta", return_value=1.05), \
         patch("main.calculate_sector_allocation", return_value={"Technology": 80.0, "Financial": 20.0}):
        
        response = client.post(
            "/analyze",
            json={
                "portfolio": [
                    {"ticker": "AAPL", "weight": 0.4},
                    {"ticker": "MSFT", "weight": 0.4},
                    {"ticker": "JPM", "weight": 0.2},
                ]
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "metrics" in data
        assert "diversification" in data
        assert "health" in data
        assert "performance" in data
        assert "holdings" in data
        assert "correlation" in data
        assert "recommendations" in data
        assert "ai" in data


def test_analyze_gemini_unavailable():
    dates = pd.date_range("2025-01-01", periods=50)
    mock_data = pd.DataFrame(
        {
            "AAPL": np.linspace(150, 180, 50),
            "MSFT": np.linspace(300, 350, 50),
        },
        index=dates,
    )
    with patch("main.get_historical_prices", return_value=mock_data), \
         patch("main.get_current_prices", return_value={"AAPL": 180.0, "MSFT": 350.0}), \
         patch("main.generate_explanation", side_effect=Exception("Gemini network error")):
        
        response = client.post(
            "/analyze",
            json={
                "portfolio": [
                    {"ticker": "AAPL", "weight": 0.5},
                    {"ticker": "MSFT", "weight": 0.5},
                ]
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["ai"]["available"] is False
        assert data["ai"]["analysis"] is None




def test_scenario_named():
    response = client.post(
        "/scenario",
        json={
            "portfolio": [
                {"ticker": "AAPL", "weight": 0.6},
                {"ticker": "MSFT", "weight": 0.4},
            ],
            "portfolio_value": 500000,
            "scenario": "market_crash",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["initial_value"] == 500000
    assert data["final_value"] < 500000
    assert data["scenario"]["id"] == "market_crash"


def test_scenario_custom():
    response = client.post(
        "/scenario",
        json={
            "portfolio": [
                {"ticker": "AAPL", "weight": 0.5, "shock": -0.10},
                {"ticker": "MSFT", "weight": 0.5, "shock": 0.20},
            ],
            "portfolio_value": 100000,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["initial_value"] == 100000
    assert data["absolute_change"] == 5000  # -5000 + 10000 = +5000
    assert data["percentage_change"] == 5.0


def test_optimize_valid():
    dates = pd.date_range("2025-01-01", periods=100)
    mock_data = pd.DataFrame(
        {
            "AAPL": np.linspace(150, 180, 100) + np.random.normal(0, 1, 100),
            "MSFT": np.linspace(300, 350, 100) + np.random.normal(0, 2, 100),
        },
        index=dates,
    )
    with patch("services.optimization.get_historical_prices", return_value=mock_data):
        response = client.post(
            "/optimize",
            json={"tickers": ["AAPL", "MSFT"]},
        )
        assert response.status_code == 200
        data = response.json()
        assert "weights" in data
        assert "expected_return" in data
        assert "volatility" in data
        assert "sharpe_ratio" in data
