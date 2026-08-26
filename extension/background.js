/*
 * background.js
 *
 * Handles RugCheck API calls for every token.
 * Optionally handles Claude AI calls if API key is set.
 */

const rugCache = new Map();    // address -> { score, risks, ts }
const aiCache = new Map();     // address -> { score, verdict, reason, ts }
const pending = new Set();
const CACHE_TTL = 10 * 60_000;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "CHECK_TOKENS") {
    checkTokens(msg.tokens, sender.tab?.id);
  }
});

async function checkTokens(tokens, tabId) {
  if (!tabId) return;

  for (const token of tokens) {
    const addr = token.address;
    if (!addr || pending.has(addr)) continue;

    // Check rug cache
    const cached = rugCache.get(addr);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      sendRug(tabId, addr, cached);
      continue;
    }

    pending.add(addr);

    fetchRugCheck(addr)
      .then(result => {
        rugCache.set(addr, { ...result, ts: Date.now() });
        sendRug(tabId, addr, result);
      })
      .catch(err => {
        sendRug(tabId, addr, { status: "error", risks: [], score: -1 });
      })
      .finally(() => pending.delete(addr));

    // Throttle — rugcheck is free but be polite
    await new Promise(r => setTimeout(r, 500));
  }
}

async function fetchRugCheck(address) {
  try {
    const r = await fetch(`https://api.rugcheck.xyz/v1/tokens/${address}/report/summary`);
    if (!r.ok) {
      // Try the full report endpoint as fallback
      const r2 = await fetch(`https://api.rugcheck.xyz/v1/tokens/${address}/report`);
      if (!r2.ok) return { status: "unknown", risks: [], score: -1 };
      const data = await r2.json();
      return parseRugReport(data);
    }
    const data = await r.json();
    return parseRugReport(data);
  } catch {
    return { status: "error", risks: [], score: -1 };
  }
}

function parseRugReport(data) {
  // RugCheck returns a score and risk array
  const score = data.score ?? data.riskScore ?? -1;
  const status = data.tokenMeta?.status
    || (score >= 0 && score <= 300 ? "Good" : score <= 600 ? "Warning" : score > 600 ? "Danger" : "Unknown");
  
  const risks = [];
  if (data.risks && Array.isArray(data.risks)) {
    for (const r of data.risks) {
      risks.push({
        name: r.name || r.type || "Unknown risk",
        level: r.level || r.severity || "unknown",
        description: r.description || "",
      });
    }
  }

  // Check specific flags
  const flags = [];
  if (data.mintAuthority || data.freezeAuthority) flags.push("mint/freeze authority");
  if (data.topHolders) {
    const topPct = data.topHolders.reduce((s, h) => s + (h.pct || 0), 0);
    if (topPct > 20) flags.push(`top holders: ${topPct.toFixed(0)}%`);
  }

  return { status, risks, flags, score, raw: data };
}

function sendRug(tabId, address, result) {
  chrome.tabs.sendMessage(tabId, {
    type: "RUG_RESULT", address,
    status: result.status,
    score: result.score,
    risks: result.risks || [],
    flags: result.flags || [],
  });
}
