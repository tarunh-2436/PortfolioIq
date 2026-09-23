def normalize(value, minimum, maximum):

    if value <= minimum:
        return 0

    if value >= maximum:
        return 100

    return ((value - minimum) / (maximum - minimum)) * 100


def calculate_health_score(
    diversification_score: float,
    volatility: float,
    sharpe_ratio: float,
    max_drawdown: float,
) -> float:

    risk_score = 100 - normalize(volatility, 0.05, 0.40)

    sharpe_score = normalize(sharpe_ratio, -1, 2)

    drawdown_score = 100 - normalize(abs(max_drawdown), 0.05, 0.50)

    score = (
        diversification_score * 0.30
        + risk_score * 0.25
        + sharpe_score * 0.20
        + drawdown_score * 0.25
    )

    return round(max(0, min(100, score)), 2)


def generate_recommendations(
    diversification_score,
    volatility,
    sharpe_ratio,
    max_drawdown,
    beta,
    sector_allocation,
):

    recommendations = []

    if diversification_score < 40:
        recommendations.append(
            {
                "type": "diversification",
                "severity": "high",
                "message": "Your portfolio has relatively high " "concentration.",
            }
        )

    elif diversification_score < 65:
        recommendations.append(
            {
                "type": "diversification",
                "severity": "medium",
                "message": "Your portfolio could benefit from "
                "additional diversification.",
            }
        )

    if volatility > 0.25:
        recommendations.append(
            {
                "type": "risk",
                "severity": "high",
                "message": "Portfolio volatility is relatively high.",
            }
        )

    if sharpe_ratio < 0.5:
        recommendations.append(
            {
                "type": "performance",
                "severity": "medium",
                "message": "Risk-adjusted returns are relatively low.",
            }
        )

    if abs(max_drawdown) > 0.25:
        recommendations.append(
            {
                "type": "drawdown",
                "severity": "high",
                "message": "The portfolio has experienced a "
                "significant historical drawdown.",
            }
        )

    if beta > 1.2:
        recommendations.append(
            {
                "type": "market_risk",
                "severity": "medium",
                "message": "The portfolio has higher market sensitivity "
                "than the benchmark.",
            }
        )

    for sector, weight in sector_allocation.items():

        if weight > 40:

            recommendations.append(
                {
                    "type": "sector",
                    "severity": "high",
                    "message": f"{sector} represents {weight:.1f}% "
                    "of the portfolio, indicating "
                    "significant sector concentration.",
                }
            )

    if not recommendations:

        recommendations.append(
            {
                "type": "general",
                "severity": "info",
                "message": "The portfolio currently shows a "
                "balanced risk and diversification profile.",
            }
        )

    return recommendations
