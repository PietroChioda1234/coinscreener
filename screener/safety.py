"""
Safety scoring for meme coins.

Scores each token 0–100 based on signals available from DexScreener data.
This is a FIRST PASS — it catches obvious red flags. Always do manual
checks on RugCheck / BubbleMaps before buying anything.

Score breakdown (100 points total):
  - Liquidity health:     0–30 pts
  - Trading activity:     0–25 pts
  - Buy/sell balance:     0–20 pts
  - Age (not too new):    0–15 pts
  - Volume/liquidity:     0–10 pts
"""

import time

# ── Individual scoring functions ─────────────────────────────


def score_liquidity(pair: dict, config: dict) -> tuple[int, str]:
    """
    Score based on liquidity-to-market-cap ratio.
    Higher ratio = more liquidity backing the price = safer to exit.

    30 points max.
    """
    liquidity = pair.get("liquidity", {}).get("usd", 0) or 0
    market_cap = pair.get("marketCap", 0) or pair.get("fdv", 0) or 0

    if market_cap == 0 or liquidity == 0:
        return 0, "No liquidity/mcap data"

    ratio = liquidity / market_cap
    min_ratio = config["safety"]["min_liquidity_ratio"]

    if ratio < min_ratio:
        return 0, f"Low liq ratio ({ratio:.2%})"

    if ratio >= 0.5:
        return 30, f"Excellent liq ratio ({ratio:.2%})"
    elif ratio >= 0.2:
        return 25, f"Good liq ratio ({ratio:.2%})"
    elif ratio >= 0.1:
        return 18, f"OK liq ratio ({ratio:.2%})"
    else:
        return 10, f"Thin liq ratio ({ratio:.2%})"


def score_activity(pair: dict, config: dict) -> tuple[int, str]:
    """
    Score based on 24h transaction count.
    More transactions = more real interest (harder to fake at scale).

    25 points max.
    """
    txns = pair.get("txns", {}).get("h24", {})
    buys = txns.get("buys", 0) or 0
    sells = txns.get("sells", 0) or 0
    total = buys + sells
    min_txns = config["safety"]["min_txns_24h"]

    if total < min_txns:
        return 0, f"Low activity ({total} txns/24h)"

    if total >= 1000:
        return 25, f"High activity ({total} txns/24h)"
    elif total >= 500:
        return 20, f"Good activity ({total} txns/24h)"
    elif total >= 200:
        return 15, f"Moderate activity ({total} txns/24h)"
    else:
        return 8, f"Some activity ({total} txns/24h)"


def score_buy_sell_balance(pair: dict, config: dict) -> tuple[int, str]:
    """
    Score based on buy/sell ratio.
    A healthy token has both buyers AND sellers.
    All buys + no sells = possible honeypot (can't sell).
    All sells + no buys = everyone dumping.

    20 points max.
    """
    txns = pair.get("txns", {}).get("h24", {})
    buys = txns.get("buys", 0) or 0
    sells = txns.get("sells", 0) or 0

    if buys == 0 and sells == 0:
        return 0, "No transactions"

    if buys == 0:
        return 0, "No buys — dead or dumping"

    ratio = sells / buys if buys > 0 else 0
    min_ratio = config["safety"]["min_buy_sell_ratio"]

    if ratio < min_ratio:
        return 0, f"Suspicious buy/sell ratio ({ratio:.2f})"

    # Sweet spot is roughly balanced (0.4–0.8 sells per buy is normal for growing tokens)
    if 0.3 <= ratio <= 1.5:
        return 20, f"Healthy balance ({ratio:.2f} sell/buy)"
    elif 0.2 <= ratio <= 2.0:
        return 12, f"OK balance ({ratio:.2f} sell/buy)"
    else:
        return 5, f"Skewed balance ({ratio:.2f} sell/buy)"


def score_age(pair: dict, config: dict) -> tuple[int, str]:
    """
    Score based on pair age.
    Too new (< 1h) = could be a bot trap.
    Too old (> 7d) = not "early" anymore (but safer).

    We want the sweet spot: old enough to have data, new enough to be early.

    15 points max.
    """
    created = pair.get("pairCreatedAt", 0)
    if not created:
        return 5, "Unknown age"

    age_hours = (time.time() * 1000 - created) / (1000 * 3600)
    min_h = config["pair_age"]["min_hours"]
    max_h = config["pair_age"]["max_hours"]

    if age_hours < min_h:
        return 0, f"Too new ({age_hours:.1f}h)"

    if age_hours > max_h:
        return 8, f"Not early ({age_hours:.0f}h old)"

    # Sweet spot: 2–72 hours
    if 2 <= age_hours <= 72:
        return 15, f"Good timing ({age_hours:.1f}h old)"
    elif age_hours <= 2:
        return 5, f"Very fresh ({age_hours:.1f}h old)"
    else:
        return 10, f"Few days old ({age_hours:.0f}h)"


def score_volume_vs_liquidity(pair: dict, config: dict) -> tuple[int, str]:
    """
    Score based on volume-to-liquidity ratio.
    High volume relative to liquidity = strong interest.
    But extremely high can mean wash trading.

    10 points max.
    """
    volume = pair.get("volume", {}).get("h24", 0) or 0
    liquidity = pair.get("liquidity", {}).get("usd", 0) or 0

    if liquidity == 0:
        return 0, "No liquidity"

    ratio = volume / liquidity

    if ratio >= 10:
        return 5, f"Extreme vol/liq ({ratio:.1f}x) — possible wash"
    elif ratio >= 2:
        return 10, f"Strong vol/liq ({ratio:.1f}x)"
    elif ratio >= 0.5:
        return 7, f"Decent vol/liq ({ratio:.1f}x)"
    else:
        return 3, f"Low vol/liq ({ratio:.1f}x)"


# ── Main scoring function ────────────────────────────────────


def analyze(pair: dict, config: dict) -> dict:
    """
    Run all safety checks on a pair. Returns a result dict with:
      - total_score (0–100)
      - breakdown (list of component scores + reasons)
      - passed (bool — whether it meets minimum thresholds)
    """
    checks = [
        ("Liquidity", *score_liquidity(pair, config)),
        ("Activity", *score_activity(pair, config)),
        ("Buy/Sell", *score_buy_sell_balance(pair, config)),
        ("Age", *score_age(pair, config)),
        ("Vol/Liq", *score_volume_vs_liquidity(pair, config)),
    ]

    total = sum(score for _, score, _ in checks)
    breakdown = [(name, score, reason) for name, score, reason in checks]

    # A token "passes" if no individual check scored 0
    # (a 0 means it hit a hard fail condition)
    passed = all(score > 0 for _, score, _ in checks)

    return {
        "total_score": total,
        "breakdown": breakdown,
        "passed": passed,
    }
