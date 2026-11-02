// APP_DISCONNECT: Jobber signs the raw body with our client secret (X-Jobber-Hmac-SHA256, base64).
const crypto = require("crypto");
const { need, d1, event, json } = require("./_lib");

module.exports = async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  const sig = String(req.headers["x-jobber-hmac-sha256"] || "");
  const want = crypto.createHmac("sha256", need("JOBBER_CLIENT_SECRET")).update(raw).digest("base64");
  if (!sig || sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return json(res, 401, { ok: false });
  let body = {}; try { body = JSON.parse(raw.toString("utf8")); } catch {}
  const w = body.data?.webHookEvent || {};
  if (w.topic === "APP_DISCONNECT" && w.accountId) {
    await d1("UPDATE pros SET active=0, token='', disconnected_at=? WHERE account_id=?", [new Date().toISOString(), w.accountId]);
    await event(w.accountId, "disconnected", "webhook");
  }
  json(res, 200, { ok: true });
};
