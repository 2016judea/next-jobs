// OAuth callback: code -> tokens -> account -> stored pro -> learn trades + area -> first matches -> /connected.
const { SITE, DRAFT_ACCOUNT_LIMIT, TRIAL_DAYS, d1, seal, verify, cookies, setSession, tokenCall, gqlRaw, event, html, redirect } = require("./_lib");
const { learnPro } = require("./_learn");
const { runPro } = require("./_run");

module.exports = async (req, res) => {
  const u = new URL(req.url, SITE);
  const code = u.searchParams.get("code");
  if (!code) return redirect(res, "/?error=" + encodeURIComponent(u.searchParams.get("error") || "no_code"));
  const form = { grant_type: "authorization_code", code, redirect_uri: `${SITE}/api/callback` };
  const st = u.searchParams.get("state");
  if (st) {
    const o = verify(cookies(req).njo);
    if (!o || o.state !== st) return html(res, 400, "<p>That sign-in link expired. <a href='/api/connect'>Connect again</a>.</p>");
    form.code_verifier = o.verifier;
  }
  let tok;
  try { tok = await tokenCall(form); } catch (e) { await event(null, "token_error", e.message); return html(res, 502, `<p>Jobber didn't accept the sign-in (${e.message.slice(0, 120)}). <a href='/api/connect'>Try again</a>.</p>`); }
  const { j } = await gqlRaw(tok.access, "{ account { id name } }");
  const acct = j.data?.account;
  if (!acct) return html(res, 502, "<p>Connected, but Jobber didn't return the account. <a href='/api/connect'>Try again</a>.</p>");

  const existing = (await d1("SELECT account_id FROM pros WHERE account_id=?", [acct.id]))[0];
  if (!existing) {
    const n = (await d1("SELECT COUNT(*) AS n FROM pros WHERE active=1"))[0].n;
    if (n >= DRAFT_ACCOUNT_LIMIT) { await event(acct.id, "waitlisted", acct.name); return redirect(res, "/waitlist"); }
  }
  const now = new Date();
  const trialEnds = new Date(now.getTime() + TRIAL_DAYS * 86400000).toISOString();
  await d1(`INSERT INTO pros (account_id, name, token, active, connected_at, trial_ends) VALUES (?,?,?,1,?,?)
    ON CONFLICT(account_id) DO UPDATE SET name=excluded.name, token=excluded.token, active=1, disconnected_at=NULL`,
    [acct.id, acct.name, seal(tok), now.toISOString(), trialEnds]);
  await event(acct.id, "connected", acct.name);
  setSession(res, acct.id);
  try {
    await learnPro(acct.id);
    await runPro(acct.id, { limit: 5 });
  } catch (e) { await event(acct.id, "first_run_error", e.stack || e.message); }
  redirect(res, "/manage?welcome=1");
};
