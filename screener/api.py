"""
DexScreener API client.

Uses the free public API — no key needed.
Docs: https://docs.dexscreener.com/api/reference

Rate limits are generous (~300 req/min) but we add small delays to be polite.
"""

import time
import requests

BASE_URL = "https://api.dexscreener.com"

# Simple in-memory rate limiter
_last_request_time = 0
MIN_REQUEST_INTERVAL = 0.25  # seconds between requests


def _get(url: str, params: dict = None) -> dict | None:
    """Make a GET request with basic rate limiting and error handling."""
    global _last_request_time

    # Rate limiting
    elapsed = time.time() - _last_request_time
    if elapsed < MIN_REQUEST_INTERVAL:
        time.sleep(MIN_REQUEST_INTERVAL - elapsed)

    try:
        resp = requests.get(url, params=params, timeout=15)
        _last_request_time = time.time()

        if resp.status_code == 429:
            print("  ⚠ Rate limited — waiting 5s...")
            time.sleep(5)
            return _get(url, params)  # retry once

        resp.raise_for_status()
        return resp.json()

    except requests.RequestException as e:
        print(f"  ✗ API error: {e}")
        return None


# ── Discovery endpoints ──────────────────────────────────────


def get_latest_token_profiles() -> list[dict]:
    """Get the latest token profiles (recently updated/created)."""
    data = _get(f"{BASE_URL}/token-profiles/latest/v1")
    return data if isinstance(data, list) else []


def get_latest_boosted() -> list[dict]:
    """Get tokens that are currently 'boosted' (promoted) on DexScreener."""
    data = _get(f"{BASE_URL}/token-boosts/latest/v1")
    return data if isinstance(data, list) else []


def search_tokens(query: str) -> list[dict]:
    """Search for tokens by name or symbol. Returns pair data."""
    data = _get(f"{BASE_URL}/latest/dex/search", params={"q": query})
    if data and "pairs" in data:
        return data["pairs"]
    return []


def get_pairs_by_chain(chain_id: str, pair_address: str) -> list[dict]:
    """Get pair data for a specific pair on a specific chain."""
    data = _get(f"{BASE_URL}/latest/dex/pairs/{chain_id}/{pair_address}")
    if data and "pairs" in data:
        return data["pairs"]
    return []


def get_token_pairs(token_addresses: str) -> list[dict]:
    """
    Get all pairs for given token address(es).
    Can pass comma-separated addresses (max 30).
    """
    data = _get(f"{BASE_URL}/tokens/v1/{token_addresses}")
    return data if isinstance(data, list) else []


def get_new_pairs_by_chain(chain_id: str) -> list[dict]:
    """
    Get the most recent token pairs on a chain.
    This is the key discovery endpoint — shows what just launched.
    """
    data = _get(f"{BASE_URL}/latest/dex/pairs/{chain_id}")
    if data and "pairs" in data:
        return data["pairs"]
    return []


# ── Batch discovery ──────────────────────────────────────────


def discover_tokens(chains: list[str]) -> list[dict]:
    """
    Pull new/trending tokens across multiple chains.
    Combines latest profiles + boosted tokens for broad coverage.
    Returns raw pair data — filtering happens in scanner.py.
    """
    seen_addresses = set()
    all_pairs = []

    # 1. Latest token profiles → get their pair data
    print("  Fetching latest token profiles...")
    profiles = get_latest_token_profiles()
    for profile in profiles:
        chain = profile.get("chainId", "")
        addr = profile.get("tokenAddress", "")
        if chain in chains and addr and addr not in seen_addresses:
            seen_addresses.add(addr)
            pairs = get_token_pairs(f"{chain}/{addr}")
            all_pairs.extend(pairs)

    # 2. Boosted tokens
    print("  Fetching boosted tokens...")
    boosted = get_latest_boosted()
    for token in boosted:
        chain = token.get("chainId", "")
        addr = token.get("tokenAddress", "")
        if chain in chains and addr and addr not in seen_addresses:
            seen_addresses.add(addr)
            pairs = get_token_pairs(f"{chain}/{addr}")
            all_pairs.extend(pairs)

    # 3. Search for "meme" as a broad sweep
    print("  Searching for meme tokens...")
    meme_pairs = search_tokens("meme")
    for pair in meme_pairs:
        chain = pair.get("chainId", "")
        addr = pair.get("baseToken", {}).get("address", "")
        if chain in chains and addr not in seen_addresses:
            seen_addresses.add(addr)
            all_pairs.append(pair)

    print(f"  Found {len(all_pairs)} raw pairs across {', '.join(chains)}")
    return all_pairs
