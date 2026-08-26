/*
 * background.js
 *
 * For each token: fetches rugcheck.xyz HTML page and scrapes the verdict.
 * Same page the user would see — we just read it for them.
 */

const cache = new Map();
const pending = new Set();
const CACHE_TTL = 10 * 60_000;

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "CHECK_TOKENS") {
    checkTokens(msg.tokens, sender.tab?.id);
  }
  if (msg.type === "TRACK_TOKEN") {
    trackToken(msg.token);
  }
  if (msg.type === "GET_TRACKED") {
    refreshTracked(sender.tab?.id);
  }
});

async function checkTokens(tokens, tabId) {
  if (!tabId) return;

  for (const token of tokens) {
    const addr = token.address;
    if (!addr || pending.has(addr)) continue;

    const cached = cache.get(addr);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      sendRug(tabId, addr, cached);
      continue;
    }

    pending.add(addr);

    checkRugScore(addr)
      .then(result => {
        cache.set(addr, { ...result, ts: Date.now() });
        sendRug(tabId, addr, result);
      })
      .catch(() => {
        sendRug(tabId, addr, { status: "error", risks: [] });
      })
      .finally(() => pending.delete(addr));

    await new Promise(r => setTimeout(r, 800));
  }
}

async function checkRugScore(address) {
  // Method 1: Try the API first (faster, structured)
  try {
    const r = await fetch(`https://api.rugcheck.xyz/v1/tokens/${address}/report/summary`);
    if (r.ok) {
      const data = await r.json();
      if (data && (data.score !== undefined || data.risks)) {
        return parseApiResponse(data);
      }
    }
  } catch {}

  // Method 2: Scrape the actual rugcheck.xyz page
  try {
    const r = await fetch(`https://rugcheck.xyz/tokens/${address}`, {
      headers: { "Accept": "text/html" }
    });
    if (r.ok) {
      const html = await r.text();
      return parseRugPage(html);
    }
  } catch {}

  return { status: "unknown", risks: [] };
}

function parseApiResponse(data) {
  const risks = [];
  if (Array.isArray(data.risks)) {
    for (const r of data.risks) {
      risks.push({
        name: r.name || r.type || "Unknown",
        level: r.level || r.severity || "unknown",
        description: r.description || "",
      });
    }
  }

  // RugCheck score: lower = safer
  const score = data.score ?? -1;
  let status = "unknown";
  if (score >= 0 && score <= 300) status = "Good";
  else if (score <= 600) status = "Warning";
  else if (score > 600) status = "Danger";

  return { status, risks, score };
}

function parseRugPage(html) {
  const risks = [];
  let status = "unknown";

  // Look for the verdict text — RugCheck shows "Good", "Warning", "Danger" etc.
  // Common patterns in their HTML:
  const verdictPatterns = [
    /class="[^"]*good[^"]*"[^>]*>[^<]*good/i,
    /class="[^"]*warning[^"]*"[^>]*>[^<]*warn/i,
    /class="[^"]*danger[^"]*"[^>]*>[^<]*danger/i,
    /class="[^"]*risk[^"]*"[^>]*>[^<]*risk/i,
  ];

  // Check for verdict keywords in the page
  const lower = html.toLowerCase();

  if (lower.includes('"good"') || lower.match(/>\s*good\s*</i) || lower.includes('status":"good')) {
    status = "Good";
  } else if (lower.includes('"warn') || lower.match(/>\s*warning?\s*</i) || lower.includes('status":"warn')) {
    status = "Warning";
  } else if (lower.includes('"danger') || lower.match(/>\s*danger\s*</i) || lower.includes('status":"danger')) {
    status = "Danger";
  } else if (lower.includes('"risk') || lower.match(/high\s*risk/i)) {
    status = "Danger";
  }

  // Look for risk items — they usually appear in list items or divs
  const riskMatches = html.matchAll(/(?:risk|warning|danger|caution)[^>]*>([^<]{3,80})</gi);
  for (const m of riskMatches) {
    const text = m[1].trim();
    if (text.length > 3 && text.length < 80 && !text.includes('{') && !text.includes('<')) {
      risks.push({ name: text, level: "warning" });
    }
    if (risks.length >= 5) break;
  }

  // Also check for specific known flags
  if (lower.includes("mint authority") && !lower.includes("mint authority disabled") && !lower.includes("mint authority: none")) {
    risks.push({ name: "Mint authority enabled", level: "danger" });
  }
  if (lower.includes("freeze authority") && !lower.includes("freeze authority disabled") && !lower.includes("freeze authority: none")) {
    risks.push({ name: "Freeze authority enabled", level: "danger" });
  }
  if (lower.includes("not renounced") || (lower.includes("ownership") && lower.includes("not renounced"))) {
    risks.push({ name: "Ownership not renounced", level: "warning" });
  }
  if (lower.includes("liquidity") && lower.includes("unlocked")) {
    risks.push({ name: "Liquidity unlocked", level: "danger" });
  }
  if (lower.includes("honeypot")) {
    risks.push({ name: "Honeypot risk detected", level: "danger" });
    status = "Danger";
  }

  // Deduplicate
  const seen = new Set();
  const uniqueRisks = risks.filter(r => {
    const key = r.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { status, risks: uniqueRisks.slice(0, 5) };
}

function sendRug(tabId, address, result) {
  chrome.tabs.sendMessage(tabId, {
    type: "RUG_RESULT", address,
    status: result.status,
    risks: result.risks || [],
  });
}


// ── Token tracking + price snapshots ────────────────────────

// Auto-snapshot — only create alarm if it doesn't exist yet
// (service worker restarts re-run this code, which would reset the timer)
chrome.alarms.get("price-snapshot", (existing) => {
  if (!existing) {
    chrome.alarms.create("price-snapshot", { periodInMinutes: 5 });
  }
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "price-snapshot") {
    takeSnapshots();
  }
});

async function fetchPrice(chain, address) {
  const chainMap = { solana: "solana", bsc: "bsc", ethereum: "ethereum", base: "base" };
  const c = chainMap[chain];

  // Method 1: Direct token lookup
  if (c) {
    try {
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/${c}/${address}`);
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data) && data[0]?.priceUsd) {
          return {
            priceUsd: parseFloat(data[0].priceUsd) || 0,
            marketCap: data[0].marketCap || data[0].fdv || 0,
          };
        }
      }
    } catch {}
  }

  // Method 2: Search by address (works for tokens not indexed by chain)
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${address}`);
    if (r.ok) {
      const data = await r.json();
      if (data?.pairs?.length) {
        const pair = data.pairs[0];
        return {
          priceUsd: parseFloat(pair.priceUsd) || 0,
          marketCap: pair.marketCap || pair.fdv || 0,
        };
      }
    }
  } catch {}

  // Method 3: Try without "pump" suffix (some addresses end in "pump")
  if (address.endsWith("pump") && address.length > 10) {
    try {
      const short = address.slice(0, -4);
      const r = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${short}`);
      if (r.ok) {
        const data = await r.json();
        if (data?.pairs?.length) {
          const pair = data.pairs[0];
          if (pair.baseToken?.address === address || pair.pairAddress?.includes(address.slice(0, 20))) {
            return {
              priceUsd: parseFloat(pair.priceUsd) || 0,
              marketCap: pair.marketCap || pair.fdv || 0,
            };
          }
        }
      }
    } catch {}
  }

  return null;
}

const trackingPending = new Set();

async function trackToken(token) {
  // Prevent race condition — multiple calls before first save completes
  const dupeKey = token.twitterHandle && token.symbol
    ? `${token.twitterHandle.toLowerCase()}_${token.symbol.toLowerCase()}`
    : token.address;

  if (trackingPending.has(dupeKey)) return;
  trackingPending.add(dupeKey);

  const price = await fetchPrice(token.chain, token.address);
  const now = Date.now();

  const initPrice = price?.priceUsd || 0;
  const initMcap = price?.marketCap || token.mcap || 0;

  const entry = {
    address: token.address,
    chain: token.chain,
    symbol: token.symbol,
    name: token.name,
    twitterHandle: token.twitterHandle || null,
    rugStatus: token.rugStatus || "unknown",
    trackedAt: now,
    initialPrice: initPrice,
    initialMcap: initMcap,
    peakPrice: initPrice,
    peakMcap: initMcap,
    peakTime: now,
    maxDrawdown: 0,       // worst % drop from any peak
    maxDrawdownTime: null,
    mae: 0,               // worst % drop from ENTRY price
    maeTime: null,
    lowestPrice: initPrice,
    currentPrice: initPrice,
    currentMcap: initMcap,
    lastChecked: now,
    snapshots: initPrice ? [{ t: now, p: initPrice, mc: initMcap }] : [],
  };

  chrome.storage.local.get({ tracked: [] }, (data) => {
    const tracked = data.tracked;
    // Check dupes by address
    if (tracked.find(t => t.address === token.address)) {
      trackingPending.delete(dupeKey);
      return;
    }
    // Check dupes by handle+symbol
    if (token.twitterHandle && token.symbol) {
      const key = `${token.twitterHandle.toLowerCase()}_${token.symbol.toLowerCase()}`;
      if (tracked.find(t => t.twitterHandle && t.symbol &&
          `${t.twitterHandle.toLowerCase()}_${t.symbol.toLowerCase()}` === key)) {
        trackingPending.delete(dupeKey);
        return;
      }
    }
    tracked.push(entry);
    if (tracked.length > 200) tracked.shift();
    chrome.storage.local.set({ tracked }, () => {
      trackingPending.delete(dupeKey);
    });
  });
}

async function takeSnapshots() {
  chrome.storage.local.get({ tracked: [] }, async (data) => {
    const tracked = data.tracked;
    if (!tracked.length) return;

    const now = Date.now();
    for (const entry of tracked) {
      // Skip tokens older than 7 days
      if (now - entry.trackedAt > 7 * 24 * 60 * 60 * 1000) continue;

      const price = await fetchPrice(entry.chain, entry.address);

      if (price && price.priceUsd) {
        // Got price — full update
        entry.currentPrice = price.priceUsd;
        entry.currentMcap = price.marketCap;
        entry.lastChecked = now;

        // Backfill initial price if we only had mcap before
        if (entry.initialPrice === 0 || entry.initialPrice === null || entry.initialPrice === undefined) {
          entry.initialPrice = price.priceUsd;
        }
        if (entry.initialMcap === 0 || entry.initialMcap === null || entry.initialMcap === undefined) {
          entry.initialMcap = price.marketCap;
        }

        // Update peak
        if (price.priceUsd > (entry.peakPrice || 0)) {
          entry.peakPrice = price.priceUsd;
          entry.peakMcap = price.marketCap;
          entry.peakTime = now;
        }

        // Update max drawdown (from peak)
        if (entry.peakPrice > 0 && price.priceUsd < entry.peakPrice) {
          const drawdown = ((price.priceUsd - entry.peakPrice) / entry.peakPrice) * 100;
          if (drawdown < (entry.maxDrawdown || 0)) {
            entry.maxDrawdown = drawdown;
            entry.maxDrawdownTime = now;
          }
        }

        // Update MAE (from entry)
        if (entry.initialPrice > 0 && price.priceUsd < entry.initialPrice) {
          const mae = ((price.priceUsd - entry.initialPrice) / entry.initialPrice) * 100;
          if (mae < (entry.mae || 0)) {
            entry.mae = mae;
            entry.maeTime = now;
            entry.lowestPrice = price.priceUsd;
          }
        }

        // Save snapshot
        entry.snapshots.push({ t: now, p: price.priceUsd, mc: price.marketCap });
      } else if (price && price.marketCap) {
        // Got mcap but no price — partial update
        entry.currentMcap = price.marketCap;
        entry.lastChecked = now;
        if (!entry.initialMcap) entry.initialMcap = price.marketCap;
        if (price.marketCap > (entry.peakMcap || 0)) {
          entry.peakMcap = price.marketCap;
          entry.peakTime = now;
        }
        entry.snapshots.push({ t: now, mc: price.marketCap });
      } else {
        // Still no data — just mark that we tried
        entry.lastChecked = now;
      }
      // Keep max 200 snapshots (~16 hours at 5min intervals)
      if (entry.snapshots.length > 200) entry.snapshots.shift();

      await new Promise(r => setTimeout(r, 400));
    }

    chrome.storage.local.set({ tracked });
  });
}

async function refreshTracked(tabId) {
  // First take fresh snapshots, then send to content
  await takeSnapshots();

  chrome.storage.local.get({ tracked: [] }, (data) => {
    if (tabId) chrome.tabs.sendMessage(tabId, { type: "TRACKED_DATA", tracked: data.tracked });
  });
}
