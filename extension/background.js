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
      send(tabId, addr, cached);
      continue;
    }

    pending.add(addr);

    checkRugScore(addr)
      .then(result => {
        cache.set(addr, { ...result, ts: Date.now() });
        send(tabId, addr, result);
      })
      .catch(() => {
        send(tabId, addr, { status: "error", risks: [] });
      })
      .finally(() => pending.delete(addr));

    // Be polite — don't hammer rugcheck
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

function send(tabId, address, result) {
  chrome.tabs.sendMessage(tabId, {
    type: "RUG_RESULT", address,
    status: result.status,
    risks: result.risks || [],
  });
}


// ── Token tracking + price snapshots ────────────────────────

async function fetchPrice(chain, address) {
  const chainMap = { solana: "solana", bsc: "bsc", ethereum: "ethereum", base: "base" };
  const c = chainMap[chain];
  if (!c) return null;

  try {
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/${c}/${address}`);
    if (!r.ok) return null;
    const data = await r.json();
    if (!Array.isArray(data) || !data[0]) return null;

    const pair = data[0];
    return {
      priceUsd: parseFloat(pair.priceUsd) || 0,
      marketCap: pair.marketCap || pair.fdv || 0,
      volume24h: pair.volume?.h24 || 0,
      liquidity: pair.liquidity?.usd || 0,
    };
  } catch {
    return null;
  }
}

async function trackToken(token) {
  // Fetch initial price
  const price = await fetchPrice(token.chain, token.address);

  const entry = {
    address: token.address,
    chain: token.chain,
    symbol: token.symbol,
    name: token.name,
    twitterHandle: token.twitterHandle || null,
    rugStatus: token.rugStatus || "unknown",
    trackedAt: Date.now(),
    initialPrice: price?.priceUsd || 0,
    initialMcap: price?.marketCap || 0,
    initialLiquidity: price?.liquidity || 0,
    snapshots: [],
  };

  // Save to storage
  chrome.storage.local.get({ tracked: [] }, (data) => {
    const tracked = data.tracked;
    // Don't track duplicates
    if (tracked.find(t => t.address === token.address)) return;
    tracked.push(entry);
    // Keep max 200 tracked tokens
    if (tracked.length > 200) tracked.shift();
    chrome.storage.local.set({ tracked });
  });
}

async function refreshTracked(tabId) {
  chrome.storage.local.get({ tracked: [] }, async (data) => {
    const tracked = data.tracked;
    if (!tracked.length) {
      if (tabId) chrome.tabs.sendMessage(tabId, { type: "TRACKED_DATA", tracked: [] });
      return;
    }

    // Fetch current prices for all tracked tokens (batch, throttled)
    for (const entry of tracked) {
      const price = await fetchPrice(entry.chain, entry.address);
      if (price) {
        entry.snapshots.push({
          time: Date.now(),
          priceUsd: price.priceUsd,
          marketCap: price.marketCap,
        });
        // Keep max 50 snapshots per token
        if (entry.snapshots.length > 50) entry.snapshots.shift();
        entry.currentPrice = price.priceUsd;
        entry.currentMcap = price.marketCap;
      }
      await new Promise(r => setTimeout(r, 400));
    }

    chrome.storage.local.set({ tracked });
    if (tabId) chrome.tabs.sendMessage(tabId, { type: "TRACKED_DATA", tracked });
  });
}
