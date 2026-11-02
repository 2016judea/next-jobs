// POST: start a Stripe Checkout subscription for the signed-in pro.  GET ?session_id=: Stripe's return.
const { SITE, STRIPE_PRICE, d1, stripe, session, json, redirect, event } = require("./_lib");

module.exports = async (req, res) => {
  const id = session(req);
  if (!id) return redirect(res, "/api/connect");
  const u = new URL(req.url, SITE);
  const sid = u.searchParams.get("session_id");
  if (sid) {
    const s = await stripe(`checkout/sessions/${encodeURIComponent(sid)}?expand[]=subscription`);
    if (s.client_reference_id === id && s.subscription) {
      await d1("UPDATE pros SET stripe_customer=?, stripe_subscription=?, sub_status=? WHERE account_id=?", [s.customer, s.subscription.id, s.subscription.status, id]);
      await event(id, "subscribed", s.subscription.status);
    }
    return redirect(res, "/manage?subscribed=1");
  }
  const p = (await d1("SELECT name FROM pros WHERE account_id=?", [id]))[0];
  const s = await stripe("checkout/sessions", { method: "POST", form: {
    mode: "subscription", "line_items[0][price]": STRIPE_PRICE, "line_items[0][quantity]": "1", client_reference_id: id,
    "subscription_data[metadata][product]": "next-jobs", "subscription_data[metadata][jobber_account]": p?.name || "",
    "metadata[product]": "next-jobs", allow_promotion_codes: "false",
    success_url: `${SITE}/api/subscribe?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${SITE}/manage` } });
  json(res, 200, { ok: true, url: s.url });
};
