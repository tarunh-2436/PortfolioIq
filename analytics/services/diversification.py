def calculate_hhi(weights: list[float]) -> float:

    return sum(weight**2 for weight in weights)


def calculate_diversification_score(weights: list[float]) -> float:

    n = len(weights)

    if n <= 1:
        return 0.0

    hhi = calculate_hhi(weights)

    minimum_hhi = 1 / n
    maximum_hhi = 1.0

    normalized_concentration = (hhi - minimum_hhi) / (maximum_hhi - minimum_hhi)

    score = 100 * (1 - normalized_concentration)

    return round(max(0, min(100, score)), 2)


def calculate_top_holdings(portfolio: list) -> list:

    sorted_holdings = sorted(portfolio, key=lambda x: x["weight"], reverse=True)

    return [
        {"ticker": holding["ticker"], "weight": round(holding["weight"] * 100, 2)}
        for holding in sorted_holdings[:3]
    ]
