// Learn + run one pro from the terminal.  node scripts/run_local.js [--dry] [--limit N] [accountId]
const fs = require("fs"), path = require("path");
for (const f of [path.join(process.env.HOME, "Desktop/workspace/bricks/.env"), path.join(__dirname, "../.env")])
  for (const l of fs.readFileSync(f, "utf8").split("\n")) { const m = l.match(/^(?:export\s+)?([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const { d1 } = require("../site/api/_lib");
const { learnPro } = require("../site/api/_learn");
const { runPro } = require("../site/api/_run");
(async () => {
  const a = process.argv.slice(2), dry = a.includes("--dry"), li = a.indexOf("--limit");
  const limit = li >= 0 ? +a[li + 1] : undefined;
  const id = a.find((x, i) => !x.startsWith("--") && (li < 0 || i !== li + 1));
  const pro = (await d1(id ? "SELECT account_id FROM pros WHERE account_id=?" : "SELECT account_id FROM pros WHERE active=1 ORDER BY connected_at DESC LIMIT 1", id ? [id] : []))[0];
  console.log("learned", JSON.stringify(await learnPro(pro.account_id)));
  const r = await runPro(pro.account_id, { limit, dryRun: dry });
  console.log(JSON.stringify(r, null, 1).slice(0, 4000));
})().catch((e) => { console.error(e.stack); process.exit(1); });
