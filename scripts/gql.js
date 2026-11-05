// Local helper: run a GraphQL query against a connected pro's Jobber account.
//   node scripts/gql.js '<query>' [accountId]   (env: bricks/.env + next-jobs/.env)
const fs = require("fs"), path = require("path");
for (const f of [path.join(process.env.HOME, "Desktop/workspace/bricks/.env"), path.join(__dirname, "../.env")])
  for (const l of fs.readFileSync(f, "utf8").split("\n")) { const m = l.match(/^(?:export\s+)?([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { d1, jobberFor } = require("../site/api/_lib");
(async () => {
  const id = process.argv[3];
  const pro = (await d1(id ? "SELECT * FROM pros WHERE account_id=?" : "SELECT * FROM pros WHERE active=1 ORDER BY connected_at DESC LIMIT 1", id ? [id] : []))[0];
  const q = process.argv[2].startsWith("@") ? fs.readFileSync(process.argv[2].slice(1), "utf8") : process.argv[2];
  const vars = process.env.VARS ? JSON.parse(process.env.VARS) : undefined;
  console.log(JSON.stringify(await jobberFor(pro)(q, vars), null, 1));
})().catch((e) => { console.error(e.message); process.exit(1); });
