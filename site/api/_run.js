// One pro, one pass: read the live Minneapolis permit register, match it against what the pro sells
// and where they work, and put each new match into their Jobber as a client + request + note.
const { d1, jobberFor, event, stripe } = require("./_lib");
const { matchPermit, ownerToClient } = require("../lib/match");

const PERMITS = "https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/CCS_Permits/FeatureServer/0/query";
const PARCELS = "https://gis.hennepin.us/arcgis/rest/services/HennepinData/LAND_PROPERTY/MapServer/1/query";
const LOOKBACK_DAYS = 14;

let permitCache = null; // one register read per invocation, shared across pros
async function recentPermits() {
  if (permitCache) return permitCache;
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);
  const out = [];
  for (let offset = 0; offset < 20000; offset += 2000) {
    const body = new URLSearchParams({ where: `issueDate >= date '${since}' AND occupancyType IN ('SFD','TFD','3to4','TH')`, outFields: "permitNumber,Display,APN,Latitude,Longitude,applicantName,permitType,occupancyType,workType,status,milestone,comments,issueDate", orderByFields: "issueDate DESC", resultOffset: String(offset), resultRecordCount: "2000", f: "json" });
    const j = await (await fetch(PERMITS, { method: "POST", body })).json();
    if (j.error) throw new Error(`permits: ${JSON.stringify(j.error).slice(0, 200)}`);
    out.push(...j.features.map((f) => f.attributes));
    if (!j.exceededTransferLimit) break;
  }
  return (permitCache = out);
}

async function parcels(pids) {
  const out = {};
  for (let i = 0; i < pids.length; i += 100) {
    const batch = pids.slice(i, i + 100).filter((p) => /^\d{13}$/.test(p));
    if (!batch.length) continue;
    const body = new URLSearchParams({ where: `PID IN (${batch.map((p) => `'${p}'`).join(",")})`, outFields: "PID,OWNER_NM,BUILD_YR,ZIP_CD", returnGeometry: "false", f: "json" });
    const j = await (await fetch(PARCELS, { method: "POST", body })).json();
    for (const f of j.features || []) out[f.attributes.PID] = f.attributes;
  }
  return out;
}

const title = (s) => String(s || "").toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (m, n, s) => n + s.toLowerCase()).replace(/\b(Ne|Nw|Se|Sw)\b/g, (m) => m.toUpperCase());

const FIND_PROPERTY = `query($q: String!) { properties(first: 5, searchTerm: $q) { nodes { id address { street1 } client { id } } } }`;
const CLIENT_CREATE = `mutation($input: ClientCreateInput!) { clientCreate(input: $input) { client { id clientProperties(first: 1) { nodes { id } } } userErrors { message path } } }`;
const REQUEST_CREATE = `mutation($input: RequestCreateInput!) { requestCreate(input: $input) { request { id jobberWebUri } userErrors { message path } } }`;
const NOTE_CREATE = `mutation($id: EncodedId!, $input: RequestCreateNoteInput!) { requestCreateNote(requestId: $id, input: $input) { requestNote { id } userErrors { message path } } }`;

function noteFor(m, p, parcel) {
  const lines = [m.reason, ""];
  if (m.what) lines.push(`Permit says: "${m.what}"`);
  lines.push(`Permit ${p.permitNumber}, issued ${new Date(p.issueDate).toISOString().slice(0, 10)}, status ${p.status}${p.milestone ? ` (${p.milestone})` : ""}.`);
  if (parcel?.BUILD_YR && +parcel.BUILD_YR > 1800) lines.push(`House built ${parcel.BUILD_YR} (Hennepin County).`);
  lines.push(`${m.distance_mi} mi from the middle of your service area.`);
  if (m.near_clients) lines.push(`${m.near_clients} of your clients live within three blocks.`);
  lines.push("", "Found by Next Jobs in the City of Minneapolis permit register. Owner name from Hennepin County property records.");
  return lines.join("\n");
}

async function runPro(accountId, { limit, dryRun = false } = {}) {
  const pro = (await d1("SELECT * FROM pros WHERE account_id=?", [accountId]))[0];
  if (!pro || !pro.active || !pro.token) return { skipped: "inactive" };
  if (pro.paused) return { skipped: "paused" };
  if (pro.stripe_subscription) { // re-read so a cancelled card stops the matches
    try { const sub = await stripe(`subscriptions/${pro.stripe_subscription}`); if (sub.status !== pro.sub_status) { pro.sub_status = sub.status; await d1("UPDATE pros SET sub_status=? WHERE account_id=?", [sub.status, accountId]); } } catch (e) { await event(accountId, "stripe_error", e.message); }
  }
  const paid = pro.sub_status === "active" || pro.sub_status === "trialing";
  if (!paid && pro.trial_ends && new Date(pro.trial_ends) < new Date()) return { skipped: "trial_over" };
  const shape = { trades: JSON.parse(pro.trades || "[]"), area: JSON.parse(pro.area || "null"), client_points: JSON.parse(pro.client_points || "[]") };
  if (!shape.trades.length || !shape.area) return { skipped: "not_learned" };

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const sentThisWeek = (await d1("SELECT COUNT(*) AS n FROM matches WHERE account_id=? AND created_at>=? AND error IS NULL", [accountId, weekAgo]))[0].n;
  const room = Math.max(0, Math.min(limit ?? Infinity, (pro.max_per_week || 25) - sentThisWeek));
  const seen = new Set((await d1("SELECT permit_number FROM matches WHERE account_id=?", [accountId])).map((r) => r.permit_number));

  // Rank: neighbor first (strongest), then follow-on, then same-trade; newest and nearest first within each.
  const order = { neighbor: 0, follow_on: 1, same_trade: 2 };
  const permits = await recentPermits();
  const seenAddr = new Set();
  const found = [];
  for (const p of permits) {
    if (seen.has(p.permitNumber)) continue;
    const m = matchPermit(p, shape);
    if (!m || seenAddr.has(p.Display)) continue;
    seenAddr.add(p.Display);
    found.push({ m, p });
  }
  found.sort((a, b) => order[a.m.kind] - order[b.m.kind] || b.p.issueDate - a.p.issueDate || a.m.distance_mi - b.m.distance_mi);
  const pick = found.slice(0, room);
  if (dryRun) return { matched: found.length, would_send: pick.map(({ m, p }) => ({ address: p.Display, ...m })) };

  const pinfo = await parcels(pick.map(({ p }) => p.APN));
  const gql = jobberFor(pro);
  const sent = [];
  for (const { m, p } of pick) {
    const parcel = pinfo[p.APN];
    const street1 = title(p.Display);
    let clientId = null, propertyId = null, error = null, requestId = null, existing = false;
    try {
      const hit = (await gql(FIND_PROPERTY, { q: street1 })).properties.nodes.find((n) => (n.address.street1 || "").toLowerCase() === street1.toLowerCase());
      if (hit) { clientId = hit.client.id; propertyId = hit.id; existing = true; }
      else {
        const name = ownerToClient(parcel?.OWNER_NM);
        const c = (await gql(CLIENT_CREATE, { input: { ...name, receivesReminders: false, receivesFollowUps: false, receivesQuoteFollowUps: false, receivesInvoiceFollowUps: false, receivesReviewRequests: false,
          properties: [{ address: { street1, city: "Minneapolis", province: "MN", postalCode: parcel?.ZIP_CD ? String(parcel.ZIP_CD).slice(0, 5) : undefined, country: "US" } }] } })).clientCreate;
        if (c.userErrors.length) throw new Error(c.userErrors.map((e) => e.message).join("; "));
        clientId = c.client.id; propertyId = c.client.clientProperties.nodes[0]?.id;
      }
      const reqTitle = existing ? `Your client pulled a ${m.trade.replace("_", " ")} permit: ${m.title}` : `${m.title}: ${street1}`;
      const r = (await gql(REQUEST_CREATE, { input: { clientId, propertyId, title: reqTitle.slice(0, 120) } })).requestCreate;
      if (r.userErrors.length) throw new Error(r.userErrors.map((e) => e.message).join("; "));
      requestId = r.request.id;
      const n = (await gql(NOTE_CREATE, { id: requestId, input: { message: noteFor(m, p, parcel), pinned: true } })).requestCreateNote;
      if (n.userErrors.length) await event(accountId, "note_error", n.userErrors.map((e) => e.message).join("; "));
    } catch (e) { error = e.message.slice(0, 500); }
    await d1(`INSERT OR REPLACE INTO matches (account_id, permit_number, kind, trade, reason, address, distance_mi, jobber_client_id, jobber_request_id, created_at, error)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [accountId, p.permitNumber, m.kind, m.follow_trade || m.trade, m.reason, street1, m.distance_mi, existing ? null : clientId, requestId, new Date().toISOString(), error]);
    sent.push({ address: street1, kind: m.kind, requestId, error });
  }
  await d1("UPDATE pros SET last_run=? WHERE account_id=?", [new Date().toISOString(), accountId]);
  await event(accountId, "run", JSON.stringify({ matched: found.length, sent: sent.length, errors: sent.filter((s) => s.error).length }));
  return { matched: found.length, sent };
}

module.exports = { runPro, recentPermits };
