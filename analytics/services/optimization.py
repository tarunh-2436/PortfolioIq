from pypfopt import EfficientFrontier, risk_models, expected_returns

from .market_data import get_historical_prices


def optimize_portfolio(tickers: list[str]) -> dict:
    unique_tickers = list(dict.fromkeys([t.upper() for t in tickers]))

    if len(unique_tickers) < 2:
        raise ValueError("At least two unique valid tickers are required for optimization.")

    try:
        prices = get_historical_prices(unique_tickers)
        prices = prices.dropna(axis=1, how="all")

        if prices.shape[1] < 2:
            raise ValueError("Insufficient price data for portfolio optimization.")

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
            "expected_return": round(float(expected_return) * 100, 2),
            "volatility": round(float(volatility) * 100, 2),
            "sharpe_ratio": round(float(sharpe), 2),
        }
    except Exception as e:
        if isinstance(e, ValueError):
            raise e
        raise ValueError(f"Portfolio optimization failed: {str(e)}")

