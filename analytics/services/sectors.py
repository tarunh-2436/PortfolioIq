from .domains import group_by_domain


def calculate_sector_allocation(portfolio: list) -> dict:
    """Portfolio weight (in %) per domain, e.g. {"Technology": 55.0, ...}."""
    return {
        g["domain"]: round(g["weight"] * 100, 2) for g in group_by_domain(portfolio)
    }
