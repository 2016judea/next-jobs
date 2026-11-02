// Start the OAuth round trip from our own site (the Marketplace "Connect" button skips this and
// lands on /api/callback with no state and no PKCE, which callback.js accepts).
const crypto = require("crypto");
const { SITE, need, signed, redirect } = require("./_lib");

module.exports = async (req, res) => {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("hex");
  res.setHeader("Set-Cookie", `njo=${encodeURIComponent(signed({ state, verifier }, 900))}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=900`);
  const q = new URLSearchParams({ response_type: "code", client_id: need("JOBBER_CLIENT_ID"), redirect_uri: `${SITE}/api/callback`, state, code_challenge: challenge, code_challenge_method: "S256" });
  redirect(res, `https://api.getjobber.com/api/oauth/authorize?${q}`);
};
