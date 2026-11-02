// Shared by the functions. Files starting with "_" are not routes on Vercel.
// Pattern: ~/Desktop/block-brief/site/api/_lib.js (D1 over HTTP, sealed tokens, no SDKs).
const crypto = require("crypto");

const SITE = process.env.SITE_URL || "https://next-jobs-permits.vercel.app";
const CF_ACCT = "6e9ce2a0c1d0c9b570955eaaae7db72d";
const D1 = "2889c47d-e73b-4ffd-8e12-ae6be91fe5cf";
const JOBBER_API = "https://api.getjobber.com/api/graphql";
const JOBBER_VERSION = "2025-04-16";
const DRAFT_ACCOUNT_LIMIT = 5; // Jobber: a Draft app may connect to at most 5 accounts.
const TRIAL_DAYS = 7;
const PRICE_USD = 29;
const STRIPE_PRICE = "price_1UXQXEBzD4mN8eODyvg40cIK"; // Brick and Mortar account, $29/month, product prod_VYXcH9cIcipxHT

async function stripe(path, { method = "GET", form } = {}) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${need("STRIPE_SECRET_KEY")}`, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`stripe ${path}: ${j.error?.message || r.status}`);
  return j;
}

function need(k) {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
}

async function d1(sql, params = []) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCT}/d1/database/${D1}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${need("CLOUDFLARE_API_TOKEN")}`, "content-type": "application/json" },
    body: JSON.stringify({ sql, params }),
  });
  const j = await r.json();
  if (!j.success) throw new Error(`d1: ${JSON.stringify(j.errors).slice(0, 300)}`);
  return j.result[0].results;
}

const key = () => crypto.createHash("sha256").update(need("ACCESS_SECRET")).digest();
function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}
function unseal(s) {
  const b = Buffer.from(s, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8"));
}

const mac = (s) => crypto.createHmac("sha256", need("ACCESS_SECRET")).update(s).digest("base64url").slice(0, 32);
function signed(value, ttlSec) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const body = Buffer.from(JSON.stringify({ v: value, exp })).toString("base64url");
  return `${body}.${mac(body)}`;
}
function verify(tok) {
  const [body, m] = String(tok || "").split(".");
  if (!body || !m) return null;
  const want = mac(body);
  if (m.length !== want.length || !crypto.timingSafeEqual(Buffer.from(m), Buffer.from(want))) return null;
  const { v, exp } = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  return exp > Date.now() / 1000 ? v : null;
}
function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(/;\s*/).filter(Boolean).map((c) => { const i = c.indexOf("="); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));
}
// The signed-in pro, from the cookie set at the end of the OAuth round trip.
function session(req) { return verify(cookies(req).nj); }
function setSession(res, accountId) {
  res.setHeader("Set-Cookie", `nj=${encodeURIComponent(signed(accountId, 30 * 86400))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 86400}`);
}

async function tokenCall(form) {
  const r = await fetch("https://api.getjobber.com/api/oauth/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: need("JOBBER_CLIENT_ID"), client_secret: need("JOBBER_CLIENT_SECRET"), ...form }).toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`jobber token: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
}

async function gqlRaw(access, query, variables) {
  const r = await fetch(JOBBER_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "X-JOBBER-GRAPHQL-VERSION": JOBBER_VERSION, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}

// A Jobber client bound to one stored pro: refreshes (rotating) and re-seals the token as needed.
function jobberFor(pro) {
  let tok = unseal(pro.token);
  async function fresh() {
    if (tok.exp - Date.now() > 120000) return tok.access;
    tok = await tokenCall({ grant_type: "refresh_token", refresh_token: tok.refresh });
    await d1("UPDATE pros SET token=? WHERE account_id=?", [seal(tok), pro.account_id]);
    return tok.access;
  }
  return async function gql(query, variables) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { status, j } = await gqlRaw(await fresh(), query, variables);
      const throttled = (j.errors || []).some((e) => /throttl/i.test(e.message || e.extensions?.code || ""));
      if (status === 401 && attempt === 0) { tok.exp = 0; continue; }
      if (throttled) { await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); continue; }
      if (j.errors) throw new Error(`jobber gql: ${JSON.stringify(j.errors).slice(0, 400)}`);
      return j.data;
    }
    throw new Error("jobber gql: throttled");
  };
}

async function event(accountId, kind, detail) {
  await d1("INSERT INTO events (at, account_id, kind, detail) VALUES (?,?,?,?)", [new Date().toISOString(), accountId, kind, String(detail || "").slice(0, 2000)]).catch(() => {});
}

function html(res, code, body) { res.statusCode = code; res.setHeader("content-type", "text/html; charset=utf-8"); res.end(body); }
function json(res, code, obj) { res.statusCode = code; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(obj)); }
function redirect(res, to) { res.statusCode = 302; res.setHeader("Location", to); res.end(); }

module.exports = { SITE, DRAFT_ACCOUNT_LIMIT, TRIAL_DAYS, PRICE_USD, STRIPE_PRICE, stripe, need, d1, seal, unseal, signed, verify, cookies, session, setSession, tokenCall, gqlRaw, jobberFor, event, html, json, redirect };
