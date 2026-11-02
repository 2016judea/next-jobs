// The landing page's live example: for a trade, what Next Jobs would have put in a Minneapolis pro's
// Jobber over the last 14 days (citywide). Addresses and permits are public record; no owner names here.
const { json } = require("./_lib");
const { recentPermits } = require("./_run");
const { matchPermit, TRADES, MPLS } = require("../lib/match");

module.exports = async (req, res) => {
  const trade = new URL(req.url, "http://x").searchParams.get("trade") || "roofing";
  if (!TRADES[trade]) return json(res, 400, { ok: false });
  const permits = await recentPermits();
  const pro = { trades: [trade], area: { ...MPLS, radius_mi: 12 }, client_points: [] };
  const rows = [], kinds = { same_trade: 0, follow_on: 0 }, seen = new Set();
  for (const p of permits) {
    const m = matchPermit(p, pro);
    if (!m || seen.has(p.Display)) continue;
    seen.add(p.Display); kinds[m.kind] = (kinds[m.kind] || 0) + 1;
    rows.push({ address: String(p.Display).toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (m, n, x) => n + x.toLowerCase()).replace(/\b(Ne|Nw|Se|Sw)\b/g, (m) => m.toUpperCase()), issued: new Date(p.issueDate).toISOString().slice(0, 10), kind: m.kind, title: m.title, reason: m.reason, what: m.what });
  }
  rows.sort((a, b) => (a.kind === "follow_on" ? 0 : 1) - (b.kind === "follow_on" ? 0 : 1) || b.issued.localeCompare(a.issued));
  res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");
  json(res, 200, { ok: true, trade, label: TRADES[trade], days: 14, total: rows.length, kinds, newest: permits[0] ? new Date(permits[0].issueDate).toISOString().slice(0, 10) : null, rows: rows.slice(0, 6) });
};
