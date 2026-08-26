/*
 * background.js — the brain
 *
 * Receives token addresses from the content script,
 * fetches social links + Twitter content,
 * calls Claude to evaluate meme quality,
 * sends scores back to content script.
 */

// ── Cache to avoid re-evaluating the same token ─────────────
// key: tokenAddress, value: { score, verdict, reason, timestamp }
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Track in-flight evaluations to avoid duplicate calls
const pending = new Set();


// ── Listen for messages from content script ─────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "EVALUATE_TOKENS") {
    handleEvaluateTokens(msg.tokens, sender.tab?.id);
    return false; // async — we'll send results via separate messages
  }

  if (msg.type === "GET_SETTINGS") {
    chrome.storage.local.get(["apiKey", "enabled", "scanInterval"], (data) => {
      sendResponse(data);
    });
    return true; // keep channel open for async response
  }
});


// ── Main evaluation pipeline ────────────────────────────────

async function handleEvaluateTokens(tokens, tabId) {
  if (!tabId) return;

  const settings = await getSettings();
  if (!settings.enabled || !settings.apiKey) return;

  for (const token of tokens) {
    const addr = token.address;
    if (!addr) continue;

    // Check cache
    const cached = cache.get(addr);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      sendResult(tabId, addr, cached);
      continue;
    }

    // Skip if already being evaluated
    if (pending.has(addr)) continue;
    pending.add(addr);

    // Run evaluation (don't await — let them run in parallel, but throttled)
    evaluateToken(token, settings.apiKey)
      .then((result) => {
        cache.set(addr, { ...result, timestamp: Date.now() });
        sendResult(tabId, addr, result);
      })
      .catch((err) => {
        console.warn(`[CoinScreener] Error evaluating ${token.symbol}:`, err.message);
        sendResult(tabId, addr, { score: -1, verdict: "error", reason: err.message });
      })
      .finally(() => {
        pending.delete(addr);
      });

    // Small delay between evaluations to avoid hammering APIs
    await sleep(300);
  }
}


async function evaluateToken(token, apiKey) {
  // Step 1: Get social links from DexScreener API
  const socials = await fetchTokenSocials(token.chain, token.address);

  // Step 2: Find Twitter/X link
  const twitterUrl = socials.find(
    (s) => s.type === "twitter" || s.url?.includes("x.com") || s.url?.includes("twitter.com")
  )?.url;

  // If no Twitter, we can still do a basic eval on name/symbol
  let twitterContent = null;
  if (twitterUrl) {
    twitterContent = await fetchTwitterContent(twitterUrl);
  }

  // Step 3: Call Claude to evaluate
  const evaluation = await callClaude(token, twitterContent, socials, apiKey);

  return evaluation;
}


// ── DexScreener API ─────────────────────────────────────────

async function fetchTokenSocials(chain, address) {
  try {
    const resp = await fetch(
      `https://api.dexscreener.com/tokens/v1/${chain}/${address}`
    );
    if (!resp.ok) return [];

    const data = await resp.json();
    if (!Array.isArray(data) || !data.length) return [];

    // The first pair usually has the best data
    const pair = data[0];
    const info = pair.info || {};

    return [
      ...(info.socials || []),
      ...(info.websites || []).map((w) => ({ type: "website", url: w.url })),
    ];
  } catch {
    return [];
  }
}


// ── Twitter/X content fetching ──────────────────────────────

async function fetchTwitterContent(url) {
  // Normalize URL
  let handle = url
    .replace("https://", "")
    .replace("http://", "")
    .replace("www.", "")
    .replace("twitter.com/", "")
    .replace("x.com/", "")
    .split("/")[0]
    .split("?")[0];

  if (!handle) return null;

  // Try fetching the X/Twitter page directly
  // Chrome extension background scripts can bypass CORS via host_permissions
  try {
    const resp = await fetch(`https://x.com/${handle}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html",
      },
    });

    if (!resp.ok) return null;

    const html = await resp.text();

    // Extract useful text from the page (bio, pinned tweet, etc.)
    // We just grab text content — the LLM can make sense of messy HTML
    const textContent = extractTextFromHTML(html);

    return {
      handle,
      url: `https://x.com/${handle}`,
      content: textContent.slice(0, 2000), // keep it short for the LLM
    };
  } catch {
    // X might block — that's OK, we proceed without it
    return { handle, url: `https://x.com/${handle}`, content: null };
  }
}


function extractTextFromHTML(html) {
  // Quick and dirty — pull text from meta tags and visible content
  const parts = [];

  // Get meta description (usually the bio)
  const descMatch = html.match(
    /meta\s+(?:name|property)="(?:og:)?description"\s+content="([^"]*)"/i
  );
  if (descMatch) parts.push("Bio: " + descMatch[1]);

  // Get title
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  if (titleMatch) parts.push("Title: " + titleMatch[1]);

  // Get any og:image alt text
  const imgMatch = html.match(
    /meta\s+property="og:title"\s+content="([^"]*)"/i
  );
  if (imgMatch) parts.push("Profile: " + imgMatch[1]);

  // Pull tweet-like content from data attributes or JSON-LD
  const jsonLdMatch = html.match(
    /<script type="application\/ld\+json">([^<]+)<\/script>/i
  );
  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch[1]);
      if (ld.description) parts.push("Page description: " + ld.description);
    } catch {}
  }

  return parts.join("\n") || "Could not extract content";
}


// ── Claude API call ─────────────────────────────────────────

async function callClaude(token, twitterContent, socials, apiKey) {
  const hasSocials = socials.length > 0;
  const hasTwitter = twitterContent?.content;
  const socialList = socials.map((s) => `${s.type}: ${s.url}`).join("\n");

  const prompt = `You are a meme coin analyst. Evaluate this token as a potential early meme coin buy.

TOKEN INFO:
- Name: ${token.name || "?"}
- Symbol: ${token.symbol || "?"}
- Chain: ${token.chain || "?"}

${hasSocials ? `SOCIAL LINKS:\n${socialList}` : "NO SOCIAL LINKS FOUND (red flag)"}

${hasTwitter ? `TWITTER/X CONTENT (@${twitterContent.handle}):\n${twitterContent.content}` : twitterContent?.handle ? `TWITTER: @${twitterContent.handle} (could not load content)` : "NO TWITTER FOUND"}

Evaluate on these criteria:
1. MEME QUALITY: Is the name/concept funny, original, culturally relevant, or shareable? Would people meme this?
2. LEGITIMACY: Do the socials look real? Is there a community? Or does it look bot-generated / scammy?
3. RED FLAGS: Any signs of pump-and-dump, fake engagement, or copycat project?

Respond in EXACTLY this JSON format, nothing else:
{"score": <0-100>, "verdict": "<gem|interesting|meh|skip|scam>", "reason": "<one sentence why>"}

Score guide: 80+ = strong meme with real community, 60-79 = interesting/worth watching, 40-59 = mid/unclear, 20-39 = weak or suspicious, 0-19 = likely scam or dead.`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Claude API ${resp.status}: ${err.slice(0, 100)}`);
    }

    const data = await resp.json();
    const text = data.content?.[0]?.text || "";

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const result = JSON.parse(jsonMatch[0]);
    return {
      score: Math.max(0, Math.min(100, result.score || 0)),
      verdict: result.verdict || "unknown",
      reason: result.reason || "No reason given",
    };
  } catch (err) {
    throw new Error(`Claude: ${err.message}`);
  }
}


// ── Helpers ─────────────────────────────────────────────────

function sendResult(tabId, address, result) {
  chrome.tabs.sendMessage(tabId, {
    type: "TOKEN_RESULT",
    address,
    ...result,
  });
}

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      { apiKey: "", enabled: true, scanInterval: 5 },
      resolve
    );
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
