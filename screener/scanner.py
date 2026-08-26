"""
Main scanner — orchestrates discovery → filtering → safety scoring.

This is the brain of the screener. It:
1. Pulls raw token data from DexScreener
2. Filters out tokens that don't match config criteria
3. Runs safety analysis on survivors
4. Ranks by safety score
"""

from screener import api, safety


def _passes_filters(pair: dict, config: dict) -> bool:
    """Check if a pair passes the basic config filters."""

    # Chain filter
    chain = pair.get("chainId", "")
    if chain not in config["chains"]:
        return False

    # Must have a base token with a name
    base = pair.get("baseToken", {})
    if not base.get("name") or not base.get("symbol"):
        return False

    # Market cap filter
    mcap = pair.get("marketCap", 0) or pair.get("fdv", 0) or 0
    if mcap < config["market_cap"]["min"] or mcap > config["market_cap"]["max"]:
        return False

    # Liquidity filter
    liq = pair.get("liquidity", {}).get("usd", 0) or 0
    if liq < config["liquidity"]["min"] or liq > config["liquidity"]["max"]:
        return False

    # Volume filter
    vol = pair.get("volume", {}).get("h24", 0) or 0
    if vol < config["volume_24h"]["min"]:
        return False
    if config["volume_24h"]["max"] and vol > config["volume_24h"]["max"]:
        return False

    return True


def _extract_token_info(pair: dict) -> dict:
    """Pull the fields we care about into a clean dict."""
    base = pair.get("baseToken", {})
    txns_24h = pair.get("txns", {}).get("h24", {})
    price_change = pair.get("priceChange", {})

    return {
        "name": base.get("name", "?"),
        "symbol": base.get("symbol", "?"),
        "address": base.get("address", ""),
        "chain": pair.get("chainId", ""),
        "price_usd": pair.get("priceUsd", "0"),
        "market_cap": pair.get("marketCap", 0) or pair.get("fdv", 0) or 0,
        "liquidity_usd": pair.get("liquidity", {}).get("usd", 0) or 0,
        "volume_24h": pair.get("volume", {}).get("h24", 0) or 0,
        "buys_24h": txns_24h.get("buys", 0) or 0,
        "sells_24h": txns_24h.get("sells", 0) or 0,
        "price_change_1h": price_change.get("h1", 0) or 0,
        "price_change_24h": price_change.get("h24", 0) or 0,
        "pair_address": pair.get("pairAddress", ""),
        "dex": pair.get("dexId", ""),
        "url": pair.get("url", ""),
        "created_at": pair.get("pairCreatedAt", 0),
    }


def scan(config: dict) -> list[dict]:
    """
    Full scan pipeline:
      1. Discover tokens from DexScreener
      2. Filter by config criteria
      3. Score each for safety
      4. Sort by score (best first)
      5. Return top N results

    Returns a list of dicts, each with token info + safety analysis.
    """
    chains = config["chains"]
    limit = config.get("results_limit", 20)

    # Step 1: Discovery
    print("\n🔍 Discovering tokens...")
    raw_pairs = api.discover_tokens(chains)

    if not raw_pairs:
        print("  No pairs found. Check your internet connection or try different chains.")
        return []

    # Step 2: Filter
    print("\n🔬 Filtering...")
    filtered = [p for p in raw_pairs if _passes_filters(p, config)]
    print(f"  {len(filtered)} pairs passed filters (from {len(raw_pairs)} raw)")

    if not filtered:
        print("  Nothing passed filters. Try relaxing config.yaml settings.")
        return []

    # Step 3: Safety scoring
    print("\n🛡️  Running safety analysis...")
    results = []
    for pair in filtered:
        token_info = _extract_token_info(pair)
        safety_result = safety.analyze(pair, config)

        results.append({
            **token_info,
            "safety_score": safety_result["total_score"],
            "safety_passed": safety_result["passed"],
            "safety_breakdown": safety_result["breakdown"],
        })

    # Step 4: Sort by safety score, then by volume (tiebreaker)
    results.sort(key=lambda x: (x["safety_score"], x["volume_24h"]), reverse=True)

    # Step 5: Limit
    results = results[:limit]

    passed_count = sum(1 for r in results if r["safety_passed"])
    print(f"  {passed_count} tokens passed all safety checks")

    return results
