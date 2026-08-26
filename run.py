#!/usr/bin/env python3
"""
🪙 Coin Screener — find meme coins early, skip the rugs.

Usage:
    python run.py              # full scan with config.yaml defaults
    python run.py --chain sol  # scan only Solana
    python run.py --top 10     # show top 10 only
    python run.py --detail     # show safety breakdown for each token

Adjust filters in config.yaml.
"""

import argparse
import sys
from pathlib import Path

import yaml
from tabulate import tabulate

from screener.scanner import scan


def load_config(path: str = "config.yaml") -> dict:
    """Load config from YAML file."""
    config_path = Path(__file__).parent / path
    if not config_path.exists():
        print(f"✗ Config file not found: {config_path}")
        sys.exit(1)

    with open(config_path) as f:
        return yaml.safe_load(f)


def format_usd(value: float) -> str:
    """Format a USD value for display."""
    if value >= 1_000_000:
        return f"${value / 1_000_000:.1f}M"
    elif value >= 1_000:
        return f"${value / 1_000:.1f}K"
    else:
        return f"${value:.0f}"


def format_price(price_str: str) -> str:
    """Format a price string — keep significant digits for tiny prices."""
    try:
        price = float(price_str)
        if price >= 1:
            return f"${price:.2f}"
        elif price >= 0.001:
            return f"${price:.4f}"
        else:
            return f"${price:.8f}"
    except (ValueError, TypeError):
        return price_str


def print_results(results: list[dict], show_detail: bool = False):
    """Print results as a nice table."""
    if not results:
        print("\n😔 No tokens matched your criteria.")
        print("   Try relaxing the filters in config.yaml:")
        print("   - Increase market_cap.max")
        print("   - Decrease liquidity.min")
        print("   - Add more chains")
        return

    # Summary table
    print("\n" + "=" * 90)
    print("  🪙 MEME COIN SCREENER RESULTS")
    print("=" * 90)

    table_data = []
    for i, r in enumerate(results, 1):
        status = "✅" if r["safety_passed"] else "⚠️"
        change_24h = r["price_change_24h"]
        change_str = f"+{change_24h:.0f}%" if change_24h >= 0 else f"{change_24h:.0f}%"

        table_data.append([
            f"{status} {i}",
            f"{r['symbol']}",
            r["chain"][:3].upper(),
            format_price(r["price_usd"]),
            format_usd(r["market_cap"]),
            format_usd(r["liquidity_usd"]),
            format_usd(r["volume_24h"]),
            f"{r['buys_24h']}/{r['sells_24h']}",
            change_str,
            f"{r['safety_score']}/100",
        ])

    headers = ["#", "Token", "Chain", "Price", "MCap", "Liq", "Vol 24h", "B/S", "24h%", "Safety"]
    print(tabulate(table_data, headers=headers, tablefmt="simple", stralign="right"))

    # Detail view
    if show_detail:
        print("\n" + "-" * 90)
        print("  SAFETY BREAKDOWN")
        print("-" * 90)

        for r in results:
            if not r["safety_passed"]:
                continue
            print(f"\n  {r['symbol']} ({r['chain']}) — Score: {r['safety_score']}/100")
            for check_name, score, reason in r["safety_breakdown"]:
                bar = "█" * (score // 3) + "░" * ((30 - score) // 3)
                print(f"    {check_name:>10}: {bar} {score:>2}pts — {reason}")
            if r["url"]:
                print(f"    {'Link':>10}: {r['url']}")

    # Footer
    print("\n" + "-" * 90)
    passed = [r for r in results if r["safety_passed"]]
    print(f"  {len(passed)} of {len(results)} tokens passed all safety checks")
    print()
    print("  ⚠️  NEXT STEPS — before buying anything:")
    print("     1. Check contract on RugCheck.xyz (paste the token address)")
    print("     2. Check wallet distribution on BubbleMaps.io")
    print("     3. Verify liquidity lock on DexScreener/Unicrypt")
    print("     4. Look at the meme — is it funny/original/shareable?")
    print("     5. Check Telegram/X community — real people or bots?")
    print()
    print("  🔗 Quick links for top result:")
    if passed:
        top = passed[0]
        print(f"     DexScreener: {top['url'] or 'N/A'}")
        if top["chain"] == "solana":
            print(f"     RugCheck:    https://rugcheck.xyz/tokens/{top['address']}")
        print(f"     BubbleMaps:  https://app.bubblemaps.io/{top['chain']}/token/{top['address']}")
    print()


def main():
    parser = argparse.ArgumentParser(description="🪙 Meme Coin Screener")
    parser.add_argument("--chain", help="Override chains (e.g. solana, base, ethereum)")
    parser.add_argument("--top", type=int, help="Number of results to show")
    parser.add_argument("--detail", action="store_true", help="Show safety breakdown")
    parser.add_argument("--config", default="config.yaml", help="Config file path")
    parser.add_argument("--min-mcap", type=int, help="Override min market cap")
    parser.add_argument("--max-mcap", type=int, help="Override max market cap")

    args = parser.parse_args()
    config = load_config(args.config)

    # Apply CLI overrides
    if args.chain:
        config["chains"] = [args.chain]
    if args.top:
        config["results_limit"] = args.top
    if args.min_mcap:
        config["market_cap"]["min"] = args.min_mcap
    if args.max_mcap:
        config["market_cap"]["max"] = args.max_mcap

    print("🪙 Coin Screener")
    print(f"   Chains: {', '.join(config['chains'])}")
    print(f"   MCap range: {format_usd(config['market_cap']['min'])} – {format_usd(config['market_cap']['max'])}")
    print(f"   Min liquidity: {format_usd(config['liquidity']['min'])}")

    results = scan(config)
    print_results(results, show_detail=args.detail)


if __name__ == "__main__":
    main()
