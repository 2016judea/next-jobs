const test = require("node:test");
const assert = require("node:assert");
const m = require("../site/lib/match.js");

const permit = (o) => ({ permitNumber: "BLDG1", permitType: "Res", workType: "Misc", occupancyType: "SFD", status: "Issued",
  applicantName: "Four Brothers Construction LLC", comments: "tear off install new shingle roof.", issueDate: Date.UTC(2026, 9, 26),
  Latitude: 44.94, Longitude: -93.22, ...o });
const pro = (trades, o = {}) => ({ trades, area: { lat: 44.95, lon: -93.25, radius_mi: 8 }, client_points: [], ...o });

test("roof permit is a roof", () => assert.equal(m.permitTrade(permit({})), "roofing"));
test("CenterPoint meter moves are not leads", () =>
  assert.equal(m.isLead(permit({ permitType: "Plumbing", applicantName: "CenterPoint Energy Resource Corp", comments: "METER MOVE Q3" })), false));
test("commercial occupancy is not a lead", () => assert.equal(m.isLead(permit({ occupancyType: "Comm" })), false));
test("roofer sees a roof permit as same-trade and is told it's sold", () => {
  const r = m.matchPermit(permit({}), pro(["roofing"]));
  assert.equal(r.kind, "same_trade"); assert.match(r.reason, /likely already sold/);
});
test("gutter pro sees a roof permit as follow-on", () => assert.equal(m.matchPermit(permit({}), pro(["gutters"])).kind, "follow_on"));
test("plumber does not see a roof permit", () => assert.equal(m.matchPermit(permit({}), pro(["plumbing"])), null));
test("outside the radius is no match", () => assert.equal(m.matchPermit(permit({ Latitude: 45.3 }), pro(["roofing"])), null));
test("3 clients within three blocks makes it a neighbor match", () => {
  const pts = [0, 1, 2].map((i) => ({ lat: 44.94 + i * 0.001, lon: -93.22 }));
  assert.equal(m.matchPermit(permit({}), pro(["roofing"], { client_points: pts })).kind, "neighbor");
});
test("homeowner applicant name is never shown", () => {
  const r = m.matchPermit(permit({ applicantName: "Jane Smith" }), pro(["gutters"]));
  assert.doesNotMatch(r.reason, /Jane|Smith/);
});
test("owner name: person, trust, blank", () => {
  assert.deepEqual(m.ownerToClient("TERESA ANN MURRAY"), { firstName: "Teresa", lastName: "Murray" });
  assert.deepEqual(m.ownerToClient("A M RUTH & J E GRIFFITH TRS"), { firstName: "", lastName: "Homeowner" });
  assert.deepEqual(m.ownerToClient(""), { firstName: "", lastName: "Homeowner" });
  assert.deepEqual(m.ownerToClient("ACME PROPERTIES LLC"), { firstName: "", lastName: "Homeowner" });
});
test("trades inferred from the pro's own words", () => {
  const t = m.inferTrades(["Shingle roof replacement", "Re-roof 30 sq", "Gutter cleaning", "roof repair"]);
  assert.deepEqual(t.trades, ["roofing"]);
});
test("area defaults to the city when clients aren't near Minneapolis", () =>
  assert.equal(m.inferArea([{ lat: 40, lon: -100 }]).source, "default"));
test("area wraps the clients", () => {
  const pts = Array.from({ length: 10 }, (_, i) => ({ lat: 44.95 + i * 0.01, lon: -93.25 }));
  const a = m.inferArea(pts); assert.equal(a.source, "clients"); assert.ok(a.radius_mi >= 3 && a.radius_mi < 10);
});
test("a roofer's leak repair is not plumbing", () =>
  assert.deepEqual(m.inferTrades(["Roof repair - leak at chimney flashing", "Roof repair - leak", "Shingle roof replacement"]).trades, ["roofing"]));
