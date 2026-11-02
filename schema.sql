CREATE TABLE IF NOT EXISTS pros (
  account_id TEXT PRIMARY KEY, name TEXT, token TEXT, active INTEGER DEFAULT 1,
  trades TEXT, trades_source TEXT, area TEXT, client_points TEXT,
  max_per_week INTEGER DEFAULT 25, paused INTEGER DEFAULT 0,
  connected_at TEXT, trial_ends TEXT, stripe_customer TEXT, stripe_subscription TEXT, sub_status TEXT,
  last_run TEXT, disconnected_at TEXT);
CREATE TABLE IF NOT EXISTS matches (
  account_id TEXT, permit_number TEXT, kind TEXT, trade TEXT, reason TEXT, address TEXT, distance_mi REAL,
  jobber_client_id TEXT, jobber_request_id TEXT, created_at TEXT, error TEXT,
  PRIMARY KEY (account_id, permit_number));
CREATE TABLE IF NOT EXISTS events (at TEXT, account_id TEXT, kind TEXT, detail TEXT);
