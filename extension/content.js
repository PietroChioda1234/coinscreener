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
.cs-fbtn.on-tracked { background: #3b82f618; border-color: #3b82f644; color: #60a5fa; }
#cs-tracked {
  flex: 1; overflow-y: auto; padding: 6px;
  scrollbar-width: thin; scrollbar-color: #333 transparent;
}
.cs-tracked-card {
  padding: 10px 12px; border-radius: 8px; margin-bottom: 4px;
  border: 1px solid #1e1e2e;
}
.cs-tracked-top { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.cs-tracked-sym { font-weight: 800; font-size: 14px; color: #fff; }
.cs-tracked-time { font-size: 10px; color: #555; margin-left: auto; }
.cs-tracked-prices { display: flex; gap: 12px; font-size: 12px; margin-top: 4px; }
.cs-tracked-prices span { color: #888; }
.cs-tracked-pnl {
  font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 14px;
  margin-top: 4px;
}
.cs-tracked-empty { padding: 30px 20px; text-align: center; color: #555; font-size: 12px; line-height: 1.6; }
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
        <button class="cs-fbtn" data-level="tracked">📊 TRACKED</button>
      </div>
      <div id="cs-feed"></div>
      <div id="cs-tracked" style="display:none"></div>
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

      const feed = document.getElementById("cs-feed");
      const tracked = document.getElementById("cs-tracked");

      if (filterLevel === "tracked") {
        // Show tracked view, hide feed
        if (feed) feed.style.display = "none";
        if (tracked) tracked.style.display = "block";
        chrome.runtime.sendMessage({ type: "GET_TRACKED" });
        setStatus("Loading tracked prices…", "waiting");
      } else {
        // Show feed, hide tracked
        if (feed) feed.style.display = "block";
        if (tracked) tracked.style.display = "none";
        applyFilter();
      }
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
  if (hasT) {
    const handle = token.twitterHandle ? `@${token.twitterHandle}` : "Twitter";
    hasHtml += `<a href="${esc(token.twitter)}" target="_blank">𝕏 ${esc(handle)}</a>`;
  }
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
    ${token.topHolders !== null || token.bundlePct !== null || token.holders !== null ? `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:4px 0;font-size:11px">
      ${token.holders !== null ? `<span style="color:#888">👥 ${token.holders}</span>` : ''}
      ${token.topHolders !== null ? `<span style="color:${token.topHolders > 20 ? '#f87171' : token.topHolders > 10 ? '#facc15' : '#4ade80'}">⭐ Top ${token.topHolders}%</span>` : ''}
      ${token.bundlePct !== null ? `<span style="color:${token.bundlePct > 15 ? '#f87171' : token.bundlePct > 5 ? '#facc15' : '#4ade80'}">📦 Bndl ${token.bundlePct}%</span>` : ''}
      ${token.insiderPct !== null ? `<span style="color:${token.insiderPct > 5 ? '#f87171' : token.insiderPct > 0 ? '#facc15' : '#4ade80'}">🐭 Ins ${token.insiderPct}%</span>` : ''}
      ${token.sniperPct !== null ? `<span style="color:${token.sniperPct > 10 ? '#f87171' : '#888'}">🎯 Snp ${token.sniperPct}%</span>` : ''}
    </div>` : ''}
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
    // Must have Twitter + at least one more social
    const socials = [token.twitter, token.telegram, token.website].filter(Boolean).length;
    if (!token.twitter || socials < 2) return false;
    // Rug check must NOT be Danger
    if (token.rugStatus === "Danger") return false;
    // On-chain red flags
    if (token.topHolders !== null && token.topHolders > 25) return false;   // top holders too concentrated
    if (token.insiderPct !== null && token.insiderPct > 10) return false;   // too many insiders
    if (token.bundlePct !== null && token.bundlePct > 20) return false;     // too many bundle buys
    return true;
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

    // Deduplicate: if same twitter handle + symbol exists, remove the old one
    if (t.twitterHandle && t.symbol) {
      const dupeKey = `${t.twitterHandle.toLowerCase()}_${t.symbol.toLowerCase()}`;
      for (const [oldAddr, existing] of found) {
        if (existing.twitterHandle && existing.symbol) {
          const existingKey = `${existing.twitterHandle.toLowerCase()}_${existing.symbol.toLowerCase()}`;
          if (existingKey === dupeKey) {
            // Remove old card from DOM and map
            const oldCard = document.querySelector(`.cs-card[data-address="${oldAddr}"]`);
            if (oldCard) oldCard.remove();
            found.delete(oldAddr);
            break;
          }
        }
      }
    }

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
  const tokens = [];

  // GMGN uses data-testid="trench-token-card" on each card
  const cards = document.querySelectorAll('[data-testid="trench-token-card"]');

  for (const card of cards) {
    // 1. Get token address from the card's own href="/sol/token/ADDRESS"
    const cardHref = card.getAttribute("href") || "";
    const addrMatch = cardHref.match(/\/(sol|bsc|eth|base|tron|monad)\/token\/([A-Za-z0-9]{20,})/);
    if (!addrMatch) continue;

    const chainMap = { sol:"solana", bsc:"bsc", eth:"ethereum", base:"base", tron:"tron", monad:"monad" };
    const chain = chainMap[addrMatch[1]] || addrMatch[1];
    const address = addrMatch[2];

    // Skip duplicates
    if (tokens.find(t => t.address === address)) continue;

    // 2. Get name/symbol from text inside the card
    //    Symbol is in a <span> with font-medium text-[16px], name is in a div after it
    let symbol = "?", name = "?";
    const symEl = card.querySelector('[data-sentry-component="TokenBaseInfo"] span.font-medium');
    if (symEl) symbol = symEl.textContent.trim();
    const nameEl = card.querySelector('[data-sentry-component="TokenBaseInfo"] .text-text-300');
    if (nameEl) name = nameEl.textContent.trim();

    // Fallback: grab from text content
    if (symbol === "?") {
      const m = card.textContent.match(/\b([A-Z][A-Z0-9$]{1,9})\b/);
      if (m) symbol = m[1];
    }

    // 3. Twitter — look for x.com links (INCLUDING /status/ links — that's what GMGN uses)
    //    Also grab the @handle text if visible
    let twitter = null;
    let twitterHandle = null;
    for (const a of card.querySelectorAll('a[href*="x.com/"], a[href*="twitter.com/"]')) {
      const h = a.getAttribute("href") || "";
      if (h.includes("x.com/") || h.includes("twitter.com/")) {
        twitter = h;
        // Extract handle: x.com/HANDLE or x.com/HANDLE/status/...
        const handleMatch = h.match(/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]+)/);
        if (handleMatch) twitterHandle = handleMatch[1];
        break;
      }
    }
    // Also check for @handle text
    if (!twitterHandle) {
      const handleText = card.textContent.match(/@([A-Za-z0-9_]{2,20})/);
      if (handleText) twitterHandle = handleText[1];
    }

    // 4. Telegram
    let telegram = null;
    const tgLink = card.querySelector('a[href*="t.me/"], a[href*="telegram.me/"]');
    if (tgLink) telegram = tgLink.getAttribute("href");

    // 5. Website — look for the website icon's parent link
    let website = null;
    const webIcon = card.querySelector('[data-icon="IconWebsite16pxRegular"]');
    if (webIcon) {
      const webLink = webIcon.closest('a[href]');
      if (webLink) {
        const wh = webLink.getAttribute("href") || "";
        // Only count it as a website if it's NOT just another x.com link
        if (wh.startsWith("http") && !wh.includes("x.com") && !wh.includes("twitter.com")) {
          website = wh;
        }
      }
    }

    // 6. Pump.fun link
    let pumpUrl = null;
    const pumpLink = card.querySelector('a[href*="pump.fun/coin/"]');
    if (pumpLink) pumpUrl = pumpLink.getAttribute("href");

    // 7. Scrape market cap and volume from card text
    let mcap = 0, volume = 0;
    const cardText = card.textContent || "";
    const mcMatch = cardText.match(/MC\s*\$([0-9.]+)\s*(K|M|B)?/i);
    if (mcMatch) {
      mcap = parseFloat(mcMatch[1]) * (mcMatch[2] === 'B' ? 1e9 : mcMatch[2] === 'M' ? 1e6 : mcMatch[2] === 'K' ? 1e3 : 1);
    }
    const volMatch = cardText.match(/\bV\s*\$([0-9.]+)\s*(K|M|B)?/i);
    if (volMatch) {
      volume = parseFloat(volMatch[1]) * (volMatch[2] === 'B' ? 1e9 : volMatch[2] === 'M' ? 1e6 : volMatch[2] === 'K' ? 1e3 : 1);
    }

    // 8. Scrape on-chain stats from GMGN card icons
    //    Each stat has an SVG icon followed by a value in a nearby span
    let topHolders = null, bundlePct = null, insiderPct = null, holders = null, sniperPct = null;

    // Helper: find the number text near an icon
    function statNear(iconName) {
      const icon = card.querySelector(`[data-icon="${iconName}"]`);
      if (!icon) return null;
      // Walk up to parent container, grab text
      const container = icon.closest('[class*="flex"]') || icon.parentElement;
      if (!container) return null;
      const text = container.textContent || "";
      const m = text.match(/([0-9.]+)\s*%?/);
      return m ? parseFloat(m[1]) : null;
    }

    topHolders = statNear("IconTopholder16pxRegular");
    bundlePct = statNear("IconBundle16pxRegular");
    insiderPct = statNear("IconMouselab16pxRegular");
    sniperPct = statNear("IconRaysniper16pxRegular");

    // Holder count (no %, just a number)
    const holderIcon = card.querySelector('[data-icon="IconHolders16pxRegular"]');
    if (holderIcon) {
      const hContainer = holderIcon.closest('[class*="flex"]') || holderIcon.parentElement;
      if (hContainer) {
        const hm = hContainer.textContent.match(/(\d+)/);
        if (hm) holders = parseInt(hm[1]);
      }
    }

    tokens.push({
      chain, address, name, symbol, twitter, twitterHandle, telegram, website, pumpUrl,
      mcap, volume, topHolders, bundlePct, insiderPct, holders, sniperPct,
    });
  }

  // Fallback: if no cards found with data-testid, try sequential link scanning
  if (tokens.length === 0) {
    return scrapeGMGNFallback();
  }

  return tokens;
}

function scrapeGMGNFallback() {
  // Sequential scan as backup
  const allLinks = [...document.querySelectorAll('a[href]')];
  const tokens = [];
  let current = null;

  for (const link of allLinks) {
    const href = link.getAttribute("href") || "";

    const pumpMatch = href.match(/pump\.fun\/coin\/([A-Za-z0-9]{20,})/);
    const gmgnMatch = href.match(/\/(sol|bsc|eth|base|tron|monad)\/token\/([A-Za-z0-9]{20,})/);

    if (pumpMatch || gmgnMatch) {
      if (current && !tokens.find(t => t.address === current.address)) tokens.push(current);
      const address = pumpMatch ? pumpMatch[1] : gmgnMatch[2];
      const chain = pumpMatch ? "solana" : ({ sol:"solana", bsc:"bsc", eth:"ethereum", base:"base" }[gmgnMatch[1]] || gmgnMatch[1]);
      current = { chain, address, name: "?", symbol: "?", twitter: null, telegram: null, website: null, pumpUrl: pumpMatch ? href : null };
      continue;
    }

    if (!current) continue;
    // Accept ALL x.com links including /status/ — that's what GMGN uses
    if (!current.twitter && (href.includes("x.com/") || href.includes("twitter.com/"))) current.twitter = href;
    if (!current.telegram && (href.includes("t.me/") || href.includes("telegram.me/"))) current.telegram = href;
    if (!current.website && href.startsWith("http") &&
        !href.includes("pump.fun") && !href.includes("gmgn.ai") && !href.includes("x.com") &&
        !href.includes("twitter.com") && !href.includes("t.me") && !href.includes("telegram.") &&
        !href.includes("lens.google") && !href.includes("nitter")) {
      current.website = href;
    }
  }
  if (current && !tokens.find(t => t.address === current.address)) tokens.push(current);
  return tokens;
}

function scrapeDexScreener() {
  // DexScreener: same sequential approach
  const allLinks = [...document.querySelectorAll('a[href]')];
  const tokens = [];
  let current = null;

  for (const link of allLinks) {
    const href = link.getAttribute("href") || "";
    const m = href.match(/^\/(solana|ethereum|base|bsc|arbitrum|polygon|optimism|sui)\/([A-Za-z0-9]{20,})/);
    if (m) {
      if (current && !tokens.find(t => t.address === current.address)) tokens.push(current);
      const { name, symbol } = extractInfo(link.parentElement?.parentElement || link);
      current = { chain: m[1], address: m[2], name, symbol, twitter: null, telegram: null, website: null };
      continue;
    }
    if (!current) continue;
    if (!current.twitter && (href.includes("x.com/") || href.includes("twitter.com/")) && !href.includes("/status/")) current.twitter = href;
    if (!current.telegram && (href.includes("t.me/") || href.includes("telegram.me/"))) current.telegram = href;
    if (!current.website && href.startsWith("http") &&
        !href.includes("dexscreener") && !href.includes("x.com") && !href.includes("twitter.com") &&
        !href.includes("t.me") && !href.includes("telegram.") && !href.includes("lens.google")) {
      current.website = href;
    }
  }
  if (current && !tokens.find(t => t.address === current.address)) tokens.push(current);
  return tokens;
}

function extractInfo(el) {
  const text = el?.textContent || "";
  const symMatch = text.match(/\$?([A-Z][A-Z0-9$]{1,9})\b/);
  const parts = text.split(/[\n\t/|·]+/).map(s => s.trim()).filter(s => s.length >= 2 && s.length <= 30);
  const name = parts.find(p => !/^[A-Z0-9$]+$/.test(p) && !/^\d/.test(p)) || parts[0] || "?";
  return { name, symbol: symMatch ? symMatch[1] : "?" };
}


// ── Receive rug check results ───────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "RUG_RESULT") {
    updateRugBadge(msg.address, msg);
    if (filterLevel === "high") applyFilter();

    const token = found.get(msg.address);
    if (token && isSafeToTrack(token, msg.status)) {
      chrome.runtime.sendMessage({ type: "TRACK_TOKEN", token });
    }
  }
  if (msg.type === "TRACKED_DATA") {
    renderTracked(msg.tracked);
  }
});

function isSafeToTrack(token, rugStatus) {
  // Must have Twitter
  if (!token.twitter) return false;
  // Must have at least 2 socials (twitter + telegram or website)
  const socials = [token.twitter, token.telegram, token.website].filter(Boolean).length;
  if (socials < 2) return false;
  // Rug check must NOT be Danger
  if (rugStatus === "Danger") return false;
  // Rug check must have actually returned a result (not unknown/error)
  if (rugStatus === "unknown" || rugStatus === "error") return false;
  // On-chain red flags
  if (token.topHolders !== null && token.topHolders > 25) return false;
  if (token.insiderPct !== null && token.insiderPct > 10) return false;
  if (token.bundlePct !== null && token.bundlePct > 20) return false;
  return true;
}

function renderTracked(tracked) {
  const container = document.getElementById("cs-tracked");
  if (!container) return;

  if (!tracked || !tracked.length) {
    container.innerHTML = `<div class="cs-tracked-empty">
      No tokens tracked yet.<br>
      Tokens that pass the 🔴 SAFE filter get tracked automatically with price snapshots every 5 min.
    </div>`;
    setStatus("No tracked tokens", "waiting");
    return;
  }

  // Sort by most recent first
  tracked.sort((a, b) => b.trackedAt - a.trackedAt);

  let html = '';
  let wins = 0, peaked = 0, totalWithData = 0;

  for (const t of tracked) {
    const age = formatAge(Date.now() - t.trackedAt);
    const entryTime = new Date(t.trackedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const entryDate = new Date(t.trackedAt).toLocaleDateString([], { month: 'short', day: 'numeric' });
    const init = t.initialPrice || 0;
    const peak = t.peakPrice || 0;
    const cur = t.currentPrice || 0;
    const initMcap = t.initialMcap || 0;
    const curMcap = t.currentMcap || 0;
    const peakMcap = t.peakMcap || 0;
    const hasPrice = init > 0 && cur > 0;
    const hasMcap = initMcap > 0;

    // Build chart links
    const gmgnLink = `https://gmgn.ai/sol/token/${t.address}`;
    const dexLink = `https://dexscreener.com/solana/${t.address}`;
    const pumpLink = `https://pump.fun/coin/${t.address}`;
    const linksHtml = `<div style="display:flex;gap:8px;margin-top:6px">
      <a href="${gmgnLink}" target="_blank" style="font-size:11px;color:#8b5cf6;text-decoration:none;font-weight:600">GMGN →</a>
      <a href="${dexLink}" target="_blank" style="font-size:11px;color:#8b5cf6;text-decoration:none;font-weight:600">DexScreener →</a>
      <a href="${pumpLink}" target="_blank" style="font-size:11px;color:#8b5cf6;text-decoration:none;font-weight:600">Pump →</a>
    </div>`;

    // If we have nothing at all, show minimal card
    if (!hasPrice && !hasMcap) {
      html += `
        <div class="cs-tracked-card" style="opacity:0.5">
          <div class="cs-tracked-top">
            <span class="cs-tracked-sym">${esc(t.symbol)}</span>
            <span style="font-size:11px;color:#888">${esc(t.twitterHandle ? '@' + t.twitterHandle : '')}</span>
            <span class="cs-tracked-time">${entryDate} ${entryTime}</span>
          </div>
          <div style="font-size:11px;color:#555;margin-top:4px">Waiting for price data… (${age} ago)</div>
          ${linksHtml}
        </div>
      `;
      continue;
    }

    // Calculate percentages
    const pnlNow = hasPrice ? ((cur - init) / init) * 100 : null;
    const pnlPeak = init > 0 && peak > 0 ? ((peak - init) / init) * 100 : null;
    const drawdown = peak > 0 && cur > 0 ? ((cur - peak) / peak) * 100 : null;
    const mcapChange = initMcap > 0 && curMcap > 0 ? ((curMcap - initMcap) / initMcap) * 100 : null;
    const timeToPeak = t.peakTime && t.trackedAt ? formatAge(t.peakTime - t.trackedAt) : "—";

    // Use price PnL if available, otherwise mcap change
    const mainPnl = pnlNow !== null ? pnlNow : mcapChange;
    const mainPeakPnl = pnlPeak !== null ? pnlPeak : (initMcap > 0 && peakMcap > 0 ? ((peakMcap - initMcap) / initMcap) * 100 : null);

    // Trajectory label
    let trajectory = "", trajColor = "#555";
    if (mainPnl !== null) {
      totalWithData++;
      if (mainPnl >= 5) { trajectory = "📈 Up"; trajColor = "#4ade80"; wins++; }
      else if (mainPnl <= -5 && mainPeakPnl > 20) { trajectory = "🎢 Pumped & dumped"; trajColor = "#f97316"; peaked++; }
      else if (mainPnl <= -5) { trajectory = "📉 Down"; trajColor = "#f87171"; }
      else if (mainPeakPnl > 20 && drawdown < -10) { trajectory = "⚡ Peaked, pulling back"; trajColor = "#eab308"; peaked++; }
      else { trajectory = "➡️ Flat"; trajColor = "#888"; }
    }

    const pnlColor = mainPnl === null ? "#555" : mainPnl >= 0 ? "#4ade80" : "#f87171";
    const peakColor = mainPeakPnl === null ? "#555" : mainPeakPnl >= 0 ? "#4ade80" : "#f87171";
    const snapCount = t.snapshots?.length || 0;

    const fmtPnl = (v) => v === null ? "" : ` (${v >= 0 ? "+" : ""}${v.toFixed(0)}%)`;

    html += `
      <div class="cs-tracked-card">
        <div class="cs-tracked-top">
          <span class="cs-tracked-sym">${esc(t.symbol)}</span>
          <span style="font-size:11px;color:#888">${esc(t.twitterHandle ? '@' + t.twitterHandle : '')}</span>
          <span class="cs-tracked-time">${entryDate} ${entryTime}</span>
        </div>
        <div style="font-size:12px;color:${trajColor};font-weight:600;margin:4px 0">${trajectory} <span style="color:#555;font-weight:400;font-size:10px">${age} ago</span></div>
        <div class="cs-tracked-prices">
          <span>Entry: ${hasPrice ? fmtPrice(init) : ''} ${hasMcap ? 'MC ' + fmtUsd(initMcap) : ''}</span>
        </div>
        <div class="cs-tracked-prices">
          <span style="color:${peakColor}">Peak: ${hasPrice ? fmtPrice(peak) : ''} ${peakMcap ? 'MC ' + fmtUsd(peakMcap) : ''}${fmtPnl(mainPeakPnl)}</span>
          <span style="color:#555">at ${timeToPeak}</span>
        </div>
        <div class="cs-tracked-prices">
          <span style="color:${pnlColor}">Now: ${hasPrice ? fmtPrice(cur) : ''} ${curMcap ? 'MC ' + fmtUsd(curMcap) : ''}${fmtPnl(mainPnl)}</span>
        </div>
        <div style="font-size:10px;color:#444;margin-top:4px">
          ${t.mae && t.mae < -1 ? `<span style="color:#f97316">MAE: ${t.mae.toFixed(0)}% from entry</span> · ` : ''}${t.maxDrawdown && t.maxDrawdown < -1 ? `<span style="color:#f87171">Max DD: ${t.maxDrawdown.toFixed(0)}% from peak</span> · ` : ''}${snapCount} snapshots
        </div>
        ${linksHtml}
      </div>
    `;
  }

  container.innerHTML = html + `
    <button id="cs-clear-tracked" style="
      width:100%; margin-top:12px; padding:10px; border-radius:8px;
      border:1px solid #dc262644; background:#dc262618; color:#f87171;
      font-size:12px; font-weight:600; cursor:pointer;
    ">🗑 Clear all tracked data</button>
    <button id="cs-clear-everything" style="
      width:100%; margin-top:6px; padding:10px; border-radius:8px;
      border:1px solid #55555544; background:#55555518; color:#888;
      font-size:11px; font-weight:600; cursor:pointer;
    ">🧹 Clear everything (feed + tracked)</button>
  `;

  document.getElementById("cs-clear-tracked").onclick = () => {
    chrome.storage.local.remove("tracked", () => {
      renderTracked([]);
      setStatus("Tracked data cleared", "waiting");
    });
  };

  document.getElementById("cs-clear-everything").onclick = () => {
    // Clear tracked storage
    chrome.storage.local.remove("tracked");
    // Clear sidebar feed
    found.clear();
    const feed = document.getElementById("cs-feed");
    if (feed) feed.innerHTML = "";
    // Clear tracked view
    renderTracked([]);
    updateCount();
    setStatus("Everything cleared — start fresh", "waiting");
  };

  setStatus(`${tracked.length} tracked · ${wins} up · ${peaked} pumped&dumped · ${totalWithData - wins - peaked} other`, "active");
}

function formatAge(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h";
  return Math.floor(h / 24) + "d";
}

function fmtPrice(v) {
  if (!v) return "—";
  if (v >= 1) return "$" + v.toFixed(2);
  if (v >= 0.001) return "$" + v.toFixed(4);
  if (v >= 0.0000001) return "$" + v.toFixed(8);
  return "$" + v.toExponential(2);
}

function fmtUsd(v) {
  if (!v) return "—";
  if (v >= 1e6) return "$" + (v/1e6).toFixed(1) + "M";
  if (v >= 1e3) return "$" + (v/1e3).toFixed(1) + "K";
  return "$" + v.toFixed(0);
}


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
