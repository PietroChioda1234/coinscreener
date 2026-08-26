/*
 * content.js — runs on dexscreener.com
 *
 * Scans the page DOM for token pairs, extracts addresses/names,
 * sends them to background.js for evaluation,
 * then overlays AI scores directly on the DexScreener UI.
 */

let scanTimer = null;
let isRunning = false;
const overlaidTokens = new Map(); // address -> DOM element of our badge


// ── Start scanning when page loads ──────────────────────────

init();

async function init() {
  const settings = await getSettings();
  if (!settings.enabled) return;
  if (!settings.apiKey) {
    console.log("[CoinScreener] No API key set — click the extension icon to configure.");
    return;
  }

  console.log("[CoinScreener] Active — scanning every", settings.scanInterval, "seconds");

  // Initial scan after a short delay (let DexScreener load)
  setTimeout(() => scanPage(), 2000);

  // Recurring scan
  scanTimer = setInterval(() => scanPage(), (settings.scanInterval || 5) * 1000);

  // Also scan when the URL changes (DexScreener is a SPA)
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(() => scanPage(), 1500);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}


// ── Scrape tokens from the page ─────────────────────────────

function scanPage() {
  if (isRunning) return;
  isRunning = true;

  try {
    const tokens = extractTokensFromDOM();

    if (tokens.length > 0) {
      // Send to background for evaluation
      chrome.runtime.sendMessage({
        type: "EVALUATE_TOKENS",
        tokens: tokens,
      });
    }
  } catch (err) {
    console.warn("[CoinScreener] Scan error:", err);
  }

  isRunning = false;
}


function extractTokensFromDOM() {
  const tokens = [];
  const seen = new Set();

  // Strategy: find all links that point to token pair pages
  // DexScreener URL pattern: /{chain}/{pairAddress}
  // These appear as <a href="/solana/ABC123...">
  const links = document.querySelectorAll('a[href]');

  for (const link of links) {
    const href = link.getAttribute("href") || "";

    // Match pattern: /chain/pairAddress (address is typically 30+ chars)
    const match = href.match(
      /^\/(solana|ethereum|base|bsc|arbitrum|polygon|avalanche|fantom|optimism|sui)\/([A-Za-z0-9]{30,})/
    );
    if (!match) continue;

    const chain = match[1];
    const pairAddress = match[2];

    if (seen.has(pairAddress)) continue;
    seen.add(pairAddress);

    // Try to extract name/symbol from the link's text content or nearby elements
    const row = link.closest("tr, [class*='Row'], [class*='row'], [class*='pair'], div")
      || link;
    const textContent = row.textContent || "";

    // Look for symbol pattern — usually uppercase 2-10 chars
    const symbolMatch = textContent.match(/\b([A-Z$][A-Z0-9$]{1,9})\b/);

    tokens.push({
      chain,
      pairAddress,
      address: pairAddress, // will be resolved to token address by background
      symbol: symbolMatch ? symbolMatch[1] : "?",
      name: extractName(row),
      element: link, // keep reference for overlay
    });
  }

  return tokens;
}


function extractName(element) {
  // Try to find the token name from the DOM element
  // DexScreener usually shows name in a specific span/div
  const text = element.textContent || "";
  // Get first reasonable-length text that isn't all caps (that's the symbol)
  const parts = text.split(/[\n\t/]+/).map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.length >= 3 && part.length <= 30 && !/^[A-Z0-9$]+$/.test(part)) {
      return part;
    }
  }
  return parts[0] || "?";
}


// ── Receive results from background and overlay ─────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TOKEN_RESULT") {
    overlayResult(msg.address, msg);
  }
});


function overlayResult(address, result) {
  // Find the link element for this token on the page
  const links = document.querySelectorAll('a[href]');
  for (const link of links) {
    const href = link.getAttribute("href") || "";
    if (!href.includes(address)) continue;

    // Find the row container
    const row = link.closest("tr, [class*='Row'], [class*='row'], div") || link;

    // Remove existing badge if any
    const existing = row.querySelector(".cs-badge");
    if (existing) existing.remove();

    // Create badge
    const badge = document.createElement("div");
    badge.className = "cs-badge";
    badge.dataset.address = address;

    const emoji = getVerdictEmoji(result.verdict);
    const color = getScoreColor(result.score, result.verdict);

    badge.innerHTML = `
      <span class="cs-badge-score" style="background:${color}">${emoji} ${result.score >= 0 ? result.score : "?"}</span>
      <span class="cs-badge-tooltip">
        <strong>${result.verdict?.toUpperCase() || "?"}</strong><br>
        ${escapeHtml(result.reason || "")}
      </span>
    `;

    // Insert badge — try to put it at the end of the row
    row.style.position = "relative";
    row.appendChild(badge);

    break; // only first match
  }
}


function getVerdictEmoji(verdict) {
  const map = {
    gem: "💎",
    interesting: "👀",
    meh: "😐",
    skip: "👎",
    scam: "🚩",
    error: "⚠️",
  };
  return map[verdict] || "❓";
}


function getScoreColor(score, verdict) {
  if (score < 0 || verdict === "error") return "#666";
  if (score >= 70) return "#16a34a";
  if (score >= 50) return "#ca8a04";
  if (score >= 30) return "#ea580c";
  return "#dc2626";
}


function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}


// ── Helpers ─────────────────────────────────────────────────

function getSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (response) => {
      resolve(response || { enabled: true, apiKey: "", scanInterval: 5 });
    });
  });
}
