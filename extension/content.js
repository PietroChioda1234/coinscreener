/*
 * content.js — runs on gmgn.ai AND dexscreener.com
 *
 * Detects which site we're on, scrapes token data from the DOM,
 * sends to background.js for AI evaluation,
 * overlays meme quality badges on the page.
 */

const SITE = location.hostname.includes("gmgn") ? "gmgn" : "dexscreener";
let scanTimer = null;
const evaluated = new Map();  // address -> result
const pendingAddresses = new Set();

// ── Boot ────────────────────────────────────────────────────

init();

async function init() {
  const settings = await getSettings();
  if (!settings.enabled || !settings.apiKey) {
    console.log("[CoinScreener] Inactive — set API key in extension popup");
    return;
  }

  const interval = (settings.scanInterval || 5) * 1000;
  console.log(`[CoinScreener] Active on ${SITE} — scanning every ${interval/1000}s`);

  // Wait for page to render (both sites are SPAs)
  setTimeout(() => scanPage(), 3000);
  scanTimer = setInterval(() => scanPage(), interval);

  // Re-scan on SPA navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(() => scanPage(), 2000);
    }
  }).observe(document.body, { childList: true, subtree: true });
}


// ── Scrape tokens from DOM ──────────────────────────────────

function scanPage() {
  const tokens = SITE === "gmgn" ? scrapeGMGN() : scrapeDexScreener();

  // Only send tokens we haven't evaluated yet
  const newTokens = tokens.filter(t => !evaluated.has(t.address) && !pendingAddresses.has(t.address));

  if (newTokens.length > 0) {
    newTokens.forEach(t => pendingAddresses.add(t.address));
    chrome.runtime.sendMessage({ type: "EVALUATE_TOKENS", tokens: newTokens });
  }

  // Re-apply existing badges (SPA may have re-rendered rows)
  for (const [addr, result] of evaluated) {
    applyBadge(addr, result);
  }
}


function scrapeGMGN() {
  const tokens = [];
  const seen = new Set();

  // ── Strategy 1: Find links to token pages ─────────────────
  // GMGN pattern: /sol/token/ADDRESS or /bsc/token/ADDRESS etc.
  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute("href") || "";
    const match = href.match(/\/(sol|bsc|eth|base|tron|monad)\/token\/([A-Za-z0-9]{20,})/);
    if (!match) return;

    const chain = match[1];
    const address = match[2];
    if (seen.has(address)) return;
    seen.add(address);

    // Grab name/symbol from the link text or surrounding row
    const row = findRow(link);
    const { name, symbol } = extractNameSymbol(row || link);

    // Check if there's a twitter link visible near this token
    const twitterUrl = findNearbyTwitter(row || link);

    tokens.push({ chain: normalizeChain(chain), address, name, symbol, twitterUrl, element: link });
  });

  // ── Strategy 2: Find raw Solana addresses in the page ─────
  // Solana addresses are base58, typically 32-44 chars
  document.querySelectorAll('[class*="address"], [class*="token"], [data-address]').forEach(el => {
    const text = el.textContent?.trim() || el.dataset?.address || "";
    const match = text.match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);
    if (match && !seen.has(match[1])) {
      seen.add(match[1]);
      const row = findRow(el);
      const { name, symbol } = extractNameSymbol(row || el);
      tokens.push({ chain: "solana", address: match[1], name, symbol, element: el });
    }
  });

  // ── Strategy 3: Find EVM addresses (0x...) ────────────────
  document.querySelectorAll('[class*="address"], [class*="token"]').forEach(el => {
    const text = el.textContent?.trim() || "";
    const match = text.match(/(0x[a-fA-F0-9]{40})/);
    if (match && !seen.has(match[1])) {
      seen.add(match[1]);
      const row = findRow(el);
      const { name, symbol } = extractNameSymbol(row || el);
      // Chain detection: check URL or default to ethereum
      const chain = location.pathname.includes("/bsc") ? "bsc"
        : location.pathname.includes("/base") ? "base"
        : "ethereum";
      tokens.push({ chain, address: match[1], name, symbol, element: el });
    }
  });

  return tokens;
}


function scrapeDexScreener() {
  const tokens = [];
  const seen = new Set();

  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute("href") || "";
    const match = href.match(/^\/(solana|ethereum|base|bsc|arbitrum|polygon|avalanche|optimism|sui)\/([A-Za-z0-9]{20,})/);
    if (!match) return;

    const chain = match[1];
    const address = match[2];
    if (seen.has(address)) return;
    seen.add(address);

    const row = findRow(link);
    const { name, symbol } = extractNameSymbol(row || link);
    tokens.push({ chain, address, name, symbol, element: link });
  });

  return tokens;
}


// ── DOM helpers ─────────────────────────────────────────────

function findRow(el) {
  // Walk up the DOM to find the table row or card container
  return el.closest('tr, [class*="row"], [class*="Row"], [class*="item"], [class*="Item"], [class*="card"], [class*="Card"], [class*="pair"], [class*="Pair"]')
    || el.parentElement?.parentElement;
}

function extractNameSymbol(el) {
  const text = el?.textContent || "";
  // Symbol: uppercase 2-10 chars, possibly with $
  const symMatch = text.match(/\$?([A-Z][A-Z0-9]{1,9})\b/);
  // Name: first reasonable mixed-case string
  const parts = text.split(/[\n\t/|·]+/).map(s => s.trim()).filter(s => s.length >= 2 && s.length <= 30);
  const name = parts.find(p => !/^[A-Z0-9$]+$/.test(p) && !/^\d/.test(p)) || parts[0] || "?";

  return { name, symbol: symMatch ? symMatch[1] : "?" };
}

function findNearbyTwitter(el) {
  if (!el) return null;
  // Look for twitter/x links within the same row or nearby
  const container = el.closest('tr, div, [class*="row"], [class*="Row"]') || el;
  const links = container.querySelectorAll('a[href*="x.com"], a[href*="twitter.com"]');
  for (const link of links) {
    const href = link.getAttribute("href");
    if (href && (href.includes("x.com/") || href.includes("twitter.com/"))) {
      return href;
    }
  }
  return null;
}

function normalizeChain(chain) {
  const map = { sol: "solana", bsc: "bsc", eth: "ethereum", base: "base", tron: "tron", monad: "monad" };
  return map[chain] || chain;
}


// ── Receive results from background ─────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TOKEN_RESULT") {
    pendingAddresses.delete(msg.address);
    evaluated.set(msg.address, msg);
    applyBadge(msg.address, msg);
  }
});


// ── Badge overlay ───────────────────────────────────────────

function applyBadge(address, result) {
  // Find all elements linking to this token address
  const allLinks = document.querySelectorAll('a[href]');
  for (const link of allLinks) {
    const href = link.getAttribute("href") || "";
    if (!href.includes(address)) continue;

    const row = findRow(link);
    if (!row) continue;

    // Skip if badge already exists on this exact row
    if (row.querySelector(`.cs-badge[data-addr="${address}"]`)) continue;

    const badge = document.createElement("div");
    badge.className = "cs-badge";
    badge.dataset.addr = address;

    const emoji = { gem: "💎", interesting: "👀", meh: "😐", skip: "👎", scam: "🚩", error: "⚠️", pending: "⏳" }[result.verdict] || "❓";
    const color = result.score < 0 ? "#555"
      : result.score >= 70 ? "#16a34a"
      : result.score >= 50 ? "#ca8a04"
      : result.score >= 30 ? "#ea580c"
      : "#dc2626";

    badge.innerHTML = `
      <span class="cs-score" style="background:${color}">${emoji} ${result.score >= 0 ? result.score : "?"}</span>
      <span class="cs-tip">
        <strong>${(result.verdict || "?").toUpperCase()}</strong><br>
        ${esc(result.reason || "Evaluating...")}
      </span>
    `;

    row.style.position = row.style.position || "relative";
    row.appendChild(badge);
    break; // one badge per address
  }
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}


// ── Settings ────────────────────────────────────────────────

function getSettings() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, r => {
      resolve(r || { enabled: true, apiKey: "", scanInterval: 5 });
    });
  });
}
