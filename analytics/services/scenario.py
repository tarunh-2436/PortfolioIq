from .market_data import get_ticker_info

SCENARIOS = {
    "market_crash": {
        "name": "Market Crash",
        "description": "Broad market decline across equity holdings.",
        "default_shock": -0.20,
    },
    "technology_downturn": {
        "name": "Technology Downturn",
        "description": "Technology-sector holdings experience a severe decline.",
        "sector_shock": {"Technology": -0.30},
        "default_shock": -0.10,
    },
    "market_recovery": {
        "name": "Market Recovery",
        "description": "Broad equity market recovery.",
        "default_shock": 0.15,
    },
}


def run_named_scenario(portfolio: list, scenario_id: str, portfolio_value: float):
    if scenario_id not in SCENARIOS:
        raise ValueError(f"Unknown scenario: {scenario_id}")

    if portfolio_value <= 0:
        raise ValueError("Portfolio value must be greater than 0.")

    scenario = SCENARIOS[scenario_id]
    scenario_portfolio = []

    for holding in portfolio:
        ticker = holding["ticker"]
        weight = float(holding["weight"])
        shock = scenario.get("default_shock", 0.0)

        sector_shocks = scenario.get("sector_shock", {})
        if sector_shocks:
            try:
                info = get_ticker_info(ticker)
                sector = info.get("sector", "Unknown")
                if sector in sector_shocks:
                    shock = sector_shocks[sector]
            except Exception:
                pass

        scenario_portfolio.append({"ticker": ticker, "weight": weight, "shock": shock})

    result = run_custom_scenario(scenario_portfolio, portfolio_value)
    result["scenario"] = {
        "id": scenario_id,
        "name": scenario["name"],
        "description": scenario["description"],
    }

    return result


def run_custom_scenario(portfolio: list, portfolio_value: float):
    if portfolio_value <= 0:
        raise ValueError("Portfolio value must be greater than 0.")

    initial_value = float(portfolio_value)
    asset_results = []
    total_change = 0.0

    for holding in portfolio:
        ticker = holding["ticker"]
        weight = float(holding["weight"])
        shock = float(holding.get("shock") or 0.0)

        initial_asset_value = initial_value * weight
        change = initial_asset_value * shock
        final_asset_value = initial_asset_value + change

        total_change += change

        asset_results.append(
            {
                "ticker": ticker,
                "weight": round(weight * 100, 2),
                "shock": round(shock * 100, 2),
                "initial_value": round(initial_asset_value, 2),
                "change": round(change, 2),
                "final_value": round(final_asset_value, 2),
            }
        )

    final_value = initial_value + total_change
    percentage_change = (total_change / initial_value) if initial_value > 0 else 0.0

    return {
        "initial_value": round(initial_value, 2),
        "final_value": round(final_value, 2),
        "absolute_change": round(total_change, 2),
        "percentage_change": round(percentage_change * 100, 2),
        "assets": asset_results,
    }


def get_available_scenarios():
    return [
        {
            "id": scenario_id,
            "name": scenario["name"],
            "description": scenario["description"],
        }
        for scenario_id, scenario in SCENARIOS.items()
    ]

