import { useState, useCallback, useRef } from "react";

// ── Safety scoring (same logic as Python backend) ───────────

function scoreLiquidity(pair) {
  const liq = pair.liquidity?.usd || 0;
  const mcap = pair.marketCap || pair.fdv || 0;
  if (!mcap || !liq) return { score: 0, reason: "No data", max: 30 };
  const ratio = liq / mcap;
  if (ratio < 0.05) return { score: 0, reason: `Low (${(ratio*100).toFixed(1)}%)`, max: 30 };
  if (ratio >= 0.5) return { score: 30, reason: `Excellent (${(ratio*100).toFixed(1)}%)`, max: 30 };
  if (ratio >= 0.2) return { score: 25, reason: `Good (${(ratio*100).toFixed(1)}%)`, max: 30 };
  if (ratio >= 0.1) return { score: 18, reason: `OK (${(ratio*100).toFixed(1)}%)`, max: 30 };
  return { score: 10, reason: `Thin (${(ratio*100).toFixed(1)}%)`, max: 30 };
}

function scoreActivity(pair) {
  const buys = pair.txns?.h24?.buys || 0;
  const sells = pair.txns?.h24?.sells || 0;
  const total = buys + sells;
  if (total < 50) return { score: 0, reason: `Low (${total})`, max: 25 };
  if (total >= 1000) return { score: 25, reason: `High (${total})`, max: 25 };
  if (total >= 500) return { score: 20, reason: `Good (${total})`, max: 25 };
  if (total >= 200) return { score: 15, reason: `Moderate (${total})`, max: 25 };
  return { score: 8, reason: `Some (${total})`, max: 25 };
}

function scoreBuySell(pair) {
  const buys = pair.txns?.h24?.buys || 0;
  const sells = pair.txns?.h24?.sells || 0;
  if (!buys && !sells) return { score: 0, reason: "No txns", max: 20 };
  if (!buys) return { score: 0, reason: "No buys", max: 20 };
  const ratio = sells / buys;
  if (ratio < 0.2) return { score: 0, reason: `Suspicious (${ratio.toFixed(2)})`, max: 20 };
  if (ratio >= 0.3 && ratio <= 1.5) return { score: 20, reason: `Healthy (${ratio.toFixed(2)})`, max: 20 };
  if (ratio >= 0.2 && ratio <= 2.0) return { score: 12, reason: `OK (${ratio.toFixed(2)})`, max: 20 };
  return { score: 5, reason: `Skewed (${ratio.toFixed(2)})`, max: 20 };
}

function scoreAge(pair) {
  const created = pair.pairCreatedAt;
  if (!created) return { score: 5, reason: "Unknown", max: 15 };
  const ageH = (Date.now() - created) / 3600000;
  if (ageH < 1) return { score: 0, reason: `Too new (${ageH.toFixed(1)}h)`, max: 15 };
  if (ageH > 168) return { score: 8, reason: `${(ageH/24).toFixed(0)}d old`, max: 15 };
  if (ageH >= 2 && ageH <= 72) return { score: 15, reason: `${ageH.toFixed(0)}h — good timing`, max: 15 };
  if (ageH <= 2) return { score: 5, reason: `Very fresh (${ageH.toFixed(1)}h)`, max: 15 };
  return { score: 10, reason: `${(ageH/24).toFixed(1)}d old`, max: 15 };
}

function scoreVolLiq(pair) {
  const vol = pair.volume?.h24 || 0;
  const liq = pair.liquidity?.usd || 0;
  if (!liq) return { score: 0, reason: "No liq", max: 10 };
  const ratio = vol / liq;
  if (ratio >= 10) return { score: 5, reason: `${ratio.toFixed(1)}x — wash risk`, max: 10 };
  if (ratio >= 2) return { score: 10, reason: `${ratio.toFixed(1)}x — strong`, max: 10 };
  if (ratio >= 0.5) return { score: 7, reason: `${ratio.toFixed(1)}x — decent`, max: 10 };
  return { score: 3, reason: `${ratio.toFixed(1)}x — low`, max: 10 };
}

function analyzeSafety(pair) {
  const checks = [
    { name: "Liquidity", ...scoreLiquidity(pair) },
    { name: "Activity", ...scoreActivity(pair) },
    { name: "Buy/Sell", ...scoreBuySell(pair) },
    { name: "Age", ...scoreAge(pair) },
    { name: "Vol/Liq", ...scoreVolLiq(pair) },
  ];
  const total = checks.reduce((s, c) => s + c.score, 0);
  const passed = checks.every(c => c.score > 0);
  return { total, passed, checks };
}

// ── API calls ───────────────────────────────────────────────

const API = "https://api.dexscreener.com";

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function discoverTokens(chains, onStatus) {
  const seen = new Set();
  let allPairs = [];

  onStatus("Fetching latest profiles...");
  try {
    const profiles = await fetchJSON(`${API}/token-profiles/latest/v1`);
    if (Array.isArray(profiles)) {
      const relevant = profiles.filter(p => chains.includes(p.chainId)).slice(0, 30);
      for (const p of relevant) {
        const key = `${p.chainId}/${p.tokenAddress}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          const pairs = await fetchJSON(`${API}/tokens/v1/${key}`);
          if (Array.isArray(pairs)) allPairs.push(...pairs);
        } catch {}
      }
    }
  } catch {}

  onStatus("Fetching boosted tokens...");
  try {
    const boosted = await fetchJSON(`${API}/token-boosts/latest/v1`);
    if (Array.isArray(boosted)) {
      const relevant = boosted.filter(p => chains.includes(p.chainId)).slice(0, 20);
      for (const p of relevant) {
        const key = `${p.chainId}/${p.tokenAddress}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          const pairs = await fetchJSON(`${API}/tokens/v1/${key}`);
          if (Array.isArray(pairs)) allPairs.push(...pairs);
        } catch {}
      }
    }
  } catch {}

  onStatus("Searching meme tokens...");
  try {
    const data = await fetchJSON(`${API}/latest/dex/search?q=meme`);
    if (data?.pairs) {
      for (const p of data.pairs) {
        const addr = p.baseToken?.address;
        if (chains.includes(p.chainId) && addr && !seen.has(`${p.chainId}/${addr}`)) {
          seen.add(`${p.chainId}/${addr}`);
          allPairs.push(p);
        }
      }
    }
  } catch {}

  return allPairs;
}

// ── Formatting ──────────────────────────────────────────────

function fmtUSD(v) {
  if (!v) return "—";
  if (v >= 1e6) return `$${(v/1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v/1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtPrice(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return "—";
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.001) return `$${n.toFixed(4)}`;
  if (n >= 0.0000001) return `$${n.toFixed(8)}`;
  return `$${n.toExponential(2)}`;
}

function fmtChange(v) {
  if (v == null) return "—";
  const s = v >= 0 ? `+${v.toFixed(0)}%` : `${v.toFixed(0)}%`;
  return s;
}

const CHAIN_COLORS = {
  solana: "#9945FF", base: "#0052FF", ethereum: "#627EEA",
  bsc: "#F0B90B", arbitrum: "#28A0F0",
};

const CHAIN_LABELS = {
  solana: "SOL", base: "BASE", ethereum: "ETH",
  bsc: "BSC", arbitrum: "ARB",
};

// ── Components ──────────────────────────────────────────────

function ScoreBadge({ score, passed }) {
  const bg = !passed ? "#dc2626" : score >= 70 ? "#16a34a" : score >= 45 ? "#ca8a04" : "#dc2626";
  return (
    <span style={{
      background: bg, color: "#fff", fontWeight: 700,
      padding: "3px 10px", borderRadius: 6, fontSize: 13,
      fontFamily: "'JetBrains Mono', monospace", display: "inline-block", minWidth: 42, textAlign: "center",
    }}>
      {score}
    </span>
  );
}

function ChainTag({ chain }) {
  return (
    <span style={{
      background: (CHAIN_COLORS[chain] || "#666") + "22",
      color: CHAIN_COLORS[chain] || "#999",
      fontSize: 11, fontWeight: 600, padding: "2px 7px",
      borderRadius: 4, textTransform: "uppercase", letterSpacing: 0.5,
    }}>
      {CHAIN_LABELS[chain] || chain}
    </span>
  );
}

function SafetyBreakdown({ checks }) {
  return (
    <div style={{ display: "grid", gap: 6, padding: "12px 0 4px" }}>
      {checks.map((c, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
          <span style={{ width: 70, color: "#999", textAlign: "right", flexShrink: 0 }}>{c.name}</span>
          <div style={{
            flex: 1, maxWidth: 120, height: 6, borderRadius: 3,
            background: "var(--border-color)",
          }}>
            <div style={{
              width: `${(c.score / c.max) * 100}%`, height: "100%", borderRadius: 3,
              background: c.score === 0 ? "#dc2626" : c.score >= c.max * 0.7 ? "#16a34a" : "#ca8a04",
            }} />
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", width: 32, fontSize: 12, color: "#999" }}>
            {c.score}/{c.max}
          </span>
          <span style={{ color: c.score === 0 ? "#f87171" : "#999", fontSize: 12 }}>{c.reason}</span>
        </div>
      ))}
    </div>
  );
}

function TokenRow({ token, expanded, onToggle }) {
  const change24 = token.priceChange?.h24;
  const changeColor = change24 >= 0 ? "#4ade80" : "#f87171";

  return (
    <div style={{
      background: "var(--card-bg)", borderRadius: 10,
      border: "1px solid var(--border-color)",
      marginBottom: 8, overflow: "hidden",
    }}>
      <div
        onClick={onToggle}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(130px,2fr) 60px 80px 80px 80px 80px 60px 50px",
          alignItems: "center", gap: 8, padding: "12px 16px",
          cursor: "pointer", fontSize: 14,
        }}
      >
        <div>
          <span style={{ fontWeight: 700 }}>{token.baseToken?.symbol}</span>
          <span style={{ color: "#888", marginLeft: 6, fontSize: 12 }}>
            {token.baseToken?.name?.length > 20 ? token.baseToken.name.slice(0, 20) + "…" : token.baseToken?.name}
          </span>
        </div>
        <ChainTag chain={token.chainId} />
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, textAlign: "right" }}>
          {fmtPrice(token.priceUsd)}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, textAlign: "right" }}>
          {fmtUSD(token.marketCap || token.fdv)}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, textAlign: "right" }}>
          {fmtUSD(token.liquidity?.usd)}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, textAlign: "right" }}>
          {fmtUSD(token.volume?.h24)}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, textAlign: "right", color: changeColor }}>
          {fmtChange(change24)}
        </span>
        <div style={{ textAlign: "right" }}>
          <ScoreBadge score={token._safety.total} passed={token._safety.passed} />
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border-color)" }}>
          <SafetyBreakdown checks={token._safety.checks} />
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {token.url && (
              <a href={token.url} target="_blank" rel="noopener noreferrer" style={linkBtnStyle}>
                DexScreener ↗
              </a>
            )}
            {token.chainId === "solana" && token.baseToken?.address && (
              <a href={`https://rugcheck.xyz/tokens/${token.baseToken.address}`}
                target="_blank" rel="noopener noreferrer" style={linkBtnStyle}>
                RugCheck ↗
              </a>
            )}
            {token.baseToken?.address && (
              <a href={`https://app.bubblemaps.io/${token.chainId}/token/${token.baseToken.address}`}
                target="_blank" rel="noopener noreferrer" style={linkBtnStyle}>
                BubbleMaps ↗
              </a>
            )}
            <span style={{ fontSize: 11, color: "#666", fontFamily: "'JetBrains Mono', monospace", alignSelf: "center" }}>
              {token.baseToken?.address?.slice(0, 8)}…{token.baseToken?.address?.slice(-6)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

const linkBtnStyle = {
  fontSize: 12, padding: "5px 12px", borderRadius: 6,
  background: "var(--border-color)", color: "var(--text-color)",
  textDecoration: "none", fontWeight: 500,
};

// ── Main App ────────────────────────────────────────────────

const ALL_CHAINS = [
  { id: "solana", label: "Solana" },
  { id: "base", label: "Base" },
  { id: "ethereum", label: "Ethereum" },
  { id: "bsc", label: "BSC" },
  { id: "arbitrum", label: "Arbitrum" },
];

export default function App() {
  const [chains, setChains] = useState(["solana", "base"]);
  const [maxMcap, setMaxMcap] = useState(5000000);
  const [minLiq, setMinLiq] = useState(5000);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [hasScanned, setHasScanned] = useState(false);
  const abortRef = useRef(false);

  const toggleChain = (id) => {
    setChains(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const scan = useCallback(async () => {
    if (!chains.length) { setError("Pick at least one chain"); return; }
    setLoading(true); setError(null); setResults([]); setExpanded(null);
    abortRef.current = false;

    try {
      const raw = await discoverTokens(chains, setStatus);
      if (abortRef.current) return;

      setStatus("Filtering & scoring...");

      const filtered = raw.filter(p => {
        if (!chains.includes(p.chainId)) return false;
        if (!p.baseToken?.name || !p.baseToken?.symbol) return false;
        const mcap = p.marketCap || p.fdv || 0;
        if (mcap < 10000 || mcap > maxMcap) return false;
        const liq = p.liquidity?.usd || 0;
        if (liq < minLiq) return false;
        const vol = p.volume?.h24 || 0;
        if (vol < 500) return false;
        return true;
      });

      // Score and sort
      const scored = filtered.map(p => ({ ...p, _safety: analyzeSafety(p) }));
      scored.sort((a, b) => b._safety.total - a._safety.total || (b.volume?.h24 || 0) - (a.volume?.h24 || 0));

      // Deduplicate by base token address — keep highest scored pair
      const deduped = [];
      const seenAddr = new Set();
      for (const p of scored) {
        const addr = p.baseToken?.address;
        if (addr && seenAddr.has(addr)) continue;
        if (addr) seenAddr.add(addr);
        deduped.push(p);
      }

      setResults(deduped.slice(0, 30));
      setStatus("");
      setHasScanned(true);
    } catch (e) {
      setError(e.message);
      setStatus("");
    } finally {
      setLoading(false);
    }
  }, [chains, maxMcap, minLiq]);

  const passedCount = results.filter(r => r._safety.passed).length;

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
          🪙 Coin Screener
        </h1>
        <p style={{ color: "#888", fontSize: 13, marginTop: 4 }}>
          Find early meme coins. Check safety. Skip the rugs.
        </p>
      </div>

      {/* Filters */}
      <div style={{
        background: "var(--card-bg)", border: "1px solid var(--border-color)",
        borderRadius: 12, padding: 16, marginBottom: 20,
      }}>
        {/* Chains */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Chains
          </label>
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {ALL_CHAINS.map(c => (
              <button
                key={c.id}
                onClick={() => toggleChain(c.id)}
                style={{
                  padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  border: "1px solid",
                  borderColor: chains.includes(c.id) ? (CHAIN_COLORS[c.id] || "#666") : "var(--border-color)",
                  background: chains.includes(c.id) ? (CHAIN_COLORS[c.id] || "#666") + "22" : "transparent",
                  color: chains.includes(c.id) ? (CHAIN_COLORS[c.id] || "#ccc") : "#888",
                  cursor: "pointer",
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>
              Max market cap: {fmtUSD(maxMcap)}
            </label>
            <input type="range" min={100000} max={50000000} step={100000}
              value={maxMcap} onChange={e => setMaxMcap(Number(e.target.value))}
              style={{ width: "100%", marginTop: 4, accentColor: "#8b5cf6" }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>
              Min liquidity: {fmtUSD(minLiq)}
            </label>
            <input type="range" min={1000} max={100000} step={1000}
              value={minLiq} onChange={e => setMinLiq(Number(e.target.value))}
              style={{ width: "100%", marginTop: 4, accentColor: "#8b5cf6" }}
            />
          </div>
        </div>

        {/* Scan button */}
        <button
          onClick={scan}
          disabled={loading}
          style={{
            marginTop: 16, width: "100%", padding: "12px 0",
            borderRadius: 10, border: "none", fontSize: 15, fontWeight: 700,
            background: loading ? "#444" : "#8b5cf6",
            color: "#fff", cursor: loading ? "not-allowed" : "pointer",
            transition: "background 0.15s",
          }}
        >
          {loading ? `⏳ ${status || "Scanning..."}` : "🔍 Scan for Meme Coins"}
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, borderRadius: 8, background: "#dc262622", color: "#f87171", marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Results */}
      {hasScanned && !loading && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: "#888" }}>
              {results.length} tokens found · {passedCount} passed safety
            </span>
            <span style={{ fontSize: 11, color: "#666" }}>
              Click a row for details
            </span>
          </div>

          {/* Column headers */}
          {results.length > 0 && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "minmax(130px,2fr) 60px 80px 80px 80px 80px 60px 50px",
              gap: 8, padding: "4px 16px", fontSize: 11, color: "#666",
              fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5,
            }}>
              <span>Token</span>
              <span>Chain</span>
              <span style={{ textAlign: "right" }}>Price</span>
              <span style={{ textAlign: "right" }}>MCap</span>
              <span style={{ textAlign: "right" }}>Liq</span>
              <span style={{ textAlign: "right" }}>Vol 24h</span>
              <span style={{ textAlign: "right" }}>24h</span>
              <span style={{ textAlign: "right" }}>Safe</span>
            </div>
          )}

          {results.map((t, i) => (
            <TokenRow
              key={`${t.chainId}-${t.pairAddress}-${i}`}
              token={t}
              expanded={expanded === i}
              onToggle={() => setExpanded(expanded === i ? null : i)}
            />
          ))}

          {results.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#888" }}>
              <p style={{ fontSize: 18, marginBottom: 8 }}>No tokens matched</p>
              <p style={{ fontSize: 13 }}>
                Try increasing max market cap, lowering min liquidity, or adding more chains.
              </p>
            </div>
          )}

          {/* Footer reminder */}
          {passedCount > 0 && (
            <div style={{
              marginTop: 20, padding: 16, borderRadius: 10,
              background: "#ca8a0411", border: "1px solid #ca8a0433",
              fontSize: 12, color: "#ca8a04", lineHeight: 1.6,
            }}>
              <strong>Before buying anything</strong> — click a row and use the RugCheck / BubbleMaps links.
              This screener catches obvious red flags but can't detect every scam. Check the contract,
              wallet distribution, liquidity lock, and community. Never put in more than you can lose.
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!hasScanned && !loading && (
        <div style={{ textAlign: "center", padding: "48px 20px", color: "#666" }}>
          <p style={{ fontSize: 36, marginBottom: 8 }}>👆</p>
          <p style={{ fontSize: 14 }}>Pick your chains, set your filters, and hit scan.</p>
          <p style={{ fontSize: 12, color: "#555", marginTop: 8, maxWidth: 400, margin: "8px auto 0" }}>
            The screener pulls new tokens from DexScreener, filters by your criteria,
            and scores each one for safety on a 0–100 scale.
          </p>
        </div>
      )}
    </div>
  );
}
