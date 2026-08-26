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
const found = new Map(); // address -> token data with socials
let scanCount = 0;
let filterLevel = "easy"; // easy | medium | high

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
#cs-filters {
  display: flex; gap: 4px; padding: 8px 14px;
  border-bottom: 1px solid #1e1e2e; flex-shrink: 0;
}
.cs-filter-btn {
  flex: 1; padding: 6px 0; border-radius: 6px; border: 1px solid #1e1e2e;
  background: transparent; color: #888; font-size: 11px; font-weight: 700;
  cursor: pointer; text-align: center; transition: all .15s;
}
.cs-filter-btn:hover { border-color: #333; color: #ccc; }
.cs-filter-btn.active-easy { background: #22c55e22; border-color: #22c55e55; color: #4ade80; }
.cs-filter-btn.active-medium { background: #eab30822; border-color: #eab30855; color: #facc15; }
.cs-filter-btn.active-high { background: #ef444422; border-color: #ef444455; color: #f87171; }
.cs-card-socials {
  display: flex; gap: 4px; margin-top: 4px;
}
.cs-social-tag {
  font-size: 10px; padding: 1px 5px; border-radius: 3px;
  background: #1e1e2e; color: #888;
}
.cs-social-tag.has { color: #4ade80; background: #22c55e18; }
.cs-hidden { display: none !important; }
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
        <button class="cs-filter-btn active-easy" data-level="easy">🟢 ALL</button>
        <button class="cs-filter-btn" data-level="medium">🟡 HAS 𝕏</button>
        <button class="cs-filter-btn" data-level="high">🔴 SAFE</button>
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

  // Filter buttons
  document.querySelectorAll('.cs-filter-btn').forEach(btn => {
    btn.onclick = () => {
      filterLevel = btn.dataset.level;
      // Update active state
      document.querySelectorAll('.cs-filter-btn').forEach(b => {
        b.className = "cs-filter-btn" + (b.dataset.level === filterLevel ? ` active-${filterLevel}` : "");
      });
      applyFilter();
    };
  });
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
  if (token.pumpUrl) {
    link = token.pumpUrl;
  } else if (SITE === "gmgn") {
    const cMap = { solana:"sol", ethereum:"eth", base:"base", bsc:"bsc" };
    link = `https://gmgn.ai/${cMap[chain] || "sol"}/token/${token.address}`;
  } else {
    link = `https://dexscreener.com/${chain}/${token.address}`;
  }

  const hasT = !!token.twitter;
  const hasTg = !!token.telegram;
  const hasW = !!token.website;
  const socialCount = [hasT, hasTg, hasW].filter(Boolean).length;

  const card = document.createElement("div");
  card.className = "cs-card cs-new";
  card.id = `cs-token-${token.address}`;
  card.dataset.address = token.address;

  card.innerHTML = `
    <div class="cs-card-top">
      <span class="cs-card-sym">${esc(token.symbol)}</span>
      <span class="cs-card-chain">${chainShort}</span>
      <span class="cs-card-score" id="cs-score-${token.address}" style="display:none"></span>
    </div>
    <div class="cs-card-name">${esc(token.name)}</div>
    <div class="cs-card-socials">
      <span class="cs-social-tag ${hasT ? 'has' : ''}">𝕏 ${hasT ? '✓' : '✗'}</span>
      <span class="cs-social-tag ${hasTg ? 'has' : ''}">TG ${hasTg ? '✓' : '✗'}</span>
      <span class="cs-social-tag ${hasW ? 'has' : ''}">Web ${hasW ? '✓' : '✗'}</span>
    </div>
    <div class="cs-card-reason" id="cs-reason-${token.address}"></div>
    <div class="cs-card-links">
      <a class="cs-card-link" href="${link}" target="_blank">Open →</a>
      ${hasT ? `<a class="cs-card-link" href="${esc(token.twitter)}" target="_blank">Twitter →</a>` : ''}
      ${hasTg ? `<a class="cs-card-link" href="${esc(token.telegram)}" target="_blank">Telegram →</a>` : ''}
      ${hasW ? `<a class="cs-card-link" href="${esc(token.website)}" target="_blank">Website →</a>` : ''}
      <a class="cs-card-link" href="https://rugcheck.xyz/tokens/${token.address}" target="_blank" style="color:#eab308">RugCheck →</a>
    </div>
  `;

  feed.prepend(card);
  setTimeout(() => { card.classList.remove("cs-new"); }, 2000);

  // Apply current filter to this card
  if (!passesFilter(token)) card.classList.add("cs-hidden");

  updateCount();
}

function passesFilter(token) {
  const hasT = !!token.twitter;
  const hasTg = !!token.telegram;
  const hasW = !!token.website;
  const socialCount = [hasT, hasTg, hasW].filter(Boolean).length;

  if (filterLevel === "easy") return true;

  if (filterLevel === "medium") {
    // Must have Twitter
    return hasT;
  }

  if (filterLevel === "high") {
    // Must have Twitter + at least one more (Telegram or Website)
    return hasT && socialCount >= 2;
  }

  return true;
}

function applyFilter() {
  const feed = document.getElementById("cs-feed");
  if (!feed) return;

  for (const card of feed.querySelectorAll('.cs-card')) {
    const addr = card.dataset.address;
    const token = found.get(addr);
    if (!token) continue;
    if (passesFilter(token)) {
      card.classList.remove("cs-hidden");
    } else {
      card.classList.add("cs-hidden");
    }
  }

  updateCount();
}

function updateCount() {
  const feed = document.getElementById("cs-feed");
  const countEl = document.getElementById("cs-count");
  if (!feed || !countEl) return;
  const visible = feed.querySelectorAll('.cs-card:not(.cs-hidden)').length;
  countEl.textContent = `${visible}/${found.size}`;
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

  // GMGN links to pump.fun/coin/ADDRESS for Solana tokens
  document.querySelectorAll('a[href*="pump.fun/coin/"]').forEach(link => {
    const m = (link.getAttribute("href") || "").match(/pump\.fun\/coin\/([A-Za-z0-9]{20,})/);
    if (!m || seen.has(m[1])) return;
    seen.add(m[1]);
    const row = findRow(link);
    const { name, symbol } = extractInfo(row || link);
    const socials = findSocials(link);
    tokens.push({ chain: "solana", address: m[1], name, symbol, ...socials, pumpUrl: link.getAttribute("href") });
  });

  // Also check for any internal GMGN token links: /sol/token/ADDR etc.
  document.querySelectorAll('a[href*="/token/"]').forEach(link => {
    const m = (link.getAttribute("href") || "").match(/\/(sol|bsc|eth|base|tron|monad)\/token\/([A-Za-z0-9]{20,})/);
    if (!m || seen.has(m[2])) return;
    seen.add(m[2]);
    const row = findRow(link);
    const { name, symbol } = extractInfo(row || link);
    const socials = findSocials(link);
    const chain = { sol:"solana", bsc:"bsc", eth:"ethereum", base:"base", tron:"tron", monad:"monad" }[m[1]] || m[1];
    tokens.push({ chain, address: m[2], name, symbol, ...socials });
  });

  // Also catch Raydium / letsbonk / other launchpad links
  document.querySelectorAll('a[href*="raydium.io"], a[href*="letsbonk.fun"]').forEach(link => {
    const href = link.getAttribute("href") || "";
    const m = href.match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);
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
    tokens.push({ chain: m[1], address: m[2], name, symbol });
  });
  return tokens;
}

function findRow(el) {
  // Walk up looking for a container — GMGN uses divs, not tables
  let node = el;
  for (let i = 0; i < 6 && node; i++) {
    node = node.parentElement;
    if (!node) break;
    // Stop at anything that looks like a row/card/item container
    const cl = node.className || "";
    if (cl.match(/row|item|card|pair|token|list/i)) return node;
    // Or if it has multiple child links (likely a row with token + socials)
    const childLinks = node.querySelectorAll('a[href]');
    if (childLinks.length >= 3) return node;
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
  if (!el) return { twitter: null, telegram: null, website: null };
  const socials = { twitter: null, telegram: null, website: null };

  // Walk up to find a good container
  const container = findRow(el) || el;
  const links = container.querySelectorAll('a[href]');

  for (const a of links) {
    const h = a.getAttribute("href") || "";
    if (!socials.twitter && (h.includes("x.com/") || h.includes("twitter.com/"))) {
      // Skip status/tweet links — we want profile links
      if (!h.match(/\/status\//)) socials.twitter = h;
      else if (!socials.twitter) socials.twitter = h; // better than nothing
    }
    if (!socials.telegram && (h.includes("t.me/") || h.includes("telegram.me/"))) {
      socials.telegram = h;
    }
    if (!socials.website && h.startsWith("http") &&
        !h.includes("pump.fun") && !h.includes("gmgn.ai") && !h.includes("x.com") &&
        !h.includes("twitter.com") && !h.includes("t.me") && !h.includes("telegram.") &&
        !h.includes("lens.google") && !h.includes("dexscreener") &&
        !h.includes("raydium") && !h.includes("letsbonk")) {
      socials.website = h;
    }
  }

  return socials;
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
