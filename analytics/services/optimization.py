import numpy as np
from pypfopt import EfficientFrontier, risk_models, expected_returns

from .market_data import get_historical_prices

RISK_FREE_RATE = 0.02
MIN_MEANINGFUL_WEIGHT = 0.005  # below 0.5% a position is treated as "excluded"


def _portfolio_stats(weights: np.ndarray, mu: np.ndarray, cov: np.ndarray) -> dict:
    ret = float(weights @ mu)
    vol = float(np.sqrt(weights @ cov @ weights))
    sharpe = (ret - RISK_FREE_RATE) / vol if vol > 0 else 0.0
    return {
        "expected_return": round(ret * 100, 2),
        "volatility": round(vol * 100, 2),
        "sharpe_ratio": round(sharpe, 2),
    }


def _current_vector(tickers: list[str], current_weights: dict | None):
    """Normalised current weights over the optimised tickers (None if unusable)."""
    if not current_weights:
        return None
    raw = np.array([float(current_weights.get(t, 0.0) or 0.0) for t in tickers])
    total = raw.sum()
    if total <= 0:
        return None
    return raw / total


def _explain(
    tickers, mu, cov, optimal, current, method, current_stats, optimal_stats, n_obs
) -> dict:
    n = len(tickers)
    vols = np.sqrt(np.diag(cov))
    sharpes = np.where(vols > 0, (mu - RISK_FREE_RATE) / vols, 0.0)
    with np.errstate(divide="ignore", invalid="ignore"):
        corr = cov / np.outer(vols, vols)
    corr = np.nan_to_num(corr, nan=0.0)
    avg_corr = (corr.sum(axis=1) - 1.0) / max(n - 1, 1)

    sharpe_rank = {t: int(r) + 1 for r, t in enumerate(np.array(tickers)[np.argsort(-sharpes)])}
    median_corr = float(np.median(avg_corr))

    assets = []
    for i, t in enumerate(tickers):
        w = float(optimal[i])
        cur = float(current[i]) if current is not None else None
        reasons = []

        if w >= MIN_MEANINGFUL_WEIGHT:
            role = "Core holding"
            if sharpe_rank[t] == 1:
                reasons.append(
                    f"Best risk-adjusted return in the set (Sharpe {sharpes[i]:.2f}, "
                    f"{mu[i] * 100:.1f}% return for {vols[i] * 100:.1f}% volatility)."
                )
                role = "Return driver"
            elif sharpes[i] > 0:
                reasons.append(
                    f"Positive risk-adjusted return (Sharpe {sharpes[i]:.2f}, ranked "
                    f"#{sharpe_rank[t]} of {n})."
                )
            if avg_corr[i] < median_corr - 0.05 or avg_corr[i] < 0.35:
                reasons.append(
                    f"Low correlation with the other assets (avg {avg_corr[i]:.2f}), so it "
                    "diversifies the portfolio and lowers overall volatility."
                )
                if sharpe_rank[t] != 1:
                    role = "Diversifier"
            if w < 0.05:
                role = "Minor position"
                reasons.insert(
                    0,
                    f"Kept as a small position only: its Sharpe ({sharpes[i]:.2f}) is "
                    f"ranked #{sharpe_rank[t]} of {n}, so the optimizer gives it little weight.",
                )
                reasons = [r for r in reasons if not r.startswith("Positive risk-adjusted")]
            if not reasons:
                reasons.append(
                    f"Included to balance risk: {vols[i] * 100:.1f}% volatility with "
                    f"{avg_corr[i]:.2f} average correlation to the rest."
                )
            if w > 0.5:
                reasons.append("Large weight: this asset dominates the optimum, see concentration note.")
        else:
            role = "Excluded"
            top = int(np.argmax(sharpes))
            if sharpes[i] <= 0:
                reasons.append(
                    f"Return of {mu[i] * 100:.1f}% does not compensate for its "
                    f"{vols[i] * 100:.1f}% volatility (Sharpe {sharpes[i]:.2f})."
                )
            else:
                reasons.append(
                    f"Lower risk-adjusted return (Sharpe {sharpes[i]:.2f}) than {tickers[top]} "
                    f"(Sharpe {sharpes[top]:.2f})."
                )
            if avg_corr[i] > 0.6:
                reasons.append(
                    f"Highly correlated with the other assets (avg {avg_corr[i]:.2f}), so it adds "
                    "risk without much diversification benefit."
                )

        entry = {
            "ticker": t,
            "optimal_weight": round(w * 100, 2),
            "role": role,
            "annual_return": round(float(mu[i]) * 100, 2),
            "volatility": round(float(vols[i]) * 100, 2),
            "sharpe_ratio": round(float(sharpes[i]), 2),
            "avg_correlation": round(float(avg_corr[i]), 2),
            "reasons": reasons,
        }
        if cur is not None:
            delta = (w - cur) * 100
            entry["current_weight"] = round(cur * 100, 2)
            entry["change"] = round(delta, 2)
            if abs(delta) < 1.0:
                entry["action"] = "Hold"
            elif w < MIN_MEANINGFUL_WEIGHT:
                entry["action"] = "Exit"
            elif cur < MIN_MEANINGFUL_WEIGHT:
                entry["action"] = "Add"
            else:
                entry["action"] = "Increase" if delta > 0 else "Reduce"
        assets.append(entry)

    assets.sort(key=lambda a: a["optimal_weight"], reverse=True)

    held = [a for a in assets if a["optimal_weight"] >= MIN_MEANINGFUL_WEIGHT * 100]
    excluded = [a["ticker"] for a in assets if a["optimal_weight"] < MIN_MEANINGFUL_WEIGHT * 100]
    top3 = ", ".join(f"{a['ticker']} {a['optimal_weight']:.1f}%" for a in held[:3])

    if method == "max_sharpe":
        summary = (
            f"The optimizer found the allocation with the highest return per unit of risk "
            f"(Sharpe {optimal_stats['sharpe_ratio']}). It concentrates in {top3}"
        )
    else:
        summary = (
            f"No asset beat the {RISK_FREE_RATE * 100:.0f}% risk-free rate, so the optimizer instead "
            f"chose the lowest-volatility allocation ({optimal_stats['volatility']}% volatility), "
            f"led by {top3}"
        )
    if excluded:
        summary += f", and drops {', '.join(excluded)}."
    else:
        summary += "."

    if current_stats:
        d_sharpe = optimal_stats["sharpe_ratio"] - current_stats["sharpe_ratio"]
        d_vol = optimal_stats["volatility"] - current_stats["volatility"]
        d_ret = optimal_stats["expected_return"] - current_stats["expected_return"]
        summary += (
            f" Versus your current weights: Sharpe {current_stats['sharpe_ratio']} → "
            f"{optimal_stats['sharpe_ratio']} ({d_sharpe:+.2f}), return {d_ret:+.1f} pts, "
            f"volatility {d_vol:+.1f} pts."
        )

    notes = [
        f"Based on {n_obs} trading days of history (about 1 year). Expected return is the historical "
        "annualised return, so the optimum is backward-looking and not a forecast.",
        f"Sharpe ratios use a {RISK_FREE_RATE * 100:.0f}% risk-free rate.",
    ]
    if method != "max_sharpe":
        notes.append("Fell back to minimum-volatility because no asset exceeded the risk-free rate.")
    if held and held[0]["optimal_weight"] > 50:
        notes.append(
            f"{held[0]['ticker']} receives {held[0]['optimal_weight']:.0f}% of the portfolio. "
            "Unconstrained optimisation tends to concentrate in recent winners; consider capping "
            "single-position weights before acting on it."
        )
    if len(held) < max(2, n // 2):
        notes.append("Only a few assets receive weight; the rest are dominated by better risk/return choices.")
    suffixes = {t.rsplit(".", 1)[1] if "." in t else "US" for t in tickers}
    if len(suffixes) > 1:
        notes.append(
            "Tickers trade on different exchanges/currencies; returns are measured in each asset's local currency."
        )
    if n_obs < 120:
        notes.append("Limited price history for at least one ticker makes these estimates less reliable.")

    return {"summary": summary, "assets": assets, "notes": notes}


def optimize_portfolio(tickers: list[str], current_weights: dict | None = None) -> dict:
    unique_tickers = list(dict.fromkeys([t.upper() for t in tickers]))

    if len(unique_tickers) < 2:
        raise ValueError("At least two unique valid tickers are required for optimization.")

    try:
        prices = get_historical_prices(unique_tickers)
        prices = prices.dropna(axis=1, how="all")

        if prices.shape[1] < 2:
            raise ValueError("Insufficient price data for portfolio optimization.")

        mu_s = expected_returns.mean_historical_return(prices)
        cov_df = risk_models.sample_cov(prices)

        method = "max_sharpe"
        ef = EfficientFrontier(mu_s, cov_df)
        try:
            ef.max_sharpe(risk_free_rate=RISK_FREE_RATE)
        except Exception:
            # e.g. every asset returned less than the risk-free rate
            method = "min_volatility"
            ef = EfficientFrontier(mu_s, cov_df)
            ef.min_volatility()
        cleaned = ef.clean_weights()

        names = list(mu_s.index)
        mu = mu_s.values.astype(float)
        cov = cov_df.loc[names, names].values.astype(float)
        optimal = np.array([cleaned.get(t, 0.0) for t in names], dtype=float)
        total = optimal.sum()
        if total > 0:
            optimal = optimal / total

        optimal_stats = _portfolio_stats(optimal, mu, cov)
        current_vec = _current_vector(names, current_weights)
        current_stats = _portfolio_stats(current_vec, mu, cov) if current_vec is not None else None

        explanation = _explain(
            names, mu, cov, optimal, current_vec, method, current_stats, optimal_stats, len(prices)
        )

        return {
            "weights": {t: round(float(w), 4) for t, w in zip(names, optimal)},
            "expected_return": optimal_stats["expected_return"],
            "volatility": optimal_stats["volatility"],
            "sharpe_ratio": optimal_stats["sharpe_ratio"],
            "method": method,
            "current": current_stats,
            "explanation": explanation,
        }
    except Exception as e:
        if isinstance(e, (ValueError, ConnectionError)):
            raise e
        raise ValueError(f"Portfolio optimization failed: {str(e)}")
