# 🪙 Coin Screener

A simple meme coin screener that finds early tokens and checks them for safety red flags.

**What it does:**
1. Pulls new/trending tokens from DexScreener (free API, no key needed)
2. Filters by your criteria (market cap, liquidity, volume, chain, age)
3. Scores each token for safety (liquidity ratio, trading activity, buy/sell balance)
4. Ranks results and gives you quick links to do deeper checks (RugCheck, BubbleMaps)

**What it does NOT do:**
- This is a first-pass screener. It catches obvious red flags but **cannot detect** every scam.
- Always manually verify on [RugCheck](https://rugcheck.xyz), [BubbleMaps](https://bubblemaps.io), and check the actual community before buying.
- This is not financial advice. Meme coins are extremely high risk.

---

## Quick Start (Web App)

**Just open `index.html` in your browser.** That's it — no server, no install, no build step.

1. Pick your chains (Solana, Base, Ethereum, BSC, Arbitrum)
2. Set max market cap and min liquidity with the sliders
3. Hit **Scan for Meme Coins**
4. Click any row to see the safety breakdown + links to RugCheck / BubbleMaps

You can also deploy it to GitHub Pages or any static host.

## CLI Version (optional)

There's also a Python CLI for scripting or automation:

```bash
pip install -r requirements.txt
python run.py --chain solana --top 10 --detail
```

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
├── index.html          # ← Web app — just open in browser
├── run.py              # CLI entry point (Python)
├── config.yaml         # CLI filters and thresholds
├── requirements.txt    # Python dependencies (CLI only)
├── app/
│   └── index.jsx       # React component (for embedding)
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
