from .market_data import get_ticker_info


def calculate_sector_allocation(portfolio: list) -> dict:
    sectors = {}

    for holding in portfolio:
        ticker = holding["ticker"]
        weight = holding["weight"]

        try:
            info = get_ticker_info(ticker)
            sector = info.get("sector") or "Unknown"
        except Exception:
            sector = "Unknown"

        sectors[sector] = sectors.get(sector, 0.0) + float(weight)

    return {sector: round(weight * 100, 2) for sector, weight in sectors.items()}

