// The signed-in pro's settings and recent matches (GET), and their edits (POST).
const { SITE, PRICE_USD, d1, session, json, event } = require("./_lib");
const { TRADES } = require("../lib/match");

module.exports = async (req, res) => {
  const id = session(req);
  if (!id) return json(res, 401, { ok: false, connect: `${SITE}/api/connect` });
  if (req.method === "POST") {
    const b = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}");
    const sets = [], vals = [];
    if (Array.isArray(b.trades)) { sets.push("trades=?", "trades_source='pro'"); vals.push(JSON.stringify(b.trades.filter((t) => TRADES[t]))); }
    if (b.max_per_week != null) { sets.push("max_per_week=?"); vals.push(Math.max(1, Math.min(100, parseInt(b.max_per_week, 10) || 25))); }
    if (b.paused != null) { sets.push("paused=?"); vals.push(b.paused ? 1 : 0); }
    if (b.radius_mi != null) {
      const p = (await d1("SELECT area FROM pros WHERE account_id=?", [id]))[0];
      const a = JSON.parse(p.area || "{}"); a.radius_mi = Math.max(1, Math.min(25, +b.radius_mi || a.radius_mi)); a.source_radius = "pro";
      sets.push("area=?"); vals.push(JSON.stringify(a));
    }
    if (sets.length) await d1(`UPDATE pros SET ${sets.join(", ")} WHERE account_id=?`, [...vals, id]);
    await event(id, "settings", JSON.stringify(b).slice(0, 500));
  }
  const p = (await d1("SELECT name, active, trades, trades_source, area, max_per_week, paused, connected_at, trial_ends, sub_status, last_run FROM pros WHERE account_id=?", [id]))[0];
  if (!p) return json(res, 404, { ok: false });
  const matches = await d1("SELECT kind, trade, reason, address, distance_mi, jobber_request_id, created_at, error FROM matches WHERE account_id=? ORDER BY created_at DESC LIMIT 25", [id]);
  const area = JSON.parse(p.area || "null");
  json(res, 200, { ok: true, name: p.name, active: !!p.active, paused: !!p.paused, trades: JSON.parse(p.trades || "[]"), trades_source: p.trades_source,
    area: area && { lat: area.lat, lon: area.lon, radius_mi: area.radius_mi, source: area.source, n: area.n }, max_per_week: p.max_per_week,
    trial_ends: p.trial_ends, subscribed: p.sub_status === "active" || p.sub_status === "trialing", price_usd: PRICE_USD, last_run: p.last_run,
    all_trades: TRADES, matches });
};
