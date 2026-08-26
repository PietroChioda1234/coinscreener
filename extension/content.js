/*
 * content.js — sidebar + scraper (no LLM needed)
 *
 * Scrapes tokens from GMGN / DexScreener and shows them
 * in a sidebar as a live feed. No API key required.
 *
 * If an API key is set, it also sends tokens to background.js
 * for AI meme quality scoring (optional upgrade).
 */

const SITE = location.hostname.includes("gmgn") ? "gmgn" : "dexscreener";
const found = new Map(); // address -> card data
let scanCount = 0;

// ── CSS ─────────────────────────────────────────────────────

const CSS = `
#cs-sidebar {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: 320px; z-index: 999999;
  background: #0a0a0f;
  border-left: 1px solid #1e1e2e;
  display: flex; flex-direction: column;
  font-family: system-ui, -apple-system, sans-serif;
  color: #d1d5db; font-size: 13px;
}
#cs-drag {
  position: absolute; left: -4px; top: 0; bottom: 0; width: 8px;
  cursor: col-resize; z-index: 1000000;
}
#cs-drag:hover, #cs-drag:active { background: #8b5cf622; }
#cs-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; border-bottom: 1px solid #1e1e2e; flex-shrink: 0;
}
#cs-title { font-weight: 800; font-size: 14px; }
#cs-head-right { display: flex; align-items: center; gap: 8px; }
#cs-count {
  background: #8b5cf6; color: #fff; font-size: 11px; font-weight: 700;
  padding: 1px 7px; border-radius: 10px; min-width: 20px; text-align: center;
}
#cs-gear, #cs-collapse {
  background: none; border: none; color: #888; font-size: 16px;
  cursor: pointer; padding: 2px;
}
#cs-gear:hover, #cs-collapse:hover { color: #fff; }
#cs-settings {
  padding: 10px 14px; border-bottom: 1px solid #1e1e2e;
  flex-shrink: 0; background: #0f0f18;
}
#cs-settings label {
  display: block; font-size: 11px; color: #888; font-weight: 600;
  text-transform: uppercase; letter-spacing: .4px; margin-bottom: 3px; margin-top: 8px;
}
#cs-settings label:first-child { margin-top: 0; }
#cs-settings input[type="password"] {
  width: 100%; padding: 7px 8px; border-radius: 6px;
  border: 1px solid #2a2a3a; background: #141420; color: #e5e5e5;
  font-size: 12px; font-family: monospace;
}
#cs-settings input[type="password"]:focus { outline: none; border-color: #8b5cf6; }
#cs-settings input[type="range"] { width: 100%; accent-color: #8b5cf6; }
#cs-settings-actions { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
#cs-save {
  padding: 6px 16px; border-radius: 6px; border: none;
  background: #8b5cf6; color: #fff; font-weight: 700; font-size: 12px; cursor: pointer;
}
#cs-save:hover { background: #7c3aed; }
#cs-saved { color: #22c55e; font-size: 12px; font-weight: 600; }
#cs-feed {
  flex: 1; overflow-y: auto; padding: 6px;
  scrollbar-width: thin; scrollbar-color: #333 transparent;
}
.cs-card {
  padding: 10px 12px; border-radius: 8px; margin-bottom: 4px;
  border: 1px solid #1e1e2e; transition: background .3s; cursor: default;
}
.cs-card.cs-new { background: #1e293b; }
.cs-card:hover { background: #1e1e2e; }
.cs-card-top { display: flex; align-items: center; gap: 6px; }
.cs-card-sym { font-weight: 700; font-size: 14px; color: #fff; }
.cs-card-chain {
  font-size: 10px; font-weight: 600; color: #888;
  background: #1e1e2e; padding: 1px 5px; border-radius: 3px;
}
.cs-card-score {
  margin-left: auto;
  font-family: 'JetBrains Mono', monospace; font-weight: 800; font-size: 13px;
  padding: 2px 8px; border-radius: 5px; color: #fff;
}
.cs-card-name {
  font-size: 11px; color: #888; margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cs-card-reason {
  font-size: 12px; color: #aaa; margin-top: 4px; line-height: 1.4;
}
.cs-card-twitter {
  font-size: 11px; color: #1d9bf0; margin-top: 2px;
}
.cs-card-links { display: flex; gap: 6px; margin-top: 6px; }
.cs-card-link {
  font-size: 11px; color: #8b5cf6; text-decoration: none; font-weight: 600;
}
.cs-card-link:hover { color: #a78bfa; }
#cs-status {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-top: 1px solid #1e1e2e; flex-shrink: 0;
  font-size: 11px; color: #888;
}
#cs-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #555; flex-shrink: 0;
}
#cs-dot.active { background: #22c55e; animation: cs-pulse 1.5s ease-in-out infinite; }
#cs-dot.waiting { background: #eab308; }
@keyframes cs-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
#cs-status-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#cs-tab {
  position: fixed; right: 0; top: 50%; transform: translateY(-50%);
  z-index: 999999; width: 32px; height: 48px;
  background: #0a0a0f; border: 1px solid #1e1e2e;
  border-right: none; border-radius: 8px 0 0 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; cursor: pointer; color: #fff;
}
#cs-tab:hover { background: #1e1e2e; }
`;


// ── Build sidebar ───────────────────────────────────────────

function buildSidebar() {
  if (document.getElementById("cs-root")) return;

  const root = document.createElement("div");
  root.id = "cs-root";
  root.innerHTML = `
    <style>${CSS}</style>
    <div id="cs-sidebar">
      <div id="cs-drag"></div>
      <div id="cs-head">
        <span id="cs-title">🪙 Screener</span>
        <div id="cs-head-right">
          <span id="cs-count">0</span>
          <button id="cs-gear">⚙</button>
          <button id="cs-collapse">◀</button>
        </div>
      </div>
      <div id="cs-settings" style="display:none">
        <label>API Key <span style="font-weight:400;text-transform:none;color:#555">(optional — enables AI scoring)</span></label>
        <input type="password" id="cs-key" placeholder="sk-ant-api03-..." spellcheck="false">
        <label>Scan interval: <span id="cs-iv-label">3</span>s</label>
        <input type="range" id="cs-iv" min="2" max="30" value="3">
        <div id="cs-settings-actions">
          <button id="cs-save">Save</button>
          <span id="cs-saved"></span>
        </div>
      </div>
      <div id="cs-feed"></div>
      <div id="cs-status">
        <span id="cs-dot" class="waiting"></span>
        <span id="cs-status-text">Starting…</span>
      </div>
    </div>
    <button id="cs-tab" style="display:none">🪙</button>
  `;
  document.body.appendChild(root);

  // Settings toggle
  const settingsEl = document.getElementById("cs-settings");
  document.getElementById("cs-gear").onclick = () => {
    settingsEl.style.display = settingsEl.style.display === "none" ? "block" : "none";
  };

  // Collapse / expand
  const sidebar = document.getElementById("cs-sidebar");
  const tab = document.getElementById("cs-tab");
  document.getElementById("cs-collapse").onclick = () => {
    sidebar.style.display = "none"; tab.style.display = "flex";
    document.body.style.marginRight = "0";
  };
  tab.onclick = () => {
    sidebar.style.display = "flex"; tab.style.display = "none";
    document.body.style.marginRight = sidebar.style.width || "320px";
  };

  // Interval slider
  const ivSlider = document.getElementById("cs-iv");
  const ivLabel = document.getElementById("cs-iv-label");
  ivSlider.oninput = () => { ivLabel.textContent = ivSlider.value; };

  // Save
  document.getElementById("cs-save").onclick = () => {
    const key = document.getElementById("cs-key").value.trim();
    const interval = parseInt(ivSlider.value) || 3;
    chrome.storage.local.set({ apiKey: key, scanInterval: interval }, () => {
      document.getElementById("cs-saved").textContent = "✓ Saved";
      setTimeout(() => { document.getElementById("cs-saved").textContent = ""; }, 2000);
      setStatus(key ? "Saved — AI scoring enabled" : "Saved — running without AI", "active");
    });
  };

  // Drag to resize
  let dragging = false;
  document.getElementById("cs-drag").onmousedown = (e) => { dragging = true; e.preventDefault(); };
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const w = Math.max(240, Math.min(600, window.innerWidth - e.clientX));
    sidebar.style.width = w + "px";
    document.body.style.marginRight = w + "px";
  });
  document.addEventListener("mouseup", () => { dragging = false; });

  // Push page content
  document.body.style.marginRight = "320px";
  document.body.style.transition = "margin-right .2s";
}


// ── Status ──────────────────────────────────────────────────

function setStatus(text, state = "active") {
  const dot = document.getElementById("cs-dot");
  const label = document.getElementById("cs-status-text");
  if (dot) { dot.className = state; }
  if (label) label.textContent = text;
}


// ── Add token to feed ───────────────────────────────────────

function addToFeed(token) {
  const feed = document.getElementById("cs-feed");
  if (!feed) return;

  const chain = token.chain || "?";
  const chainShort = { solana:"SOL", ethereum:"ETH", base:"BASE", bsc:"BSC", tron:"TRON", monad:"MON" }[chain] || chain.slice(0,4).toUpperCase();

  let link;
  if (SITE === "gmgn") {
    const cMap = { solana:"sol", ethereum:"eth", base:"base", bsc:"bsc", tron:"tron", monad:"monad" };
    link = `https://gmgn.ai/${cMap[chain] || chain}/token/${token.address}`;
  } else {
    link = `https://dexscreener.com/${chain}/${token.address}`;
  }

  const card = document.createElement("div");
  card.className = "cs-card cs-new";
  card.id = `cs-token-${token.address}`;

  card.innerHTML = `
    <div class="cs-card-top">
      <span class="cs-card-sym">${esc(token.symbol)}</span>
      <span class="cs-card-chain">${chainShort}</span>
      ${token.twitterUrl ? `<span class="cs-card-twitter">𝕏</span>` : ''}
      <span class="cs-card-score" id="cs-score-${token.address}" style="display:none"></span>
    </div>
    <div class="cs-card-name">${esc(token.name)}</div>
    <div class="cs-card-reason" id="cs-reason-${token.address}"></div>
    <div class="cs-card-links">
      <a class="cs-card-link" href="${link}" target="_blank">Open →</a>
      ${token.twitterUrl ? `<a class="cs-card-link" href="${esc(token.twitterUrl)}" target="_blank">Twitter →</a>` : ''}
      <a class="cs-card-link" href="https://rugcheck.xyz/tokens/${token.address}" target="_blank" style="color:#eab308">RugCheck →</a>
    </div>
  `;

  // Newest at top
  feed.prepend(card);

  // Remove highlight after a moment
  setTimeout(() => { card.classList.remove("cs-new"); }, 2000);

  // Update count
  const countEl = document.getElementById("cs-count");
  if (countEl) countEl.textContent = found.size;
}

function updateCardWithScore(address, result) {
  const scoreEl = document.getElementById(`cs-score-${address}`);
  const reasonEl = document.getElementById(`cs-reason-${address}`);
  if (!scoreEl || !reasonEl) return;

  const emoji = { gem:"💎", interesting:"👀", meh:"😐", skip:"👎", scam:"🚩" }[result.verdict] || "❓";
  const bg = result.score >= 70 ? "#16a34a"
    : result.score >= 50 ? "#ca8a04"
    : result.score >= 30 ? "#ea580c"
    : "#dc2626";

  scoreEl.style.display = "inline-block";
  scoreEl.style.background = bg;
  scoreEl.textContent = `${emoji} ${result.score}`;
  reasonEl.textContent = result.reason || "";
}

function esc(s) { const d = document.createElement("span"); d.textContent = s || ""; return d.innerHTML; }


// ── Scraping ────────────────────────────────────────────────

function scanPage() {
  scanCount++;
  const tokens = SITE === "gmgn" ? scrapeGMGN() : scrapeDexScreener();

  let newCount = 0;
  for (const t of tokens) {
    if (found.has(t.address)) continue;
    found.set(t.address, t);
    addToFeed(t);
    newCount++;
  }

  if (newCount > 0) {
    setStatus(`+${newCount} new · ${found.size} total · scan #${scanCount}`, "active");

    // If API key is set, send new tokens for AI scoring
    chrome.storage.local.get({ apiKey: "" }, (data) => {
      if (data.apiKey) {
        const newTokens = tokens.filter(t => !t._scored);
        if (newTokens.length) {
          chrome.runtime.sendMessage({ type: "EVALUATE_TOKENS", tokens: newTokens });
        }
      }
    });
  } else if (tokens.length > 0) {
    setStatus(`Watching · ${found.size} found · scan #${scanCount}`, "active");
  } else {
    setStatus(`No tokens on page · scan #${scanCount} · scroll or navigate`, "waiting");
  }
}

function scrapeGMGN() {
  const tokens = [], seen = new Set();

  document.querySelectorAll('a[href*="/token/"]').forEach(link => {
    const m = (link.getAttribute("href") || "").match(/\/(sol|bsc|eth|base|tron|monad)\/token\/([A-Za-z0-9]{20,})/);
    if (!m || seen.has(m[2])) return;
    seen.add(m[2]);
    const row = findRow(link);
    const { name, symbol } = extractInfo(row || link);
    const twitterUrl = findTwitter(row || link);
    const chain = { sol:"solana", bsc:"bsc", eth:"ethereum", base:"base", tron:"tron", monad:"monad" }[m[1]] || m[1];
    tokens.push({ chain, address: m[2], name, symbol, twitterUrl });
  });

  // Raw Solana addresses
  document.querySelectorAll('[class*="addr"], [class*="token"], [data-address], [class*="contract"]').forEach(el => {
    const m = (el.textContent?.trim() || el.dataset?.address || "").match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      const row = findRow(el);
      const { name, symbol } = extractInfo(row || el);
      tokens.push({ chain: "solana", address: m[1], name, symbol });
    }
  });

  return tokens;
}

function scrapeDexScreener() {
  const tokens = [], seen = new Set();
  document.querySelectorAll('a[href]').forEach(link => {
    const m = (link.getAttribute("href") || "").match(/^\/(solana|ethereum|base|bsc|arbitrum|polygon|optimism|sui)\/([A-Za-z0-9]{20,})/);
    if (!m || seen.has(m[2])) return;
    seen.add(m[2]);
    const row = findRow(link);
    const { name, symbol } = extractInfo(row || link);
    tokens.push({ chain: m[1], address: m[2], name, symbol });
  });
  return tokens;
}

function findRow(el) {
  return el.closest('tr, [class*="ow"], [class*="item"], [class*="Item"], [class*="card"], [class*="Card"], [class*="pair"], [class*="Pair"]')
    || el.parentElement?.parentElement;
}

function extractInfo(el) {
  const text = el?.textContent || "";
  const symMatch = text.match(/\$?([A-Z][A-Z0-9$]{1,9})\b/);
  const parts = text.split(/[\n\t/|·]+/).map(s => s.trim()).filter(s => s.length >= 2 && s.length <= 30);
  const name = parts.find(p => !/^[A-Z0-9$]+$/.test(p) && !/^\d/.test(p)) || parts[0] || "?";
  return { name, symbol: symMatch ? symMatch[1] : "?" };
}

function findTwitter(el) {
  if (!el) return null;
  const c = el.closest('tr, div, [class*="row"], [class*="Row"]') || el;
  for (const a of c.querySelectorAll('a[href*="x.com"], a[href*="twitter.com"]')) {
    const h = a.getAttribute("href");
    if (h && (h.includes("x.com/") || h.includes("twitter.com/"))) return h;
  }
  return null;
}


// ── Receive AI scores (optional) ────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TOKEN_RESULT" && msg.score >= 0) {
    updateCardWithScore(msg.address, msg);
  }
});


// ── Init ────────────────────────────────────────────────────

function init() {
  buildSidebar();
  setStatus(`Ready — scanning ${SITE} in 2s`, "waiting");

  // Load settings just for display
  chrome.storage.local.get({ apiKey: "", scanInterval: 3 }, (data) => {
    document.getElementById("cs-key").value = data.apiKey || "";
    document.getElementById("cs-iv").value = data.scanInterval || 3;
    document.getElementById("cs-iv-label").textContent = data.scanInterval || 3;

    const interval = (data.scanInterval || 3) * 1000;

    // Start scanning immediately — no API key needed
    setTimeout(() => {
      setStatus(`Scanning ${SITE}…`, "active");
      scanPage();
    }, 2000);

    setInterval(() => scanPage(), interval);
  });

  // Re-scan on SPA navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(() => scanPage(), 1500);
    }
  }).observe(document.body, { childList: true, subtree: true });
}

init();
