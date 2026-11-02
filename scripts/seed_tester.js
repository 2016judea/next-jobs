// Seed the Jobber TEST account (Next Jobs Test Roofing) with synthetic past work so learning has
// something to read: 12 "Sample Client" records on south Minneapolis blocks, each with a roofing request.
// Synthetic names; addresses are city blocks picked from the register. Never run against a real pro.
const fs = require("fs"), path = require("path");
for (const f of [path.join(process.env.HOME, "Desktop/bricks/.env"), path.join(__dirname, "../.env")])
  for (const l of fs.readFileSync(f, "utf8").split("\n")) { const m = l.match(/^(?:export\s+)?([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const { d1, jobberFor } = require("../site/api/_lib");
const ADDR = ["3301 42nd Ave S", "3415 43rd Ave S", "3540 44th Ave S", "3624 45th Ave S", "3712 46th Ave S", "3800 42nd Ave S",
  "3916 43rd Ave S", "4012 44th Ave S", "3226 38th Ave S", "3322 39th Ave S", "3418 40th Ave S", "3510 41st Ave S"];
const WORK = ["Shingle roof replacement", "Roof repair - leak at chimney flashing", "Tear-off and re-roof, 24 sq", "Gutter replacement"];
(async () => {
  const pro = (await d1("SELECT * FROM pros WHERE name='Next Jobs Test Roofing'"))[0];
  const gql = jobberFor(pro);
  for (let i = 0; i < ADDR.length; i++) {
    const c = (await gql(`mutation($input: ClientCreateInput!) { clientCreate(input: $input) { client { id clientProperties(first:1){ nodes { id } } } userErrors { message } } }`,
      { input: { firstName: "Sample", lastName: `Client ${i + 1}`, properties: [{ address: { street1: ADDR[i], city: "Minneapolis", province: "MN", country: "US" } }] } })).clientCreate;
    if (c.userErrors.length) { console.log(c.userErrors); continue; }
    const r = (await gql(`mutation($input: RequestCreateInput!) { requestCreate(input: $input) { request { id } userErrors { message } } }`,
      { input: { clientId: c.client.id, propertyId: c.client.clientProperties.nodes[0].id, title: WORK[i % WORK.length] } })).requestCreate;
    console.log(ADDR[i], r.userErrors.length ? r.userErrors : "ok");
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
