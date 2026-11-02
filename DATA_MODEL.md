# Data model — Next Jobs (written from the need, before looking at data)

The customer: a home-service pro (roofer, HVAC, plumber, electrician, window,
gutter, insulation, solar, remodeler) who runs their business in Jobber.
The need: *which houses near me are about to need what I sell, and why — inside the
tool I already work in, without a CSV.*

## Entities

### Pro (one connected Jobber account)
| field | question it answers |
|---|---|
| jobber_account_id, name | whose Jobber is this |
| access/refresh token | can we still write to it |
| trades[] | what do they sell (inferred from their own line items / job titles) |
| service_area (centroid + radius, or hull) | where do they work (inferred from their own clients' property addresses) |
| client_points[] (lat/lon per existing property) | where are their existing customers (neighbor marketing) |
| settings: max_per_week, kinds enabled | how much do they want |
| connected_at, trial_ends, subscription | are they paying |

### Permit (one row of the city register)
| field | question it answers |
|---|---|
| permit_number | dedupe key |
| address, lat/lon, parcel_id | where |
| issue_date, status, milestone | when, and is the work done |
| trade (roof, furnace/HVAC, water heater, window, electrical, plumbing, remodel, addition, new build, demolition) | what work |
| work description (cleaned comments) | what exactly |
| applicant company (only when it reads as a company) | who got the job (competitor activity) |

### Parcel (the house)
| field | question it answers |
|---|---|
| parcel_id | join key to permit |
| year_built | how old are the systems |
| owner name (county record) | who to address the request to |
| land use / dwelling type | is it a house |

### Match (a permit put in front of a pro — the product)
| field | question it answers |
|---|---|
| pro, permit | who saw what |
| kind: same_trade / follow_on / neighbor | why it matched |
| reason line | the sentence the pro reads (model may word it; never the source of the match) |
| distance_mi | how far from their area |
| jobber_client_id, jobber_request_id | where it landed in their Jobber |
| created_at | when |
| outcome (request → quote → job, from Jobber) | did it become money (usage measurement) |

## Joins
- permit.parcel_id = parcel.parcel_id (APN = Hennepin PID)
- permit trade × follow-on table → pro.trades (a join, not a model call)
- permit lat/lon within pro.service_area; neighbor = permit within N metres of ≥3 pro.client_points
- match.jobber_request_id → Jobber request → quote/job status (outcome)

## Reality check (filled in after writing the above)

Checked 2026-11-02, field by field:

| field | source | filled? |
|---|---|---|
| pro.trades | Jobber jobs/quotes/requests wording + `account.industry` | yes (test account: roofing, gutters) |
| pro.service_area, client_points | Jobber `properties.address.coordinates` (Jobber geocodes them) | yes, 12/12 |
| permit.* | CCS_Permits FeatureServer, live; ~600 residential rows/week, newest 2026-10-30 | yes; `value` empty (not in model) |
| permit.trade | permitType/workType + comments keywords | 775/778 leads classified (2 weeks) |
| permit.applicant company | applicantName, shown only when it reads as a company | yes |
| parcel.owner, year_built, zip | Hennepin LAND_PROPERTY layer 1, live, by PID | yes |
| match.outcome | Jobber request -> quotes/jobs | reachable via `Request.quotes/jobs`; not yet read (needs a few weeks of use) |
| electrical permits | not in the city register (Minnesota DLI issues them) | no: electricians get follow-on matches only |

Spread (the one fact the build depends on): matches per trade, citywide, last 14 days: roofing 234,
heating & cooling 361, gutters 235, painting 240, electrical 130, cleaning 111, landscaping 40.
