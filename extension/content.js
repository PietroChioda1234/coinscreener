/*
 * content.js — sidebar + scraper
 *
 * Injects a resizable sidebar into GMGN / DexScreener.
 * Scrapes tokens from the page, sends to background for AI eval,
 * streams results into the sidebar as a continuous feed.
 */

const SITE = location.hostname.includes("gmgn") ? "gmgn" : "dexscreener";
const evaluated = new Map();
const pendingAddrs = new Set();
let settings = { apiKey: "", enabled: true, scanInterval: 5 };
let sidebarOpen = true;

// ── Build sidebar ───────────────────────────────────────────

function buildSidebar() {
  // Don't double-inject
  if (document.getElementById("cs-root")) return;

  const root = document.createElement("div");
  root.id = "cs-root";
  root.innerHTML = `
    <style>${SIDEBAR_CSS}</style>
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
        <label>API Key</label>
        <input type="password" id="cs-key" placeholder="sk-ant-api03-..." spellcheck="false">
        <label>Scan interval: <span id="cs-iv-label">5</span>s</label>
        <input type="range" id="cs-iv" min="3" max="30" value="5">
        <div id="cs-settings-actions">
          <button id="cs-save">Save</button>
          <span id="cs-saved"></span>
        </div>
      </div>

      <div id="cs-feed"></div>

      <div id="cs-empty">
        Scanning ${SITE}…<br>
        <span style="font-size:11px;color:#555">Results appear as tokens are found and evaluated</span>
      </div>
    </div>
    <button id="cs-tab" style="display:none">🪙</button>
  `;
  document.body.appendChild(root);

  // ── Wire up events ──────────────────────────────────────

  // Settings toggle
  const settingsEl = document.getElementById("cs-settings");
  document.getElementById("cs-gear").onclick = () => {
    settingsEl.style.display = settingsEl.style.display === "none" ? "block" : "none";
  };

  // Collapse / expand
  const sidebar = document.getElementById("cs-sidebar");
  const tab = document.getElementById("cs-tab");
  document.getElementById("cs-collapse").onclick = () => {
    sidebar.style.display = "none";
    tab.style.display = "flex";
    document.body.style.marginRight = "0";
    sidebarOpen = false;
  };
  tab.onclick = () => {
    sidebar.style.display = "flex";
    tab.style.display = "none";
    document.body.style.marginRight = sidebar.style.width || "320px";
    sidebarOpen = true;
  };

  // Interval slider
  const ivSlider = document.getElementById("cs-iv");
  const ivLabel = document.getElementById("cs-iv-label");
  ivSlider.oninput = () => { ivLabel.textContent = ivSlider.value; };

  // Save
  document.getElementById("cs-save").onclick = () => {
    settings.apiKey = document.getElementById("cs-key").value.trim();
    settings.scanInterval = parseInt(ivSlider.value) || 5;
    chrome.storage.local.set(settings, () => {
      const el = document.getElementById("cs-saved");
      el.textContent = "✓ Saved";
      setTimeout(() => { el.textContent = ""; }, 2000);
    });
  };

  // Drag to resize
  const drag = document.getElementById("cs-drag");
  let dragging = false;
  drag.onmousedown = (e) => { dragging = true; e.preventDefault(); };
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const w = Math.max(240, Math.min(600, window.innerWidth - e.clientX));
    sidebar.style.width = w + "px";
    document.body.style.marginRight = w + "px";
  });
  document.addEventListener("mouseup", () => { dragging = false; });

  // Push page content to make room
  document.body.style.marginRight = "320px";
  document.body.style.transition = "margin-right .2s";
}


// ── Feed management ─────────────────────────────────────────

function addToFeed(result) {
  const feed = document.getElementById("cs-feed");
  const empty = document.getElementById("cs-empty");
  if (!feed) return;
  if (empty) empty.style.display = "none";

  // Don't show errors or very low scores cluttering the feed
  if (result.score < 0) return;

  // Build card
  const card = document.createElement("div");
  card.className = "cs-card";
  card.dataset.score = result.score;

  const emoji = { gem:"💎", interesting:"👀", meh:"😐", skip:"👎", scam:"🚩" }[result.verdict] || "❓";
  const scoreColor = result.score >= 70 ? "#22c55e"
    : result.score >= 50 ? "#eab308"
    : result.score >= 30 ? "#f97316"
    : "#ef4444";

  const chain = result.chain || "?";
  const chainShort = { solana:"SOL", ethereum:"ETH", base:"BASE", bsc:"BSC", tron:"TRON" }[chain] || chain.slice(0,4).toUpperCase();

  // Build link to token page
  let link = "#";
  if (SITE === "gmgn") {
    const cMap = { solana:"sol", ethereum:"eth", base:"base", bsc:"bsc" };
    link = `https://gmgn.ai/${cMap[chain] || chain}/token/${result.address}`;
  } else {
    link = `https://dexscreener.com/${chain}/${result.address}`;
  }

  card.innerHTML = `
    <div class="cs-card-top">
      <span class="cs-card-emoji">${emoji}</span>
      <span class="cs-card-score" style="color:${scoreColor}">${result.score}</span>
      <span class="cs-card-sym">${result.symbol || "?"}</span>
      <span class="cs-card-chain">${chainShort}</span>
    </div>
    <div class="cs-card-name">${esc(result.name || "")}</div>
    <div class="cs-card-reason">${esc(result.reason || "")}</div>
    <a class="cs-card-link" href="${link}" target="_blank">Open on ${SITE === "gmgn" ? "GMGN" : "DexScreener"} →</a>
  `;

  // Insert sorted — best scores at top
  let inserted = false;
  for (const existing of feed.children) {
    if (parseInt(existing.dataset.score) < result.score) {
      feed.insertBefore(card, existing);
      inserted = true;
      break;
    }
  }
  if (!inserted) feed.appendChild(card);

  // Update count
  const countEl = document.getElementById("cs-count");
  if (countEl) countEl.textContent = feed.children.length;

  // Highlight briefly
  card.style.background = "#1e293b";
  setTimeout(() => { card.style.background = ""; }, 1500);
}

function esc(s) { const d = document.createElement("span"); d.textContent = s; return d.innerHTML; }


// ── Scraping ────────────────────────────────────────────────

function scanPage() {
  const tokens = SITE === "gmgn" ? scrapeGMGN() : scrapeDexScreener();
  const newTokens = tokens.filter(t => !evaluated.has(t.address) && !pendingAddrs.has(t.address));
  if (newTokens.length > 0) {
    newTokens.forEach(t => pendingAddrs.add(t.address));
    chrome.runtime.sendMessage({ type: "EVALUATE_TOKENS", tokens: newTokens });
  }
}

function scrapeGMGN() {
  const tokens = [], seen = new Set();

  // Token page links: /sol/token/ADDR, /bsc/token/ADDR, etc.
  document.querySelectorAll('a[href*="/token/"]').forEach(link => {
    const m = (link.getAttribute("href") || "").match(/\/(sol|bsc|eth|base|tron|monad)\/token\/([A-Za-z0-9]{20,})/);
    if (!m || seen.has(m[2])) return;
    seen.add(m[2]);
    const row = findRow(link);
    const { name, symbol } = extractInfo(row || link);
    const twitterUrl = findTwitter(row || link);
    const chain = { sol:"solana", bsc:"bsc", eth:"ethereum", base:"base", tron:"tron", monad:"monad" }[m[1]] || m[1];
    tokens.push({ chain, address: m[2], name, symbol, twitterUrl, element: link });
  });

  // Raw Solana addresses
  document.querySelectorAll('[class*="addr"], [class*="token"], [data-address], [class*="contract"]').forEach(el => {
    const m = (el.textContent?.trim() || el.dataset?.address || "").match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      const row = findRow(el);
      const { name, symbol } = extractInfo(row || el);
      tokens.push({ chain: "solana", address: m[1], name, symbol, element: el });
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
    tokens.push({ chain: m[1], address: m[2], name, symbol, element: link });
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


// ── Message handling ────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TOKEN_RESULT") {
    pendingAddrs.delete(msg.address);
    evaluated.set(msg.address, msg);
    addToFeed(msg);
  }
});


// ── Init ────────────────────────────────────────────────────

async function init() {
  buildSidebar();

  // Load settings
  chrome.storage.local.get({ apiKey: "", enabled: true, scanInterval: 5 }, (data) => {
    settings = data;
    document.getElementById("cs-key").value = data.apiKey || "";
    document.getElementById("cs-iv").value = data.scanInterval || 5;
    document.getElementById("cs-iv-label").textContent = data.scanInterval || 5;

    if (!data.apiKey) {
      document.getElementById("cs-settings").style.display = "block";
      document.getElementById("cs-empty").innerHTML =
        '⚙️ Paste your <a href="https://console.anthropic.com" target="_blank" style="color:#8b5cf6">Anthropic API key</a> above to start';
      return;
    }

    // Start scanning
    setTimeout(() => scanPage(), 2000);
    setInterval(() => scanPage(), (data.scanInterval || 5) * 1000);
  });

  // Re-scan on SPA navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(() => scanPage(), 2000);
    }
  }).observe(document.body, { childList: true, subtree: true });
}

init();


// ── CSS (injected inline to avoid conflicts) ────────────────

const SIDEBAR_CSS = `
#cs-sidebar {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: 320px; z-index: 999999;
  background: #0a0a0f;
  border-left: 1px solid #1e1e2e;
  display: flex; flex-direction: column;
  font-family: system-ui, -apple-system, sans-serif;
  color: #d1d5db;
  font-size: 13px;
}

#cs-drag {
  position: absolute; left: -4px; top: 0; bottom: 0; width: 8px;
  cursor: col-resize; z-index: 1000000;
}
#cs-drag:hover, #cs-drag:active { background: #8b5cf622; }

#cs-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid #1e1e2e;
  flex-shrink: 0;
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

#cs-empty {
  padding: 40px 20px; text-align: center; color: #555;
  font-size: 13px; line-height: 1.6;
}

.cs-card {
  padding: 10px 12px; border-radius: 8px; margin-bottom: 4px;
  border: 1px solid #1e1e2e;
  transition: background .3s;
  cursor: default;
}
.cs-card:hover { background: #1e1e2e; }

.cs-card-top {
  display: flex; align-items: center; gap: 6px;
}
.cs-card-emoji { font-size: 16px; }
.cs-card-score {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-weight: 800; font-size: 15px;
}
.cs-card-sym {
  font-weight: 700; font-size: 13px; color: #fff;
}
.cs-card-chain {
  font-size: 10px; font-weight: 600; color: #888;
  background: #1e1e2e; padding: 1px 5px; border-radius: 3px;
  margin-left: auto;
}

.cs-card-name {
  font-size: 11px; color: #888; margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.cs-card-reason {
  font-size: 12px; color: #aaa; margin-top: 4px; line-height: 1.4;
}

.cs-card-link {
  display: inline-block; margin-top: 6px;
  font-size: 11px; color: #8b5cf6; text-decoration: none; font-weight: 600;
}
.cs-card-link:hover { color: #a78bfa; }

/* Collapsed tab */
#cs-tab {
  position: fixed; right: 0; top: 50%; transform: translateY(-50%);
  z-index: 999999;
  width: 32px; height: 48px;
  background: #0a0a0f; border: 1px solid #1e1e2e;
  border-right: none; border-radius: 8px 0 0 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; cursor: pointer;
  color: #fff;
}
#cs-tab:hover { background: #1e1e2e; }
`;
