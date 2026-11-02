#!/usr/bin/env python3
"""Upsert env vars on the next-jobs Vercel project, by name, from next-jobs/.env then bricks/.env.

    python3 scripts/vercel_env.py JOBBER_CLIENT_ID JOBBER_CLIENT_SECRET ...
"""
import json, os, sys, urllib.request
from pathlib import Path

TEAM = "team_XnhPzBEcaSfEmZFo9M2isLFY"
PROJECT = "prj_IgvRR9X3VOOWj7fQdEjQzAHYHYmV"
ROOT = Path(__file__).resolve().parent.parent


def env_files():
    out = {}
    for f in (Path.home() / "Desktop/bricks/.env", ROOT / ".env"):
        for line in f.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                out[k.strip().removeprefix("export ").strip()] = v.strip().strip('"').strip("'")
    return out


def main(keys):
    local = env_files()
    for k in keys:
        body = {"key": k, "value": local[k], "type": "encrypted", "target": ["production", "preview", "development"]}
        req = urllib.request.Request(f"https://api.vercel.com/v10/projects/{PROJECT}/env?teamId={TEAM}&upsert=true", method="POST",
                                     data=json.dumps(body).encode(), headers={"Authorization": f"Bearer {os.environ['VERCEL_TOKEN']}", "content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as r:
            print(k, r.status)


if __name__ == "__main__":
    main(sys.argv[1:])
