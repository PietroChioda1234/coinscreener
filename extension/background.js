/*
 * background.js — the brain
 *
 * Receives token data from content script (GMGN or DexScreener),
 * fetches Twitter/X content, calls Claude for meme evaluation,
 * sends scores back.
 */

const cache = new Map();      // address -> { score, verdict, reason, ts }
const pending = new Set();    // addresses currently being evaluated
const CACHE_TTL = 10 * 60_000;  // 10 min cache

// ── Message handler ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "EVALUATE_TOKENS") {
    handleTokens(msg.tokens, sender.tab?.id);
    return false;
  }
  if (msg.type === "GET_SETTINGS") {
    chrome.storage.local.get({ apiKey: "", enabled: true, scanInterval: 5 }, sendResponse);
    return true;
  }
});


// ── Main pipeline ───────────────────────────────────────────

async function handleTokens(tokens, tabId) {
  if (!tabId) return;
  const { apiKey, enabled } = await getSettings();
  if (!enabled || !apiKey) return;

  for (const token of tokens) {
    const addr = token.address;
    if (!addr) continue;

    // Cache hit?
    const cached = cache.get(addr);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      send(tabId, addr, cached);
      continue;
    }

    // Already in flight?
    if (pending.has(addr)) continue;
    pending.add(addr);

    evaluate(token, apiKey)
      .then(result => {
        cache.set(addr, { ...result, ts: Date.now() });
        send(tabId, addr, result);
      })
      .catch(err => {
        console.warn(`[CS] Error on ${token.symbol}:`, err.message);
        send(tabId, addr, { score: -1, verdict: "error", reason: err.message });
      })
      .finally(() => pending.delete(addr));

    // Throttle: don't slam APIs
    await sleep(400);
  }
}


async function evaluate(token, apiKey) {
  // Step 1: If content script found a Twitter URL already, use it
  let twitterUrl = token.twitterUrl || null;

  // Step 2: If not, try DexScreener API for socials
  if (!twitterUrl) {
    const socials = await fetchSocials(token.chain, token.address);
    twitterUrl = socials.find(s =>
      s.type === "twitter" || s.url?.includes("x.com") || s.url?.includes("twitter.com")
    )?.url || null;
  }

  // Step 3: Fetch Twitter content
  let twitterData = null;
  if (twitterUrl) {
    twitterData = await fetchTwitter(twitterUrl);
  }

  // Step 4: Ask Claude
  return await askClaude(token, twitterData, apiKey);
}


// ── DexScreener socials lookup ──────────────────────────────

async function fetchSocials(chain, address) {
  // Map chain names for DexScreener API
  const chainMap = { bsc: "bsc", solana: "solana", ethereum: "ethereum", base: "base" };
  const dsChain = chainMap[chain];
  if (!dsChain) return [];

  try {
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/${dsChain}/${address}`);
    if (!r.ok) return [];
    const data = await r.json();
    if (!Array.isArray(data) || !data[0]) return [];
    const info = data[0].info || {};
    return [...(info.socials || []), ...(info.websites || []).map(w => ({ type: "website", url: w.url }))];
  } catch { return []; }
}


// ── Twitter fetching ────────────────────────────────────────

async function fetchTwitter(url) {
  let handle = url.replace(/https?:\/\//, "").replace("www.", "")
    .replace("twitter.com/", "").replace("x.com/", "")
    .split("/")[0].split("?")[0];
  if (!handle) return null;

  try {
    const r = await fetch(`https://x.com/${handle}`, {
      headers: { "Accept": "text/html", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });
    if (!r.ok) return { handle, content: null };

    const html = await r.text();
    const parts = [];

    // Pull meta description (usually bio)
    const desc = html.match(/meta\s+(?:name|property)="(?:og:)?description"\s+content="([^"]*)"/i);
    if (desc) parts.push("Bio: " + desc[1]);

    // Title
    const title = html.match(/<title>([^<]*)<\/title>/i);
    if (title) parts.push("Title: " + title[1]);

    // OG title
    const ogt = html.match(/meta\s+property="og:title"\s+content="([^"]*)"/i);
    if (ogt) parts.push("Profile: " + ogt[1]);

    return { handle, content: parts.join("\n").slice(0, 2000) || null };
  } catch {
    return { handle, content: null };
  }
}


// ── Claude API ──────────────────────────────────────────────

async function askClaude(token, twitter, apiKey) {
  const hasTwitter = twitter?.content;

  const prompt = `You are a meme coin analyst. Evaluate this token quickly.

TOKEN: ${token.symbol || "?"} — "${token.name || "?"}" on ${token.chain || "?"}

${hasTwitter
    ? `TWITTER @${twitter.handle}:\n${twitter.content}`
    : twitter?.handle
      ? `TWITTER: @${twitter.handle} (page didn't load)`
      : "NO TWITTER FOUND"}

Score 0-100 on:
1. MEME QUALITY — Is the name/concept funny, original, culturally relevant? Would people share it?
2. LEGITIMACY — Do socials look real or bot-generated?
3. RED FLAGS — Copycat? Pump scheme? Fake engagement?

Respond ONLY with this JSON, nothing else:
{"score":<0-100>,"verdict":"<gem|interesting|meh|skip|scam>","reason":"<one sentence>"}`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 150,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`API ${r.status}: ${err.slice(0, 80)}`);
  }

  const data = await r.json();
  const text = data.content?.[0]?.text || "";
  const json = text.match(/\{[\s\S]*\}/);
  if (!json) throw new Error("No JSON in response");

  const result = JSON.parse(json[0]);
  return {
    score: Math.max(0, Math.min(100, result.score || 0)),
    verdict: result.verdict || "unknown",
    reason: result.reason || "",
  };
}


// ── Helpers ─────────────────────────────────────────────────

function send(tabId, address, result) {
  chrome.tabs.sendMessage(tabId, { type: "TOKEN_RESULT", address, ...result });
}

function getSettings() {
  return new Promise(r => chrome.storage.local.get({ apiKey: "", enabled: true, scanInterval: 5 }, r));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
