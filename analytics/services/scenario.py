"""Domain-level scenario simulation.

Holdings are classified into domains (Technology, Defense & Aerospace, ...).
A scenario is a set of return shocks per domain; the portfolio impact is the
weighted sum. Shock figures are *illustrative assumptions* loosely modelled on
historical episodes - they are stress-test inputs, not forecasts.
"""

from .domains import DOMAINS, group_by_domain

MAX_SHOCK = 5.0     # +500%
MIN_SHOCK = -1.0    # -100% (cannot lose more than everything)


def _s(default: float, **overrides) -> dict:
    """Build a full domain->shock map from a default plus overrides.

    Override keys use underscores for spaces and ``and`` for ``&``/``/``."""
    names = {
        "Technology": "Technology",
        "Semiconductors": "Semiconductors",
        "Communication": "Communication Services",
        "Discretionary": "Consumer Discretionary",
        "Staples": "Consumer Staples",
        "Healthcare": "Healthcare",
        "Financials": "Financials",
        "Energy": "Energy",
        "Industrials": "Industrials",
        "Defense": "Defense & Aerospace",
        "Utilities": "Utilities",
        "Materials": "Materials",
        "RealEstate": "Real Estate",
        "Crypto": "Crypto",
        "ETFs": "Diversified / ETFs",
    }
    shocks = {d: default for d in DOMAINS}
    for key, value in overrides.items():
        shocks[names[key]] = value
    return shocks


SCENARIOS = {
    "market_crash": {
        "name": "Broad Market Crash",
        "category": "Downturn",
        "description": "Equities fall ~20% across the board; defensive domains hold up better.",
        "domain_shocks": _s(
            -0.20, Technology=-0.25, Semiconductors=-0.30, Financials=-0.24, Energy=-0.22,
            Staples=-0.10, Healthcare=-0.12, Utilities=-0.12, Crypto=-0.40, ETFs=-0.20,
        ),
    },
    "recession": {
        "name": "Economic Recession",
        "category": "Downturn",
        "description": "Demand slump hits cyclicals hardest; staples, healthcare and utilities are resilient.",
        "domain_shocks": _s(
            -0.12, Discretionary=-0.22, Industrials=-0.18, Financials=-0.20, Energy=-0.20,
            Materials=-0.18, Semiconductors=-0.22, Technology=-0.15, Staples=-0.03,
            Healthcare=-0.04, Utilities=-0.02, RealEstate=-0.14, Defense=-0.05,
            Communication=-0.10, Crypto=-0.35, ETFs=-0.12,
        ),
    },
    "financial_crisis_2008": {
        "name": "2008-style Financial Crisis",
        "category": "Downturn",
        "description": "Credit-market collapse: banks and real estate crater, nearly everything falls.",
        "domain_shocks": _s(
            -0.30, Financials=-0.50, RealEstate=-0.45, Discretionary=-0.35, Industrials=-0.35,
            Materials=-0.38, Energy=-0.35, Technology=-0.30, Semiconductors=-0.35, Staples=-0.15,
            Healthcare=-0.18, Utilities=-0.22, Defense=-0.20, Communication=-0.25,
            Crypto=-0.40, ETFs=-0.32,
        ),
    },
    "covid_crash": {
        "name": "COVID-19 Crash (Mar 2020)",
        "category": "Downturn",
        "description": "Sudden lockdown shock: energy, travel-linked industrials and financials sell off hardest.",
        "domain_shocks": _s(
            -0.30, Energy=-0.45, Financials=-0.35, Industrials=-0.35, Discretionary=-0.28,
            RealEstate=-0.30, Technology=-0.22, Semiconductors=-0.25, Healthcare=-0.18,
            Staples=-0.15, Utilities=-0.22, Defense=-0.25, Communication=-0.22,
            Materials=-0.30, Crypto=-0.40, ETFs=-0.30,
        ),
    },
    "technology_downturn": {
        "name": "Technology Downturn",
        "category": "Sector shock",
        "description": "Tech valuations compress sharply; semiconductors fall the most.",
        "domain_shocks": _s(
            -0.04, Technology=-0.30, Semiconductors=-0.38, Communication=-0.18,
            Discretionary=-0.12, Financials=-0.06, Staples=-0.02, Healthcare=-0.03,
            Utilities=-0.01, Crypto=-0.20, ETFs=-0.10,
        ),
    },
    "banking_crisis": {
        "name": "Banking Crisis",
        "category": "Sector shock",
        "description": "Bank runs and credit tightening: financials and real estate drop sharply.",
        "domain_shocks": _s(
            -0.08, Financials=-0.32, RealEstate=-0.15, Technology=-0.08, Semiconductors=-0.10,
            Utilities=-0.03, Staples=-0.02, Healthcare=-0.04, Defense=-0.04, Crypto=-0.15,
            ETFs=-0.10,
        ),
    },
    "healthcare_crackdown": {
        "name": "Healthcare Pricing Crackdown",
        "category": "Sector shock",
        "description": "Drug-pricing regulation squeezes healthcare; other domains barely move.",
        "domain_shocks": _s(
            0.00, Healthcare=-0.20, Staples=0.01, Technology=0.01, Semiconductors=0.01, ETFs=-0.02,
        ),
    },
    "rate_hike": {
        "name": "Interest Rate Hike Shock",
        "category": "Macro",
        "description": "Sharp rate rises hurt rate-sensitive, long-duration domains (real estate, utilities, tech).",
        "domain_shocks": _s(
            -0.06, RealEstate=-0.18, Utilities=-0.12, Technology=-0.14, Semiconductors=-0.14,
            Communication=-0.08, Discretionary=-0.10, Financials=0.02, Energy=0.00,
            Staples=-0.03, Healthcare=-0.04, Defense=-0.02, Crypto=-0.20, ETFs=-0.07,
        ),
    },
    "inflation_surge": {
        "name": "Inflation / Stagflation Surge",
        "category": "Macro",
        "description": "Prices spike while growth slows: energy and materials benefit, growth stocks suffer.",
        "domain_shocks": _s(
            -0.08, Energy=0.12, Materials=0.05, Staples=-0.02, RealEstate=-0.10,
            Technology=-0.15, Semiconductors=-0.15, Discretionary=-0.14, Communication=-0.10,
            Financials=-0.05, Utilities=-0.06, Healthcare=-0.04, Defense=0.00, Crypto=-0.10,
            ETFs=-0.08,
        ),
    },
    "oil_spike": {
        "name": "Oil Price Spike",
        "category": "Commodity",
        "description": "Crude surges: energy gains, fuel-sensitive industrials and consumer names lose.",
        "domain_shocks": _s(
            -0.04, Energy=0.25, Industrials=-0.08, Discretionary=-0.10, Materials=0.04,
            Defense=0.02, Staples=-0.03, Utilities=-0.02, Healthcare=-0.02, RealEstate=-0.06,
            Crypto=-0.05, ETFs=-0.04,
        ),
    },
    "oil_collapse": {
        "name": "Oil Price Collapse",
        "category": "Commodity",
        "description": "Crude plunges: energy producers fall hard, consumers and transport benefit.",
        "domain_shocks": _s(
            0.02, Energy=-0.30, Financials=-0.05, Materials=-0.08, Industrials=0.03,
            Discretionary=0.06, Defense=-0.02, Semiconductors=0.00, Healthcare=0.01, ETFs=0.0,
        ),
    },
    "geopolitical_conflict": {
        "name": "Geopolitical Conflict Escalation",
        "category": "Geopolitical",
        "description": "Military escalation lifts defense and energy; risk assets and chips sell off.",
        "domain_shocks": _s(
            -0.06, Defense=0.20, Energy=0.12, Materials=0.04, Staples=0.00, Healthcare=-0.02,
            Utilities=0.00, Technology=-0.10, Semiconductors=-0.14, Discretionary=-0.10,
            Financials=-0.08, Industrials=-0.05, RealEstate=-0.06, Communication=-0.07,
            Crypto=-0.10, ETFs=-0.06,
        ),
    },
    "trade_war": {
        "name": "Trade War / Tariff Shock",
        "category": "Geopolitical",
        "description": "Broad tariffs disrupt supply chains: chips, industrials and consumer goods are hit.",
        "domain_shocks": _s(
            -0.07, Technology=-0.12, Semiconductors=-0.18, Discretionary=-0.12, Industrials=-0.12,
            Materials=-0.10, Staples=-0.04, Healthcare=-0.03, Utilities=-0.01, Energy=-0.06,
            Defense=0.02, Financials=-0.07, RealEstate=-0.05, Communication=-0.07,
            Crypto=-0.08, ETFs=-0.07,
        ),
    },
    "ai_boom": {
        "name": "AI Boom Rally",
        "category": "Rally",
        "description": "AI-driven capex surge lifts semiconductors and tech; power utilities benefit too.",
        "domain_shocks": _s(
            0.04, Technology=0.25, Semiconductors=0.35, Communication=0.12, Utilities=0.10,
            Industrials=0.06, Energy=0.05, Staples=0.01, Healthcare=0.02, Crypto=0.15,
            ETFs=0.10,
        ),
    },
    "market_recovery": {
        "name": "Market Recovery",
        "category": "Rally",
        "description": "Broad rebound led by cyclicals and growth; defensives lag.",
        "domain_shocks": _s(
            0.15, Technology=0.20, Semiconductors=0.25, Discretionary=0.20, Financials=0.18,
            Industrials=0.17, Energy=0.14, Staples=0.07, Healthcare=0.10, Utilities=0.08,
            RealEstate=0.14, Defense=0.10, Materials=0.16, Communication=0.16, Crypto=0.30,
            ETFs=0.15,
        ),
    },
}


def _validate_shocks(shocks: dict) -> dict:
    cleaned = {}
    for domain, value in (shocks or {}).items():
        if domain not in DOMAINS:
            raise ValueError(
                f"Unknown domain '{domain}'. Valid domains: {', '.join(DOMAINS)}."
            )
        try:
            shock = float(value)
        except (TypeError, ValueError):
            raise ValueError(f"Shock for '{domain}' must be a number.")
        if shock != shock or shock in (float("inf"), float("-inf")):
            raise ValueError(f"Shock for '{domain}' must be a finite number.")
        if shock < MIN_SHOCK or shock > MAX_SHOCK:
            raise ValueError(
                f"Shock for '{domain}' must be between {int(MIN_SHOCK * 100)}% and +{int(MAX_SHOCK * 100)}%."
            )
        cleaned[domain] = shock
    return cleaned


def _impact_by_domain(portfolio: list, portfolio_value: float, shock_for) -> dict:
    """Core calculation shared by named and custom scenarios."""
    groups = group_by_domain(portfolio)
    initial_value = float(portfolio_value)
    domain_results = []
    total_change = 0.0

    for g in groups:
        weight = g["weight"]
        shock = float(shock_for(g["domain"]))
        initial = initial_value * weight
        change = initial * shock
        total_change += change
        domain_results.append(
            {
                "domain": g["domain"],
                "weight": round(weight * 100, 2),
                "holdings_count": g["holdings_count"],
                "shock": round(shock * 100, 2),
                "initial_value": round(initial, 2),
                "change": round(change, 2),
                "final_value": round(initial + change, 2),
            }
        )

    final_value = initial_value + total_change
    pct = (total_change / initial_value) if initial_value > 0 else 0.0

    # Percentage-point effect of each domain on total portfolio return
    for r in domain_results:
        r["impact"] = round(r["change"] / initial_value * 100, 2) if initial_value > 0 else 0.0

    return {
        "initial_value": round(initial_value, 2),
        "final_value": round(final_value, 2),
        "absolute_change": round(total_change, 2),
        "percentage_change": round(pct * 100, 2),
        "domains": domain_results,
        "insights": _build_insights(domain_results, total_change, pct),
    }


def _money(value: float) -> str:
    return f"{'-' if value < 0 else '+'}${abs(value):,.0f}"


def _build_insights(domains: list, total_change: float, pct: float) -> list:
    insights = []
    if not domains:
        return insights

    by_change = sorted(domains, key=lambda d: d["change"])
    worst, best = by_change[0], by_change[-1]

    if total_change < 0:
        insights.append(
            f"The portfolio would lose {abs(pct) * 100:.1f}% ({_money(total_change)}) under this scenario."
        )
    elif total_change > 0:
        insights.append(
            f"The portfolio would gain {pct * 100:.1f}% ({_money(total_change)}) under this scenario."
        )
    else:
        insights.append("The portfolio would be essentially unchanged under this scenario.")

    if worst["change"] < 0:
        gross_loss = sum(d["change"] for d in domains if d["change"] < 0)
        share = worst["change"] / gross_loss * 100 if gross_loss else 0.0
        extra = f", {share:.0f}% of all domain losses" if len(domains) > 1 else ""
        insights.append(
            f"Biggest drag: {worst['domain']} ({worst['shock']:+.1f}% on a {worst['weight']:.1f}% allocation, "
            f"{_money(worst['change'])}{extra})."
        )
    if best["change"] > 0:
        insights.append(
            f"Biggest cushion: {best['domain']} ({best['shock']:+.1f}% on a {best['weight']:.1f}% allocation, "
            f"{_money(best['change'])})."
        )

    top = max(domains, key=lambda d: d["weight"])
    if top["weight"] >= 50 and len(domains) > 1:
        insights.append(
            f"{top['domain']} makes up {top['weight']:.0f}% of the portfolio, so results depend heavily on that single domain."
        )
    if len(domains) == 1:
        insights.append("All holdings fall in one domain, so there is no diversification across domains.")
    other = next((d for d in domains if d["domain"] == "Other"), None)
    if other and other["weight"] >= 10:
        insights.append(
            f"{other['weight']:.0f}% of the portfolio could not be classified into a domain and uses the scenario default."
        )
    return insights


def run_named_scenario(portfolio: list, scenario_id: str, portfolio_value: float):
    if scenario_id not in SCENARIOS:
        raise ValueError(f"Unknown scenario: {scenario_id}")
    if portfolio_value <= 0:
        raise ValueError("Portfolio value must be greater than 0.")

    scenario = SCENARIOS[scenario_id]
    shocks = scenario["domain_shocks"]
    result = _impact_by_domain(portfolio, portfolio_value, lambda d: shocks.get(d, 0.0))
    result["scenario"] = {
        "id": scenario_id,
        "name": scenario["name"],
        "description": scenario["description"],
        "category": scenario["category"],
    }
    return result


def run_custom_scenario(portfolio: list, portfolio_value: float, domain_shocks: dict | None = None):
    """Apply user supplied shocks (fractions, e.g. -0.15) per domain.
    Domains without a shock are left unchanged."""
    if portfolio_value <= 0:
        raise ValueError("Portfolio value must be greater than 0.")
    shocks = _validate_shocks(domain_shocks or {})
    result = _impact_by_domain(portfolio, portfolio_value, lambda d: shocks.get(d, 0.0))
    result["scenario"] = {
        "id": "custom",
        "name": "Custom Domain Shocks",
        "description": "User-defined return shock per domain.",
        "category": "Custom",
    }
    return result


def get_available_scenarios():
    return [
        {
            "id": scenario_id,
            "name": scenario["name"],
            "description": scenario["description"],
            "category": scenario["category"],
            "domain_shocks": {d: round(v * 100, 1) for d, v in scenario["domain_shocks"].items()},
        }
        for scenario_id, scenario in SCENARIOS.items()
    ]
