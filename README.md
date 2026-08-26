# 🪙 Coin Screener

A Chrome extension that rides on top of DexScreener and uses AI to evaluate meme coins in real time.

**How it works:**
1. You browse DexScreener normally (new pairs, trending, whatever)
2. The extension scrapes every token visible on the page
3. For each token, it fetches the Twitter/X profile
4. Claude (fast Sonnet call) evaluates: is the meme good? is it legit? any red flags?
5. Scores appear as badges directly on DexScreener — hover for the AI's reasoning

**Why this approach:**
- No delayed API — you see what DexScreener shows, as it shows it
- AI adds the layer no screener has: "is this meme actually funny and shareable?"
- You stay in your normal DexScreener workflow, zero context switching

---

## Quick Start

1. Clone this repo
2. Go to `chrome://extensions` in Chrome
3. Enable **Developer mode** (toggle top-right)
4. Click **Load unpacked** → select the `extension/` folder
5. Click the extension icon → paste your [Anthropic API key](https://console.anthropic.com)
6. Open [DexScreener](https://dexscreener.com/new-pairs) — badges appear automatically

## Also Included

**`index.html`** — A standalone web app screener you can open directly in your browser (no install). Uses DexScreener's public API + safety scoring. Good for quick manual scans.

**`run.py`** — Python CLI version for scripting/automation:
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
├── extension/              # ← Chrome extension (main thing)
│   ├── manifest.json       # Extension config + permissions
│   ├── background.js       # API calls (DexScreener, Twitter, Claude)
│   ├── content.js          # Scrapes DexScreener DOM, overlays badges
│   ├── overlay.css         # Badge styles
│   ├── popup.html          # Settings panel
│   └── popup.js            # Settings logic
├── index.html              # Standalone web app (backup/manual use)
├── run.py                  # Python CLI (scripting/automation)
├── config.yaml             # CLI config
├── requirements.txt        # Python deps
└── screener/               # Python backend
    ├── api.py
    ├── safety.py
    └── scanner.py
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
