// The matcher. Pure functions, no I/O, so test/match.test.js can pin every rule.
// Matching is a join (permit trade x follow-on table x distance), never a model call.

// One vocabulary for both sides: what a permit is FOR, and what a pro SELLS.
const TRADES = {
  roofing: "Roofing",
  gutters: "Gutters",
  siding: "Siding",
  windows: "Windows & doors",
  insulation: "Insulation",
  solar: "Solar",
  hvac: "Heating & cooling",
  water_heater: "Water heaters",
  plumbing: "Plumbing",
  electrical: "Electrical",
  remodel: "Remodeling",
  painting: "Painting",
  flooring: "Flooring",
  cleaning: "Cleaning",
  landscaping: "Landscaping & lawn",
  fencing: "Fencing",
  concrete: "Concrete & masonry",
  deck: "Decks",
  garage_door: "Garage doors",
  tree: "Tree care",
  pest: "Pest control",
  junk: "Junk removal & dumpsters",
  handyman: "Handyman",
};

// Permit text -> trade. First hit wins, so the specific words sit above the generic ones.
const PERMIT_RULES = [
  ["garage_door", /garage door/i],
  ["solar", /\bsolar\b|\bpv\b|photovoltaic/i],
  ["roofing", /\bre-?roof|\broof|shingle|tear ?off/i],
  ["siding", /\bsiding\b|\bstucco\b|\bre-?sid(e|ing)\b/i],
  ["windows", /\bwindows?\b|double ?hungs?|casements?|\bpatio door|\bentry door|\bdoors?\b/i],
  ["water_heater", /water heater|\bwh\b|tankless/i],
  ["hvac", /furnace|\bboiler|air condition|\ba\/?c\b|\bac unit|heat pump|mini[- ]?split|condenser|hvac|ductwork|\bhydronic/i],
  ["insulation", /insulat|air ?seal/i],
  ["deck", /\bdecks?\b|\bporch\b/i],
  ["garage_door", /garage door/i],
  ["fencing", /\bfence/i],
  ["accessory", /detached garage|\bgarage\b/i],
  ["concrete", /retaining wall|foundation|\bfootings?\b|concrete|masonry|chimney|tuckpoint|mortar|\bcrown\b/i],
  ["remodel", /kitchen|bath(room)?\b|basement|remodel|renovat|finish(ed|ing)? (the )?basement|egress/i],
  ["plumbing", /plumb|sewer|\bdrain|water service|lead service|backflow|fixture/i],
];

// What a house with this permit will likely need next, and the sentence that says why.
// The permitted trade's own job is usually already sold; follow-on work is the value.
const FOLLOW_ON = {
  roofing: { gutters: "New roofs usually get new gutters", insulation: "Attic insulation is cheapest while the roof is open", solar: "Solar goes on a new roof, not an old one", siding: "Exterior work tends to come in a run" },
  siding: { windows: "New siding is when windows get swapped", gutters: "Gutters come off for siding and often stay off", painting: "Trim gets painted after siding" },
  windows: { siding: "Window swaps often lead to new siding", painting: "New windows mean trim and interior paint" },
  hvac: { insulation: "A new furnace is when owners look at heat loss", hvac: "Furnace swaps often pull the AC along" },
  water_heater: { plumbing: "An old water heater usually means old supply lines" },
  plumbing: { remodel: "Big plumbing jobs often come with a remodel", flooring: "Plumbing work under floors means new flooring" },
  remodel: { electrical: "Remodels need electrical", plumbing: "Kitchens and baths need plumbing", hvac: "Remodels often move ducts and vents", painting: "Every remodel ends with paint", flooring: "Every remodel ends with floors", cleaning: "Post-construction cleaning", junk: "Remodels fill dumpsters" },
  addition: { electrical: "Additions need electrical", hvac: "Additions need heat and cooling", roofing: "Additions tie into the roof", painting: "New rooms need paint", flooring: "New rooms need floors", landscaping: "Construction tears up the yard", cleaning: "Post-construction cleaning", gutters: "New roof lines need gutters" },
  new_build: { landscaping: "New houses need a yard", fencing: "New houses need fences", concrete: "New houses need drives and walks", cleaning: "Move-in cleaning", garage_door: "New garages need doors", gutters: "New houses need gutters", pest: "New houses need a first pest treatment" },
  accessory: { garage_door: "New garages need doors", concrete: "New garages need a slab and apron", electrical: "New garages need power", roofing: "New garages need a roof" },
  demolition: { junk: "Demolition fills dumpsters", landscaping: "A cleared lot gets regraded and seeded", concrete: "A cleared lot gets new flatwork", tree: "Lots get cleared of trees" },
  deck: { painting: "New decks get stained", landscaping: "Deck work tears up the yard" },
  solar: { roofing: "Solar installers find roofs that need work first", electrical: "Solar means a panel upgrade" },
  insulation: { hvac: "A tighter house changes the heating load" },
  concrete: { landscaping: "Foundation and wall work tears up the yard" },
};

// Utility batch work and the city's own crews are not leads.
const NOT_A_LEAD = /centerpoint|xcel energy|meter move|city of minneapolis/i;

const RESIDENTIAL = new Set(["SFD", "TFD", "3to4", "TH"]);

function cleanComment(s) {
  let t = String(s || "");
  if (/source information is not available/i.test(t)) return "";
  t = t.split(/certificate of occupancy|const type|building code/i)[0];
  t = t.replace(/\((?:[A-Z]{2,4})(?:\s*-\s*[A-Za-z]+)?\)|-\s?[A-Z]{3}\b/g, " ");
  return t.replace(/_{2,}/g, " ").replace(/\s+/g, " ").trim();
}

function permitTrade(p) {
  const type = p.permitType, work = p.workType;
  const text = cleanComment(p.comments);
  if (type === "Wrecking") return "demolition";
  if (type === "Res" && work === "New") return "new_build";
  if (type === "Res" && work === "Addition") return "addition";
  for (const [trade, re] of PERMIT_RULES) if (re.test(text)) return trade;
  if (type === "Mechanical") return "hvac";
  if (type === "Plumbing") return "plumbing";
  if (type === "Res" && work === "Remodel") return "remodel";
  if (type === "Res" && work === "Accessory") return "accessory";
  return null;
}

function isLead(p) {
  if (!RESIDENTIAL.has(p.occupancyType)) return false;
  if (p.status === "Cancelled") return false;
  if (NOT_A_LEAD.test(`${p.applicantName || ""} ${p.comments || ""}`)) return false;
  return p.Latitude != null && p.Longitude != null;
}

// Applicant is shown only when it reads as a company (mpls-permits skill: it is sometimes the homeowner).
const COMPANY = /\b(inc|llc|l\.l\.c|co|corp|company|construction|builders?|homes|roofing|exteriors?|heating|air|plumbing|mechanical|electric|services?|contracting|contractors?|remodel(ing)?|windows?|solar|energy|systems|group|enterprises|sons|brothers|design|restoration|properties)\b/i;
function applicantCompany(name) {
  const n = String(name || "").trim();
  return n && COMPANY.test(n) ? n : null;
}

// Owner name from the county record (Aidan 2026-11-02 via the coordinator: use the Hennepin
// owner as the client name; fall back to "Homeowner" for trusts, companies and blanks).
const NOT_A_PERSON = /\b(trs?|trust(ee)?s?|llc|inc|corp|co|company|estate|church|assn|association|city|county|state|housing|properties|property|holdings|bank|partners(hip)?|lp|llp|ltd|fund|investments?|realty|rentals?|homes|ventures|group|mgmt|management|hra|authority|minneapolis|cdc|foundation)\b/i;
function titleCase(s) { return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bMc([a-z])/g, (m, c) => "Mc" + c.toUpperCase()); }
function ownerToClient(owner) {
  const raw = String(owner || "").replace(/\s+/g, " ").trim();
  if (!raw || NOT_A_PERSON.test(raw)) return { firstName: "", lastName: "Homeowner" };
  const first = raw.split(/\s*&\s*|\s+AND\s+/i)[0].replace(/,/g, " ").trim();
  const parts = first.split(" ").filter((w) => !/^(JR|SR|II|III|IV|ETAL|ET|AL)$/i.test(w));
  if (parts.length < 2) return { firstName: "", lastName: "Homeowner" };
  return { firstName: titleCase(parts[0]), lastName: titleCase(parts[parts.length - 1]) };
}

// Pro side: their own words (line items, job titles, request titles) -> trades they sell.
const PRO_RULES = [
  ["roofing", /roof|shingle|re-?roof/i],
  ["gutters", /gutter|downspout|leaf guard/i],
  ["siding", /siding|soffit|fascia/i],
  ["windows", /window|door install|patio door/i],
  ["insulation", /insulat|attic|air seal/i],
  ["solar", /solar|\bpv\b/i],
  ["hvac", /furnace|hvac|heat pump|\ba\/?c\b|air condition|boiler|duct|mini[- ]?split|tune[- ]?up/i],
  ["water_heater", /water heater|tankless/i],
  ["plumbing", /plumb|drain|sewer|faucet|toilet|\bpipes?\b/i],
  ["electrical", /electric|wiring|panel|outlet|lighting|ev charger|circuit/i],
  ["remodel", /remodel|renovat|kitchen|bathroom|basement finish|tile/i],
  ["painting", /paint|stain/i],
  ["flooring", /floor|carpet|hardwood|lvp/i],
  ["cleaning", /clean|maid|janitor|window wash/i],
  ["landscaping", /lawn|mow|landscap|sod|mulch|irrigation|sprinkler|snow/i],
  ["fencing", /fence/i],
  ["concrete", /concrete|masonry|paver|driveway|tuckpoint|patio/i],
  ["deck", /\bdeck/i],
  ["garage_door", /garage door/i],
  ["tree", /tree|stump|arbor/i],
  ["pest", /pest|exterminat|rodent|termite|mosquito/i],
  ["junk", /junk|haul|dumpster|debris/i],
  ["handyman", /handyman/i],
];

// Count trade words across the pro's own text; a trade must be seen twice (or be the only one) to count.
function inferTrades(texts) {
  const counts = {};
  // One trade per text: the first (most specific) rule wins, so "roof repair - leak" stays roofing.
  for (const t of texts) { const hit = PRO_RULES.find(([, re]) => re.test(t)); if (hit) counts[hit[0]] = (counts[hit[0]] || 0) + 1; }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const kept = ranked.filter(([, n]) => n >= 2).map(([t]) => t);
  return { trades: kept.length ? kept : ranked.slice(0, 1).map(([t]) => t), counts };
}

const MPLS = { lat: 44.9778, lon: -93.265 };
function miles(a, b) {
  const R = 3958.8, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Service area = the circle round the median of their client points that holds 90% of them,
// floored at 3 mi and capped at 25 mi. No points near Minneapolis -> the whole city.
function inferArea(points) {
  const near = points.filter((p) => miles(p, MPLS) < 40);
  if (near.length < 3) return { lat: MPLS.lat, lon: MPLS.lon, radius_mi: 8, source: "default", n: near.length };
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const c = { lat: med(near.map((p) => p.lat)), lon: med(near.map((p) => p.lon)) };
  const d = near.map((p) => miles(c, p)).sort((a, b) => a - b);
  const r90 = d[Math.min(d.length - 1, Math.floor(d.length * 0.9))];
  return { lat: +c.lat.toFixed(5), lon: +c.lon.toFixed(5), radius_mi: +Math.min(25, Math.max(3, r90)).toFixed(1), source: "clients", n: near.length };
}

// How a permit kind reads in a sentence ("a roof permit", "a garage permit").
const PERMIT_LABEL = { roofing: "roof", windows: "window", hvac: "heating/cooling", water_heater: "water heater", remodel: "remodel", addition: "addition", new_build: "new house", demolition: "demolition", accessory: "garage/accessory building", deck: "deck", concrete: "foundation/masonry", insulation: "insulation", siding: "siding", solar: "solar", plumbing: "plumbing", fencing: "fence", garage_door: "garage door" };

const NEIGHBOR_MI = 0.25; // about three Minneapolis blocks

function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }

// One permit x one pro -> a match or null. pro = {trades:[], area:{lat,lon,radius_mi}, client_points:[]}
function matchPermit(p, pro) {
  if (!isLead(p)) return null;
  const trade = permitTrade(p);
  if (!trade) return null;
  const at = { lat: p.Latitude, lon: p.Longitude };
  const dist = miles(at, pro.area);
  if (dist > pro.area.radius_mi) return null;
  const who = applicantCompany(p.applicantName);
  const what = cleanComment(p.comments).slice(0, 140);
  const when = fmtDate(p.issueDate);
  const label = PERMIT_LABEL[trade] || (TRADES[trade] ? TRADES[trade].toLowerCase() : trade.replace("_", " "));
  const nearClients = (pro.client_points || []).filter((c) => miles(c, at) <= NEIGHBOR_MI).length;
  const base = { permit_number: p.permitNumber, trade, distance_mi: +dist.toFixed(1), near_clients: nearClients };

  if (pro.trades.includes(trade)) {
    const sold = `${label[0].toUpperCase() + label.slice(1)} permit issued ${when}${who ? ` to ${who}` : ""}: that job is likely already sold.`;
    if (nearClients >= 3) {
      return { ...base, kind: "neighbor", title: `Competitor on your clients' block: ${label}`,
        reason: `${sold} You have ${nearClients} clients within three blocks. A neighbor saw a crew today; a door-hanger or a note to those clients lands now.`, what };
    }
    return { ...base, kind: "same_trade", title: `${TRADES[trade]} permit nearby`,
      reason: `${sold} Houses on this block are the same age and the same stock; the neighbors are the lead.`, what };
  }
  const fo = FOLLOW_ON[trade] || {};
  const next = pro.trades.find((t) => fo[t]);
  if (next) {
    return { ...base, kind: "follow_on", follow_trade: next, title: `${TRADES[next]} after ${/^[aeiou]/i.test(label) ? "an" : "a"} ${label} permit`,
      reason: `${fo[next]}. ${label[0].toUpperCase() + label.slice(1)} permit issued ${when}${who ? ` to ${who}` : ""}. That job is likely already sold; the ${TRADES[next].toLowerCase()} work is still open.`, what };
  }
  return null;
}

module.exports = { TRADES, FOLLOW_ON, permitTrade, isLead, cleanComment, applicantCompany, ownerToClient, inferTrades, inferArea, matchPermit, miles, MPLS, NEIGHBOR_MI };
