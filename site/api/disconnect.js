// Disconnect from our side: tell Jobber (appDisconnect), then forget the tokens.
const { d1, session, jobberFor, json, event } = require("./_lib");
module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { ok: false });
  const id = session(req);
  if (!id) return json(res, 401, { ok: false });
  const pro = (await d1("SELECT * FROM pros WHERE account_id=?", [id]))[0];
  if (pro?.token) { try { await jobberFor(pro)("mutation { appDisconnect { app { name } userErrors { message } } }"); } catch (e) { await event(id, "disconnect_error", e.message); } }
  await d1("UPDATE pros SET active=0, token='', disconnected_at=? WHERE account_id=?", [new Date().toISOString(), id]);
  await event(id, "disconnected", "in-app");
  res.setHeader("Set-Cookie", "nj=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
  json(res, 200, { ok: true });
};
