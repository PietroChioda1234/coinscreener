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
