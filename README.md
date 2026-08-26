# 🪙 Coin Screener

A simple meme coin screener that finds early tokens and checks them for safety red flags.

**What it does:**
1. Pulls new/trending tokens from DexScreener (free API, no key needed)
2. Filters by your criteria (market cap, liquidity, volume, chain, age)
3. Scores each token for safety (liquidity ratio, trading activity, buy/sell balance)
4. Ranks results and gives you quick links to do deeper checks

**What it does NOT do:**
- This is a first-pass screener. It catches obvious red flags but **cannot detect** every scam.
- Always manually verify on [RugCheck](https://rugcheck.xyz), [BubbleMaps](https://bubblemaps.io), and check the actual community before buying.
- This is not financial advice. Meme coins are extremely high risk.

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/PietroChioda1234/coinscreener.git
cd coinscreener

# 2. Install deps
pip install -r requirements.txt

# 3. Run
python run.py
```

## Usage

```bash
# Full scan (uses config.yaml defaults)
python run.py

# Scan only Solana
python run.py --chain solana

# Show top 5 with safety details
python run.py --top 5 --detail

# Look for bigger caps (up to 10M)
python run.py --max-mcap 10000000

# Scan Base chain, low cap gems
python run.py --chain base --max-mcap 1000000
```

## Configuration

Edit `config.yaml` to tune the screener:

| Setting | What it does | Default |
|---|---|---|
| `chains` | Which blockchains to scan | solana, base, ethereum |
| `market_cap.min/max` | Market cap range (USD) | $10K – $5M |
| `liquidity.min` | Minimum liquidity to consider | $5K |
| `pair_age.min/max_hours` | How old the token can be | 1h – 168h (7 days) |
| `safety.min_liquidity_ratio` | Min liquidity/mcap ratio | 5% |
| `safety.min_buy_sell_ratio` | Min sells/buys ratio | 0.2 |
| `safety.min_txns_24h` | Minimum 24h transactions | 50 |

## Safety Scoring (0–100)

Each token is scored on 5 dimensions:

| Check | Max Points | What it measures |
|---|---|---|
| Liquidity | 30 | Liquidity-to-market-cap ratio — can you actually exit? |
| Activity | 25 | 24h transaction count — is anyone trading this? |
| Buy/Sell | 20 | Buy vs sell balance — honeypot or dump detection |
| Age | 15 | Pair age — not too new (bot trap), not too old (not early) |
| Vol/Liq | 10 | Volume vs liquidity — interest level, wash trade detection |

A token **passes** only if every individual check scores > 0 (a zero means it hit a hard fail).

## After the screener finds something

The screener is step 1. Before buying, always:

1. **RugCheck.xyz** — paste the contract address, check for honeypots, mint authority, transfer hooks
2. **BubbleMaps.io** — visualize wallet clusters, check if top holders are connected
3. **Check liquidity lock** — is it locked on Unicrypt/Team Finance? For how long?
4. **Evaluate the meme** — is it funny? Original? Would people share it?
5. **Check the community** — Telegram, X/Twitter. Real people or bot farm?
6. **Position size** — never more than you're OK losing completely

## Project Structure

```
coinscreener/
├── run.py              # CLI entry point
├── config.yaml         # All filters and thresholds
├── requirements.txt    # Python dependencies
└── screener/
    ├── api.py          # DexScreener API client
    ├── safety.py       # Safety scoring engine
    └── scanner.py      # Main scan pipeline
```

## Roadmap

- [x] Basic DexScreener discovery + safety scoring
- [ ] RugCheck API integration (contract audits)
- [ ] Wallet concentration analysis
- [ ] Social sentiment scoring (X/Twitter, Telegram)
- [ ] Alerts (Telegram bot / email when a good one pops up)
- [ ] Historical tracking (did past picks actually perform?)

---

**Disclaimer:** This tool is for research purposes only. Meme coins are extremely risky — most go to zero. Never invest more than you can afford to lose. This is not financial advice.
