from pypfopt import EfficientFrontier, risk_models, expected_returns

from .market_data import get_historical_prices


def optimize_portfolio(tickers: list[str]):

    prices = get_historical_prices(tickers)

    prices = prices.dropna(axis=1, how="all")

    mu = expected_returns.mean_historical_return(prices)

    S = risk_models.sample_cov(prices)

    ef = EfficientFrontier(mu, S)

    weights = ef.max_sharpe()

    cleaned_weights = ef.clean_weights()

    performance = ef.portfolio_performance(verbose=False)

    expected_return = performance[0]
    volatility = performance[1]
    sharpe = performance[2]

    return {
        "weights": {
            ticker: round(float(weight), 4)
            for ticker, weight in cleaned_weights.items()
        },
        "expected_return": round(expected_return * 100, 2),
        "volatility": round(volatility * 100, 2),
        "sharpe_ratio": round(sharpe, 2),
    }
