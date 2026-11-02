// Learn a pro from their own Jobber: what they sell (job, quote and request wording + the account's
// industry) and where they work (their properties' coordinates). Clients Next Jobs created are excluded,
// so the app never learns from its own output.
const { d1, jobberFor, event } = require("./_lib");
const { inferTrades, inferArea } = require("../lib/match");

// Jobber's account.industry -> our trade vocabulary. Unknown industries add nothing.
const INDUSTRY = {
  ROOFING_SERVICE: "roofing", HVAC: "hvac", HVAC_SERVICE: "hvac", PLUMBING: "plumbing", PLUMBING_SERVICE: "plumbing",
  ELECTRICAL_CONTRACTOR: "electrical", ELECTRICAL_SERVICE: "electrical", WINDOW_WASHING: "cleaning", RESIDENTIAL_CLEANING: "cleaning",
  CARPET_CLEANING: "cleaning", PAINTING: "painting", PAINTING_SERVICE: "painting", LAWN_CARE: "landscaping", LANDSCAPING: "landscaping",
  LANDSCAPING_CONTRACTOR: "landscaping", TREE_CARE: "tree", PEST_CONTROL: "pest", JUNK_REMOVAL: "junk", HANDYMAN: "handyman",
  CONSTRUCTION: "remodel", GENERAL_CONTRACTOR: "remodel", REMODELING: "remodel", FLOORING: "flooring", FENCING: "fencing",
  CONCRETE: "concrete", MASONRY: "concrete", GUTTER_SERVICE: "gutters", SIDING: "siding", INSULATION: "insulation",
  SOLAR: "solar", GARAGE_DOOR: "garage_door", APPLIANCE_REPAIR: "handyman", POOL_AND_SPA_SERVICE: null,
};
function industryTrade(ind) {
  if (!ind) return null;
  if (ind in INDUSTRY) return INDUSTRY[ind];
  const s = ind.toLowerCase();
  const hits = [["roof", "roofing"], ["hvac", "hvac"], ["plumb", "plumbing"], ["electric", "electrical"], ["paint", "painting"], ["lawn", "landscaping"], ["landscap", "landscaping"], ["clean", "cleaning"], ["pest", "pest"], ["tree", "tree"], ["gutter", "gutters"], ["window", "windows"], ["remodel", "remodel"], ["construct", "remodel"], ["fenc", "fencing"], ["concrete", "concrete"], ["floor", "flooring"], ["junk", "junk"], ["handyman", "handyman"]];
  const h = hits.find(([k]) => s.includes(k));
  return h ? h[1] : null;
}

const READ = `query Learn($after: String) {
  account { industry }
  jobs(first: 50) { nodes { title client { id } lineItems(first: 10) { nodes { name } } } }
  quotes(first: 50) { nodes { title client { id } lineItems(first: 10) { nodes { name } } } }
  requests(first: 50) { nodes { title client { id } } }
  properties(first: 100, after: $after) { nodes { client { id } address { coordinates { latitude longitude } } } pageInfo { hasNextPage endCursor } }
}`;

async function learnPro(accountId) {
  const pro = (await d1("SELECT * FROM pros WHERE account_id=?", [accountId]))[0];
  const gql = jobberFor(pro);
  const ours = new Set((await d1("SELECT jobber_client_id FROM matches WHERE account_id=? AND jobber_client_id IS NOT NULL", [accountId])).map((r) => r.jobber_client_id));
  const d = await gql(READ);
  const mine = (n) => !ours.has(n.client?.id);
  const texts = [];
  for (const n of [...d.jobs.nodes, ...d.quotes.nodes].filter(mine)) { if (n.title) texts.push(n.title); for (const li of n.lineItems?.nodes || []) texts.push(li.name); }
  for (const n of d.requests.nodes.filter(mine)) if (n.title) texts.push(n.title);
  const { trades: fromWords, counts } = inferTrades(texts.filter(Boolean));
  const ind = industryTrade(d.account.industry);
  const trades = [...new Set([...(ind ? [ind] : []), ...fromWords])];

  let points = [], page = d.properties;
  for (let i = 0; ; i++) {
    for (const n of page.nodes.filter(mine)) { const c = n.address?.coordinates; if (c && c.latitude) points.push({ lat: +c.latitude.toFixed(5), lon: +c.longitude.toFixed(5) }); }
    if (!page.pageInfo.hasNextPage || i >= 9) break;
    page = (await gql(READ, { after: page.pageInfo.endCursor })).properties;
  }
  const area = inferArea(points);
  // A pro's own corrections win: only overwrite trades when they haven't edited them.
  const keepTrades = pro.trades_source === "pro";
  await d1("UPDATE pros SET trades=?, trades_source=?, area=?, client_points=? WHERE account_id=?",
    [keepTrades ? pro.trades : JSON.stringify(trades), keepTrades ? "pro" : "jobber", JSON.stringify({ ...area, industry: d.account.industry, word_counts: counts, texts: texts.length }), JSON.stringify(points), accountId]);
  await event(accountId, "learned", JSON.stringify({ trades, area, texts: texts.length, points: points.length }));
  return { trades: keepTrades ? JSON.parse(pro.trades) : trades, area, points: points.length, texts: texts.length };
}

module.exports = { learnPro, industryTrade };
