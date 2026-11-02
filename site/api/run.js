// Daily cron (vercel.json) and the admin trigger. Auth: Bearer CRON_SECRET (Vercel cron sends it).
//   GET /api/run                      -> every active pro
//   GET /api/run?account=<id>&dry=1   -> one pro, nothing written to Jobber
const { need, d1, json, event } = require("./_lib");
const { learnPro } = require("./_learn");
const { runPro } = require("./_run");

module.exports = async (req, res) => {
  if (req.headers.authorization !== `Bearer ${need("CRON_SECRET")}`) return json(res, 401, { ok: false });
  const u = new URL(req.url, "http://x");
  const one = u.searchParams.get("account"), dryRun = u.searchParams.get("dry") === "1";
  const pros = one ? [{ account_id: one }] : await d1("SELECT account_id FROM pros WHERE active=1 AND paused=0");
  const out = [];
  for (const { account_id } of pros) {
    try {
      const learned = await learnPro(account_id);
      out.push({ account_id, learned: { trades: learned.trades, radius_mi: learned.area.radius_mi }, ...(await runPro(account_id, { dryRun })) });
    } catch (e) { await event(account_id, "run_error", e.stack || e.message); out.push({ account_id, error: e.message }); }
  }
  json(res, 200, { ok: true, pros: out });
};
