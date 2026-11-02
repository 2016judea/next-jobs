# Jobber App Marketplace listing (as entered in the Developer Center, app id MTY3NDgy)

**App name:** Next Jobs
**Developer:** Brick & Mortar
**Callback:** https://next-jobs-permits.vercel.app/api/callback
**Manage App URL:** https://next-jobs-permits.vercel.app/manage
**Terms / Privacy:** /terms, /privacy
**Scopes:** Clients read+write, Requests read+write, Quotes read, Jobs read
**Webhook:** APP_DISCONNECT -> /api/webhook (HMAC verified). Refresh token rotation: ON.

## Short description (350 max)
Next Jobs reads the Minneapolis building-permit register every day and puts the permits that fit your trade and service area into Jobber as new requests. It learns your trades and where you work from your own jobs and clients, then flags follow-on work (a new roof means gutters), and competitor jobs on your clients' blocks.

## Features & benefits (125 max each)
1. New requests in Jobber every morning from Minneapolis building permits. No CSV imports.
2. Learns your trades and service area from your own Jobber jobs and clients. You can correct it.
3. Follow-on work: a new roof, furnace or remodel permit flags the next trade that house will need.
4. Neighbor alerts: a competitor permit on a block where you already have clients.
5. Every request says why it matched, and that the permitted job itself is likely already sold.

## Images
- `logo-768.png` (square, uploaded)
- `gallery-1..4-*.png` (1440x900, uploaded). Owner names in the Jobber screenshots are replaced with
  "Homeowner" before capture: county owner names go into the pro's private Jobber, never into a public image.

## For the review team
- Test account: Next Jobs Test Roofing (Jobber developer test account, aidan@brickandmortar.dev; password in next-jobs/.env).
- Connect: Marketplace "Connect" or https://next-jobs-permits.vercel.app/api/connect. First run sends up to 5 requests.
- Disconnect: Marketplace (APP_DISCONNECT webhook) or the button on /manage (appDisconnect mutation). Both verified 2026-11-02.
