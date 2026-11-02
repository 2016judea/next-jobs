# Next Jobs

**Live:** https://next-jobs-permits.vercel.app

A Jobber app that turns the Minneapolis building-permit register into new requests inside a
home-service pro's Jobber account.

On connect it reads the pro's own Jobber (job, quote and request wording, the account's industry, and
the map coordinates of their client properties) to learn what they sell and where they work. Every
morning it reads the city's permits from the last 14 days and creates a Jobber client, property,
request and pinned note for each permit that fits:

- **Work after** a permit: a new roof means gutters, a remodel means electrical and paint, a solar
  permit means a roofer should look first.
- **Same trade** nearby: that job is likely sold, and every request says so. The neighbors are the lead.
- **Your clients' block**: a competitor permit within three blocks of 3+ existing clients.

Matching is a join (permit trade x follow-on table x distance). No model writes or picks a match.
The client is named from the Hennepin County owner record, or "Homeowner" for trusts, companies and
blanks. Jobber stamps the request source as "Next Jobs", which is how use gets measured.

$29 a month after 7 free days of matches (Stripe, Brick & Mortar account). Minneapolis only.

## Layout

| path | what |
|---|---|
| `DATA_MODEL.md` | the ideal model, written first, and the field-by-field reality check |
| `site/lib/match.js` | the matcher: permit trade, follow-on table, owner-name rule, trade and area inference |
| `site/api/_learn.js` | reads a pro's Jobber and stores trades + service area |
| `site/api/_run.js` | reads the live register + Hennepin parcels, creates clients/requests/notes |
| `site/api/{connect,callback,webhook,disconnect}.js` | OAuth (PKCE), APP_DISCONNECT (HMAC), in-app disconnect |
| `site/api/{me,subscribe,run,sample}.js` | account page API, Stripe checkout, daily cron, the landing page's live example |
| `pages/*.html` + `scripts/build_pages.py` | page sources; the generator writes `site/public/` (never edit that) |
| `listing/` | Marketplace copy, logo and gallery |
| `schema.sql` | Cloudflare D1 schema (database `next-jobs`) |

## Run, test, deploy

    node --test test/*.test.js                      # matcher rules
    node scripts/run_local.js --dry --limit 5       # learn + dry-run the newest connected pro
    python3 scripts/build_pages.py                  # pages/ -> site/public/
    set -a; . ~/Desktop/bricks/.env; set +a
    python3 scripts/deploy.py                       # REST deploy, exits non-zero unless READY
    python3 scripts/vercel_env.py KEY ...           # push env vars from .env / bricks .env

The cron (`vercel.json`) hits `/api/run` at 13:00 UTC with `Authorization: Bearer $CRON_SECRET`.
`/api/run?account=<id>&dry=1` with the same header dry-runs one pro.

Secrets live in `.env` (gitignored): Jobber client id/secret, developer and tester logins,
`ACCESS_SECRET` (token sealing), `CRON_SECRET`. Cloudflare and Stripe keys come from `bricks/.env`.

## Jobber rules this respects

- Draft apps may connect at most 5 Jobber accounts: the callback sends a 6th to `/waitlist`.
- No public announcement before Jobber approves the app.
- Refresh token rotation on; every refresh re-seals the new refresh token.

## Data

City of Minneapolis CCS_Permits (open data) and Hennepin County LAND_PROPERTY (open data), read live.
Saint Paul stopped publishing permits on 2025-06-30. Electrical permits are issued by the state, not
the city, so electricians get follow-on matches only.

MIT licence.
