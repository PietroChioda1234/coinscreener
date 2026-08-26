/*
 * background.js — API handler
 *
 * Receives tokens from content script,
 * fetches Twitter, calls Claude, returns scores.
 */

const cache = new Map();
const pending = new Set();
const CACHE_TTL = 10 * 60_000;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "EVALUATE_TOKENS") {
    handleTokens(msg.tokens, sender.tab?.id);
  }
});

async function handleTokens(tokens, tabId) {
  if (!tabId) return;
  const { apiKey, enabled } = await getSettings();
  if (!enabled || !apiKey) return;

  for (const token of tokens) {
    const addr = token.address;
    if (!addr) continue;

    const cached = cache.get(addr);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      send(tabId, addr, token, cached);
      continue;
    }

    if (pending.has(addr)) continue;
    pending.add(addr);

    evaluate(token, apiKey)
      .then(result => {
        cache.set(addr, { ...result, ts: Date.now() });
        send(tabId, addr, token, result);
      })
      .catch(err => {
        send(tabId, addr, token, { score: -1, verdict: "error", reason: err.message });
      })
      .finally(() => pending.delete(addr));

    await new Promise(r => setTimeout(r, 400));
  }
}

async function evaluate(token, apiKey) {
  // Get Twitter URL — content script may have already found one
  let twitterUrl = token.twitterUrl || null;

  // Fallback: DexScreener API for socials
  if (!twitterUrl) {
    try {
      const chainMap = { solana:"solana", bsc:"bsc", ethereum:"ethereum", base:"base" };
      const c = chainMap[token.chain];
      if (c) {
        const r = await fetch(`https://api.dexscreener.com/tokens/v1/${c}/${token.address}`);
        if (r.ok) {
          const d = await r.json();
          if (Array.isArray(d) && d[0]?.info?.socials) {
            const tw = d[0].info.socials.find(s => s.type === "twitter" || s.url?.includes("x.com"));
            if (tw) twitterUrl = tw.url;
          }
        }
      }
    } catch {}
  }

  // Fetch Twitter content
  let twitter = null;
  if (twitterUrl) {
    let handle = twitterUrl.replace(/https?:\/\//, "").replace("www.", "")
      .replace("twitter.com/", "").replace("x.com/", "")
      .split("/")[0].split("?")[0];
    if (handle) {
      try {
        const r = await fetch(`https://x.com/${handle}`, {
          headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
        });
        if (r.ok) {
          const html = await r.text();
          const parts = [];
          const desc = html.match(/meta\s+(?:name|property)="(?:og:)?description"\s+content="([^"]*)"/i);
          if (desc) parts.push("Bio: " + desc[1]);
          const title = html.match(/<title>([^<]*)<\/title>/i);
          if (title) parts.push("Title: " + title[1]);
          twitter = { handle, content: parts.join("\n").slice(0, 1500) || null };
        } else {
          twitter = { handle, content: null };
        }
      } catch {
        twitter = { handle: handle, content: null };
      }
    }
  }

  // Claude evaluation
  const prompt = `You are a meme coin analyst. Quick evaluation:

TOKEN: ${token.symbol || "?"} — "${token.name || "?"}" (${token.chain || "?"})

${twitter?.content ? `TWITTER @${twitter.handle}:\n${twitter.content}` : twitter?.handle ? `TWITTER: @${twitter.handle} (couldn't load)` : "NO TWITTER"}

Score 0-100:
- MEME QUALITY: Funny/original/shareable concept?
- LEGITIMACY: Real socials or bot-generated?
- RED FLAGS: Copycat, pump scheme, fake engagement?

Respond ONLY with JSON: {"score":<0-100>,"verdict":"<gem|interesting|meh|skip|scam>","reason":"<one sentence>"}`;

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

  if (!r.ok) throw new Error(`API ${r.status}`);
  const data = await r.json();
  const text = data.content?.[0]?.text || "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Bad response");
  const result = JSON.parse(m[0]);

  return {
    score: Math.max(0, Math.min(100, result.score || 0)),
    verdict: result.verdict || "unknown",
    reason: result.reason || "",
  };
}

function send(tabId, address, token, result) {
  chrome.tabs.sendMessage(tabId, {
    type: "TOKEN_RESULT", address,
    chain: token.chain, name: token.name, symbol: token.symbol,
    ...result,
  });
}

function getSettings() {
  return new Promise(r => chrome.storage.local.get({ apiKey: "", enabled: true, scanInterval: 5 }, r));
}
