/*
 * content.js — sidebar + scraper
 * v0.6 — cleaner cards, rug check, 3 filter levels
 */

const SITE = location.hostname.includes("gmgn") ? "gmgn" : "dexscreener";
const found = new Map();
let scanCount = 0;
let filterLevel = "easy";

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
#cs-drag:hover { background: #8b5cf622; }
#cs-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; border-bottom: 1px solid #1e1e2e; flex-shrink: 0;
}
#cs-title { font-weight: 800; font-size: 14px; }
#cs-head-right { display: flex; align-items: center; gap: 8px; }
#cs-count {
  background: #8b5cf6; color: #fff; font-size: 11px; font-weight: 700;
  padding: 1px 7px; border-radius: 10px;
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
#cs-saved { color: #22c55e; font-size: 12px; font-weight: 600; }
#cs-filters {
  display: flex; gap: 4px; padding: 8px 14px;
  border-bottom: 1px solid #1e1e2e; flex-shrink: 0;
}
.cs-fbtn {
  flex: 1; padding: 6px 0; border-radius: 6px; border: 1px solid #1e1e2e;
  background: transparent; color: #888; font-size: 11px; font-weight: 700;
  cursor: pointer; text-align: center; transition: all .15s;
}
.cs-fbtn:hover { border-color: #333; color: #ccc; }
.cs-fbtn.on-easy { background: #22c55e18; border-color: #22c55e44; color: #4ade80; }
.cs-fbtn.on-medium { background: #eab30818; border-color: #eab30844; color: #facc15; }
.cs-fbtn.on-high { background: #ef444418; border-color: #ef444444; color: #f87171; }
#cs-feed {
  flex: 1; overflow-y: auto; padding: 6px;
  scrollbar-width: thin; scrollbar-color: #333 transparent;
}
.cs-card {
  padding: 10px 12px; border-radius: 8px; margin-bottom: 4px;
  border: 1px solid #1e1e2e; transition: background .3s;
}
.cs-card.cs-new { background: #1e293b; }
.cs-card:hover { background: #1e1e2e; }
.cs-card-top { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.cs-card-sym { font-weight: 800; font-size: 14px; color: #fff; }
.cs-card-chain {
  font-size: 10px; font-weight: 600; color: #888;
  background: #1e1e2e; padding: 1px 5px; border-radius: 3px;
}
.cs-card-rug {
  margin-left: auto; font-size: 11px; font-weight: 700;
  padding: 2px 7px; border-radius: 4px;
}
.cs-card-name {
  font-size: 11px; color: #666; margin-bottom: 6px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cs-has { margin-bottom: 4px; }
.cs-has a {
  display: inline-block; font-size: 11px; color: #4ade80; text-decoration: none;
  font-weight: 600; margin-right: 8px; line-height: 1.6;
}
.cs-has a:hover { color: #86efac; }
.cs-missing {
  font-size: 10px; color: #444; margin-bottom: 4px; line-height: 1.6;
}
.cs-rug-risks {
  font-size: 11px; color: #f87171; margin-top: 4px; line-height: 1.5;
}
.cs-card-open {
  display: inline-block; margin-top: 4px;
  font-size: 11px; color: #8b5cf6; text-decoration: none; font-weight: 600;
}
.cs-card-open:hover { color: #a78bfa; }
.cs-hidden { display: none !important; }
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
      <div id="cs-filters">
        <button class="cs-fbtn on-easy" data-level="easy">🟢 ALL</button>
        <button class="cs-fbtn" data-level="medium">🟡 HAS 𝕏</button>
        <button class="cs-fbtn" data-level="high">🔴 SAFE</button>
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

  // Collapse/expand
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
  document.getElementById("cs-iv").oninput = () => {
    document.getElementById("cs-iv-label").textContent = ivSlider.value;
  };

  // Save
  document.getElementById("cs-save").onclick = () => {
    chrome.storage.local.set({
      apiKey: document.getElementById("cs-key").value.trim(),
      scanInterval: parseInt(ivSlider.value) || 3,
    }, () => {
      document.getElementById("cs-saved").textContent = "✓ Saved";
      setTimeout(() => { document.getElementById("cs-saved").textContent = ""; }, 2000);
    });
  };

  // Drag resize
  let dragging = false;
  document.getElementById("cs-drag").onmousedown = (e) => { dragging = true; e.preventDefault(); };
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const w = Math.max(240, Math.min(600, window.innerWidth - e.clientX));
    sidebar.style.width = w + "px";
    document.body.style.marginRight = w + "px";
  });
  document.addEventListener("mouseup", () => { dragging = false; });

  // Filter buttons
  document.querySelectorAll('.cs-fbtn').forEach(btn => {
    btn.onclick = () => {
      filterLevel = btn.dataset.level;
      document.querySelectorAll('.cs-fbtn').forEach(b => {
        b.className = "cs-fbtn" + (b.dataset.level === filterLevel ? ` on-${filterLevel}` : "");
      });
      applyFilter();
    };
  });

  document.body.style.marginRight = "320px";
  document.body.style.transition = "margin-right .2s";
}


// ── Cards ───────────────────────────────────────────────────

function addToFeed(token) {
  const feed = document.getElementById("cs-feed");
  if (!feed) return;

  const chain = token.chain || "?";
  const chainShort = { solana:"SOL", ethereum:"ETH", base:"BASE", bsc:"BSC" }[chain] || chain.slice(0,3).toUpperCase();

  const openUrl = token.pumpUrl
    || (SITE === "gmgn" ? `https://gmgn.ai/${({solana:"sol",ethereum:"eth",base:"base",bsc:"bsc"})[chain]||"sol"}/token/${token.address}` 
    : `https://dexscreener.com/${chain}/${token.address}`);

  const hasT = !!token.twitter;
  const hasTg = !!token.telegram;
  const hasW = !!token.website;

  // Build "has" links
  let hasHtml = '';
  if (hasT) hasHtml += `<a href="${esc(token.twitter)}" target="_blank">𝕏 Twitter</a>`;
  if (hasTg) hasHtml += `<a href="${esc(token.telegram)}" target="_blank">💬 Telegram</a>`;
  if (hasW) hasHtml += `<a href="${esc(token.website)}" target="_blank">🌐 Website</a>`;

  // Build "missing" text
  const missingParts = [];
  if (!hasT) missingParts.push("Twitter");
  if (!hasTg) missingParts.push("Telegram");
  if (!hasW) missingParts.push("Website");
  const missingHtml = missingParts.length ? `<div class="cs-missing">Missing: ${missingParts.join(", ")}</div>` : '';

  const card = document.createElement("div");
  card.className = "cs-card cs-new";
  card.dataset.address = token.address;

  card.innerHTML = `
    <div class="cs-card-top">
      <span class="cs-card-sym">${esc(token.symbol)}</span>
      <span class="cs-card-chain">${chainShort}</span>
      <span class="cs-card-rug" id="cs-rug-${token.address}" style="background:#333;color:#888">⏳</span>
    </div>
    <div class="cs-card-name">${esc(token.name)}</div>
    ${hasHtml ? `<div class="cs-has">${hasHtml}</div>` : ''}
    ${missingHtml}
    <div class="cs-rug-risks" id="cs-risks-${token.address}"></div>
    <a class="cs-card-open" href="${openUrl}" target="_blank">Open →</a>
    <a class="cs-card-open" href="https://rugcheck.xyz/tokens/${token.address}" target="_blank" style="margin-left:8px;color:#eab308">RugCheck →</a>
  `;

  feed.prepend(card);
  setTimeout(() => { card.classList.remove("cs-new"); }, 2000);

  if (!passesFilter(token)) card.classList.add("cs-hidden");
  updateCount();
}

function updateRugBadge(address, result) {
  const badge = document.getElementById(`cs-rug-${address}`);
  const risksEl = document.getElementById(`cs-risks-${address}`);
  if (!badge) return;

  let label, bg, color;
  if (result.status === "Good") {
    label = "✅ Good"; bg = "#16a34a33"; color = "#4ade80";
  } else if (result.status === "Warning") {
    label = "⚠️ Warn"; bg = "#ca8a0433"; color = "#facc15";
  } else if (result.status === "Danger") {
    label = "🚩 Risk"; bg = "#dc262633"; color = "#f87171";
  } else {
    label = "? Check"; bg = "#333"; color = "#888";
  }

  badge.textContent = label;
  badge.style.background = bg;
  badge.style.color = color;

  // Show risk details
  if (risksEl && result.risks && result.risks.length > 0) {
    risksEl.innerHTML = result.risks.slice(0, 4).map(r => `⚠ ${esc(r.name)}`).join('<br>');
  }

  const token = found.get(address);
  if (token) {
    token.rugStatus = result.status;
  }
}


// ── Filtering ───────────────────────────────────────────────

function passesFilter(token) {
  if (filterLevel === "easy") return true;
  if (filterLevel === "medium") return !!token.twitter;
  if (filterLevel === "high") {
    const socials = [token.twitter, token.telegram, token.website].filter(Boolean).length;
    return !!token.twitter && socials >= 2;
  }
  return true;
}

function applyFilter() {
  const feed = document.getElementById("cs-feed");
  if (!feed) return;
  for (const card of feed.querySelectorAll('.cs-card')) {
    const token = found.get(card.dataset.address);
    if (!token) continue;
    card.classList.toggle("cs-hidden", !passesFilter(token));
  }
  updateCount();
}

function updateCount() {
  const feed = document.getElementById("cs-feed");
  const el = document.getElementById("cs-count");
  if (!feed || !el) return;
  const visible = feed.querySelectorAll('.cs-card:not(.cs-hidden)').length;
  el.textContent = `${visible}/${found.size}`;
}


// ── Status ──────────────────────────────────────────────────

function setStatus(text, state = "active") {
  const dot = document.getElementById("cs-dot");
  const label = document.getElementById("cs-status-text");
  if (dot) dot.className = state;
  if (label) label.textContent = text;
}

function esc(s) { const d = document.createElement("span"); d.textContent = s || ""; return d.innerHTML; }


// ── Scraping ────────────────────────────────────────────────

function scanPage() {
  scanCount++;
  const tokens = SITE === "gmgn" ? scrapeGMGN() : scrapeDexScreener();

  const newTokens = [];
  for (const t of tokens) {
    if (found.has(t.address)) continue;
    found.set(t.address, t);
    addToFeed(t);
    newTokens.push(t);
  }

  if (newTokens.length > 0) {
    setStatus(`+${newTokens.length} new · ${found.size} total · scan #${scanCount}`, "active");
    // Send to background for rug check
    chrome.runtime.sendMessage({ type: "CHECK_TOKENS", tokens: newTokens });
  } else if (tokens.length > 0) {
    setStatus(`Watching · ${found.size} found · scan #${scanCount}`, "active");
  } else {
    setStatus(`No tokens on page · scan #${scanCount} · scroll or navigate`, "waiting");
  }
}

function scrapeGMGN() {
  const tokens = [], seen = new Set();

  document.querySelectorAll('a[href*="pump.fun/coin/"]').forEach(link => {
    const m = (link.getAttribute("href") || "").match(/pump\.fun\/coin\/([A-Za-z0-9]{20,})/);
    if (!m || seen.has(m[1])) return;
    seen.add(m[1]);
    const row = findRow(link);
    const { name, symbol } = extractInfo(row || link);
    const socials = findSocials(link);
    tokens.push({ chain: "solana", address: m[1], name, symbol, ...socials, pumpUrl: link.getAttribute("href") });
  });

  document.querySelectorAll('a[href*="/token/"]').forEach(link => {
    const m = (link.getAttribute("href") || "").match(/\/(sol|bsc|eth|base|tron|monad)\/token\/([A-Za-z0-9]{20,})/);
    if (!m || seen.has(m[2])) return;
    seen.add(m[2]);
    const row = findRow(link);
    const { name, symbol } = extractInfo(row || link);
    const socials = findSocials(link);
    const chain = { sol:"solana", bsc:"bsc", eth:"ethereum", base:"base" }[m[1]] || m[1];
    tokens.push({ chain, address: m[2], name, symbol, ...socials });
  });

  document.querySelectorAll('a[href*="raydium.io"], a[href*="letsbonk.fun"]').forEach(link => {
    const m = (link.getAttribute("href") || "").match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);
    if (!m || seen.has(m[1])) return;
    seen.add(m[1]);
    const row = findRow(link);
    const { name, symbol } = extractInfo(row || link);
    const socials = findSocials(link);
    tokens.push({ chain: "solana", address: m[1], name, symbol, ...socials });
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
    const socials = findSocials(link);
    tokens.push({ chain: m[1], address: m[2], name, symbol, ...socials });
  });
  return tokens;
}

function findRow(el) {
  let node = el;
  for (let i = 0; i < 6 && node; i++) {
    node = node.parentElement;
    if (!node) break;
    const cl = node.className || "";
    if (cl.match(/row|item|card|pair|token|list/i)) return node;
    if (node.querySelectorAll('a[href]').length >= 3) return node;
  }
  return el.parentElement?.parentElement?.parentElement || el.parentElement;
}

function extractInfo(el) {
  const text = el?.textContent || "";
  const symMatch = text.match(/\$?([A-Z][A-Z0-9$]{1,9})\b/);
  const parts = text.split(/[\n\t/|·]+/).map(s => s.trim()).filter(s => s.length >= 2 && s.length <= 30);
  const name = parts.find(p => !/^[A-Z0-9$]+$/.test(p) && !/^\d/.test(p)) || parts[0] || "?";
  return { name, symbol: symMatch ? symMatch[1] : "?" };
}

function findSocials(el) {
  const socials = { twitter: null, telegram: null, website: null };
  const container = findRow(el) || el;

  for (const a of container.querySelectorAll('a[href]')) {
    const h = a.getAttribute("href") || "";
    if (!socials.twitter && (h.includes("x.com/") || h.includes("twitter.com/")) && !h.match(/\/status\//)) {
      socials.twitter = h;
    }
    if (!socials.telegram && (h.includes("t.me/") || h.includes("telegram.me/"))) {
      socials.telegram = h;
    }
    if (!socials.website && h.startsWith("http") &&
        !h.includes("pump.fun") && !h.includes("gmgn.ai") && !h.includes("x.com") &&
        !h.includes("twitter.com") && !h.includes("t.me") && !h.includes("telegram.") &&
        !h.includes("lens.google") && !h.includes("dexscreener") &&
        !h.includes("raydium") && !h.includes("letsbonk") && !h.includes("nitter")) {
      socials.website = h;
    }
  }
  return socials;
}


// ── Receive rug check results ───────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "RUG_RESULT") {
    updateRugBadge(msg.address, msg);
  }
});


// ── Init ────────────────────────────────────────────────────

function init() {
  buildSidebar();
  setStatus(`Ready — scanning ${SITE} in 2s`, "waiting");

  chrome.storage.local.get({ apiKey: "", scanInterval: 3 }, (data) => {
    document.getElementById("cs-key").value = data.apiKey || "";
    document.getElementById("cs-iv").value = data.scanInterval || 3;
    document.getElementById("cs-iv-label").textContent = data.scanInterval || 3;

    setTimeout(() => { setStatus(`Scanning ${SITE}…`, "active"); scanPage(); }, 2000);
    setInterval(() => scanPage(), (data.scanInterval || 3) * 1000);
  });

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; setTimeout(() => scanPage(), 1500); }
  }).observe(document.body, { childList: true, subtree: true });
}

init();
