#!/usr/bin/env python3
"""Run the API's internal cron routes once, the way Vercel Cron would.

Usage: python3 deploy/forge/cron.py <job|due|all> [--api URL]

  job   one of: mailboxes, rates, telemetry, tracking, archive
  due   the jobs whose schedule (from apps/api/vercel.json) matches this minute
  all   every job, once

Reads CRON_SECRET from ~/.local/share/compai-crm-prod/prod.env and sends it as
`Authorization: Bearer ...`; the secret is never printed. This script schedules
nothing by itself; how it is triggered (systemd timer, cron, loop) is decided
later. Running `due` once a minute reproduces the Vercel schedule.
"""

import datetime
import json
import os
import sys
import urllib.error
import urllib.request

APP_ENV = os.path.expanduser("~/.local/share/compai-crm-prod/prod.env")
DEFAULT_API = "http://127.0.0.1:3101"

# Mirrors apps/api/vercel.json: (path, minute, hour) in cron syntax, limited
# to the forms that file uses: "*", "*/n" and a single number.
JOBS = {
    "mailboxes": ("/internal/sync/mailboxes", "*/5", "*"),
    "rates": ("/internal/sync/rates", "0", "6"),
    "telemetry": ("/internal/telemetry/rollup", "0", "7"),
    "tracking": ("/internal/tracking/retention", "0", "4"),
    "archive": ("/internal/archive/prune", "0", "5"),
}


def cron_secret():
    with open(APP_ENV) as f:
        for line in f:
            key, _, value = line.strip().partition("=")
            if key == "CRON_SECRET":
                return value
    sys.exit("CRON_SECRET is not set in " + APP_ENV)


def field_matches(spec, value):
    if spec == "*":
        return True
    if spec.startswith("*/"):
        return value % int(spec[2:]) == 0
    return int(spec) == value


def is_due(job, now):
    _, minute, hour = JOBS[job]
    return field_matches(minute, now.minute) and field_matches(hour, now.hour)


def run(job, api, secret):
    path = JOBS[job][0]
    request = urllib.request.Request(
        api + path, method="POST",
        headers={"Authorization": f"Bearer {secret}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            status, body = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, body = error.code, error.read()
    except urllib.error.URLError as error:
        status, body = 0, str(error.reason).encode()
    print(json.dumps({"job": job, "path": path, "status": status,
                      "body": body[:500].decode(errors="replace")}))
    return 200 <= status < 300


def main():
    args = sys.argv[1:]
    api = DEFAULT_API
    if "--api" in args:
        api = args[args.index("--api") + 1]
    if not args or args[0] not in (*JOBS, "due", "all"):
        sys.exit(__doc__)

    if args[0] == "all":
        jobs = list(JOBS)
    elif args[0] == "due":
        # Vercel Cron schedules are UTC.
        now = datetime.datetime.now(datetime.timezone.utc)
        jobs = [job for job in JOBS if is_due(job, now)]
    else:
        jobs = [args[0]]

    secret = cron_secret()
    ok = all([run(job, api, secret) for job in jobs])
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
