#!/usr/bin/env python3
"""Private production-mode Comp AI CRM stack on Forge (rootless podman).

Usage: python3 deploy/forge/stack.py <command> [...]

  secrets      generate the private env files once (never printed)
  pod          create the loopback-only pod
  db           start Postgres 17
  migrate      prisma migrate deploy (one-off container)
  seed         load the sample data (one-off container)
  demo-env     set the demo keys in an existing prod.env (secrets kept)
  reset-db     stop api/app, recreate the database, migrate, seed
  reset-demo   reset-db, rotate BETTER_AUTH_SECRET, revoke demo sessions and
               API keys, start api/app (before exposure, then nightly)
  build-api    bun build -> apps/api/dist (no network)
  build-app    next build on Node 22, detached (no network); poll with `logs`
  api          start the API (bun dist/main.js)
  app          start the app (next start)
  up           pod + db + api + app (assumes builds exist)
  status       container states and health
  logs <name>  tail a container's logs
  down         stop and remove the containers and pod (keeps the volume)

Secrets live in ~/.local/share/compai-crm-prod/ (0700 dir, 0600 files) and
are passed with --env-file, so they never appear on a command line or in output.
"""

import base64
import os
import secrets
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PRIV = os.path.expanduser("~/.local/share/compai-crm-prod")
PG_ENV = os.path.join(PRIV, "pg.env")
APP_ENV = os.path.join(PRIV, "prod.env")

PG_IMAGE = "docker.io/library/postgres@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b"
BUN_IMAGE = "docker.io/oven/bun@sha256:5ff609364c049b54eb0ff560ec96319729a972078ef2c755d758f0c6ef89c2d6"
NODE_IMAGE = "docker.io/library/node@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da"

POD = "compai-prod-pod"
DB, API, APP = "compai-prod-db", "compai-prod-api", "compai-prod-app"
VOLUME = "compai-prod-pgdata"
DB_PORT, API_PORT, APP_PORT = 55433, 3101, 3100

# Loopback for this slice. API_URL/APP_URL in prod.env are the origins the
# browser sees (Better Auth's baseURL, OAuth callbacks, trusted origins); the
# public cutover changes them there and restarts the API (README.md).
API_URL = f"http://127.0.0.1:{API_PORT}"
APP_URL = f"http://127.0.0.1:{APP_PORT}"
# Next inlines API_URL at build time as the server-side target of its /api/*
# proxy and SSR tRPC calls. The browser only ever calls its own origin, so
# this stays the in-pod address whatever the public origin is.
INTERNAL_API_URL = f"http://127.0.0.1:{API_PORT}"

# Public demo instance (synthetic .test addresses only). The demo user signs
# in as a member through POST /demo/session on the app origin (the app
# forwards it to the API in-pod); the owner is seeded and never
# signs in. ALLOWED_SIGN_IN names exactly these two addresses. The agent stays
# off: no ANTHROPIC_API_KEY here.
DEMO_LOGIN_EMAIL = "demo@saint-canyon.test"
DEMO_SEED_OWNER_EMAIL = "owner@saint-canyon.test"
ALLOWED_SIGN_IN = f"{DEMO_LOGIN_EMAIL},{DEMO_SEED_OWNER_EMAIL}"
DEMO_ENV = {
    "DEMO_LOGIN_ENABLED": "true",
    "DEMO_LOGIN_EMAIL": DEMO_LOGIN_EMAIL,
    "DEMO_SEED_OWNER_EMAIL": DEMO_SEED_OWNER_EMAIL,
    "ALLOWED_SIGN_IN": ALLOWED_SIGN_IN,
    # Funnel -> app -> API. Funnel appends the client IP to X-Forwarded-For;
    # the app's /demo/session route forwards the header unchanged and appends
    # nothing, so exactly one hop appends.
    "TRUST_PROXY_HOPS": "1",
    "CRM_TELEMETRY_DISABLED": "1",
}

TELEMETRY_OFF = [
    "-e", "CRM_TELEMETRY_DISABLED=1",
    "-e", "DO_NOT_TRACK=1",
    "-e", "NEXT_TELEMETRY_DISABLED=1",
    "-e", "TURBO_TELEMETRY_DISABLED=1",
]

LIMITS = {
    DB: ["--memory", "1g", "--cpus", "1", "--pids-limit", "256"],
    API: ["--memory", "1g", "--cpus", "1", "--pids-limit", "256"],
    APP: ["--memory", "1536m", "--cpus", "2", "--pids-limit", "512"],
}


def sh(cmd, timeout=160, quiet=False):
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if not quiet:
        print(f">> {' '.join(cmd[:3])} ... exit {r.returncode}")
        if r.returncode != 0:
            print(r.stderr[-1500:].strip())
    return r


def write_private(path, lines):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write("\n".join(lines) + "\n")
    os.chmod(path, 0o600)


def cmd_secrets():
    os.makedirs(PRIV, mode=0o700, exist_ok=True)
    os.chmod(PRIV, 0o700)
    if os.path.exists(APP_ENV) and os.path.exists(PG_ENV):
        print("private env files exist; reusing")
        cmd_demo_env()
        return
    pg_password = secrets.token_hex(24)
    write_private(PG_ENV, [
        "POSTGRES_USER=postgres",
        f"POSTGRES_PASSWORD={pg_password}",
        "POSTGRES_DB=crm",
    ])
    write_private(APP_ENV, [
        "NODE_ENV=production",
        f"DATABASE_URL=postgresql://postgres:{pg_password}@127.0.0.1:5432/crm?schema=public",
        f"BETTER_AUTH_SECRET={base64.b64encode(secrets.token_bytes(32)).decode()}",
        f"CRON_SECRET={secrets.token_hex(32)}",
        f"AGENT_BRIDGE_SECRET={base64.b64encode(secrets.token_bytes(32)).decode()}",
        f"API_URL={API_URL}",
        f"APP_URL={APP_URL}",
        "DO_NOT_TRACK=1",
        "NEXT_TELEMETRY_DISABLED=1",
        *(f"{k}={v}" for k, v in DEMO_ENV.items()),
    ])
    print("generated private env files (values not printed)")


def cmd_demo_env():
    """Set the demo keys in an existing prod.env, keeping its secrets."""
    with open(APP_ENV) as f:
        lines = f.read().splitlines()
    kept = [l for l in lines if l.split("=", 1)[0] not in DEMO_ENV]
    write_private(APP_ENV, kept + [f"{k}={v}" for k, v in DEMO_ENV.items()])
    print("prod.env demo keys set:", ", ".join(DEMO_ENV))


def cmd_pod():
    if sh(["podman", "pod", "exists", POD], quiet=True).returncode == 0:
        print("pod exists")
        return
    # DNS is blackholed: nothing in this slice needs egress (no mailbox
    # providers, no agent). Drop --dns when Gmail sync or FX rates go live.
    sh([
        "podman", "pod", "create", "--name", POD,
        "-p", f"127.0.0.1:{DB_PORT}:5432",
        "-p", f"127.0.0.1:{API_PORT}:{API_PORT}",
        "-p", f"127.0.0.1:{APP_PORT}:{APP_PORT}",
        "--dns", "127.0.0.9",
    ])


def exists(name):
    return sh(["podman", "container", "exists", name], quiet=True).returncode == 0


def cmd_db():
    if exists(DB):
        sh(["podman", "start", DB])
    else:
        sh([
            "podman", "run", "-d", "--name", DB, "--pod", POD,
            "--restart", "unless-stopped", *LIMITS[DB],
            "--env-file", PG_ENV,
            "-v", f"{VOLUME}:/var/lib/postgresql/data",
            "--health-cmd", "pg_isready -U postgres -d crm",
            "--health-interval", "10s", "--health-retries", "5",
            PG_IMAGE,
        ])
    for _ in range(30):
        r = sh(["podman", "exec", DB, "pg_isready", "-U", "postgres", "-d", "crm"], quiet=True)
        if r.returncode == 0:
            print("pg_isready:", r.stdout.strip())
            return
        time.sleep(2)
    sys.exit("postgres did not become ready")


def oneoff(name, image, workdir, script, network="pod", detach=False, timeout=160, limits=()):
    sh(["podman", "rm", "-f", name], quiet=True)
    cmd = ["podman", "run", "--name", name, *limits]
    cmd += ["--pod", POD] if network == "pod" else ["--network", "none"]
    cmd += ["--env-file", APP_ENV, *TELEMETRY_OFF, "-v", f"{ROOT}:/work", "-w", f"/work/{workdir}"]
    cmd += ["-d"] if detach else []
    cmd += [image, "sh", "-c", script]
    r = sh(cmd, timeout=timeout)
    print(r.stdout[-4000:])
    if not detach:
        sh(["podman", "rm", "-f", name], quiet=True)
    return r


def cmd_migrate():
    oneoff("compai-prod-migrate", BUN_IMAGE, "packages/db",
           "./node_modules/.bin/prisma migrate deploy")


def cmd_seed():
    # The seed resolves favicons over the network; with DNS blackholed those
    # lookups fail fast and companies keep initials.
    oneoff("compai-prod-seed", BUN_IMAGE, "packages/db", "bun prisma/seed.ts")


def cmd_reset_db():
    # Synthetic data only: stop the API and app, recreate the database, then
    # migrate and seed. prod.env carries DEMO_SEED_OWNER_EMAIL, so the seed
    # adds the demo owner and hands the demo user its share of deals.
    for name in (APP, API):
        sh(["podman", "stop", "-t", "10", name])
    sh(["podman", "exec", DB, "dropdb", "-U", "postgres", "--if-exists", "--force", "crm"])
    sh(["podman", "exec", DB, "createdb", "-U", "postgres", "crm"])
    cmd_migrate()
    cmd_seed()


# Run before exposing the demo and nightly while it is public. Recreating the
# database already drops every session and API key, but Better Auth's cookie
# cache (packages/auth, 5 minutes) keeps honouring a signed session cookie
# without asking the database. Rotating BETTER_AUTH_SECRET is what ends a
# visitor's session at once; the SQL is the explicit, counted revoke.
REVOKE_DEMO_SQL = f"""
WITH demo AS (SELECT id FROM "user" WHERE lower(email) = lower('{DEMO_LOGIN_EMAIL}')),
     sessions AS (DELETE FROM "session" WHERE "userId" IN (SELECT id FROM demo) RETURNING 1),
     keys AS (DELETE FROM "apikey" WHERE "referenceId" IN (SELECT id FROM demo) RETURNING 1)
SELECT (SELECT count(*) FROM sessions) || ' session(s), '
    || (SELECT count(*) FROM keys) || ' API key(s) revoked for the demo user';
"""


def rotate_auth_secret():
    with open(APP_ENV) as f:
        lines = f.read().splitlines()
    kept = [l for l in lines if l.split("=", 1)[0] != "BETTER_AUTH_SECRET"]
    write_private(APP_ENV, kept + [
        f"BETTER_AUTH_SECRET={base64.b64encode(secrets.token_bytes(32)).decode()}",
    ])
    print("BETTER_AUTH_SECRET rotated (value not printed); every signed-in cookie is void")


def cmd_reset_demo():
    cmd_reset_db()
    rotate_auth_secret()
    r = sh(["podman", "exec", DB, "psql", "-U", "postgres", "-d", "crm", "-At",
            "-v", "ON_ERROR_STOP=1", "-c", REVOKE_DEMO_SQL], quiet=True)
    print(r.stdout.strip() or r.stderr.strip()[-500:])
    if r.returncode != 0:
        sys.exit("demo revoke failed; api and app left stopped")
    cmd_api()
    cmd_app()


def cmd_build_api():
    oneoff("compai-prod-build-api", BUN_IMAGE, "apps/api", "bun run build", network="none")


def cmd_build_app():
    # --network none proves the build fetches nothing (fonts are self-hosted).
    # Next sizes its worker pool from the visible CPUs; on this 36-core host
    # that exhausts the pids limit, so the build sees four. (taskset, not
    # --cpuset-cpus: rootless podman here has no cpuset controller.)
    oneoff("compai-prod-build-app", NODE_IMAGE, "apps/app",
           "exec taskset -c 0-3 ./node_modules/.bin/next build", network="none", detach=True,
           limits=["--cpus", "4", "--memory", "6g", "--pids-limit", "4096",
                   "-e", f"API_URL={INTERNAL_API_URL}"])
    print("detached; poll: python3 deploy/forge/stack.py logs compai-prod-build-app")


def run_service(name, image, workdir, port, script, health):
    sh(["podman", "rm", "-f", name], quiet=True)
    sh([
        "podman", "run", "-d", "--name", name, "--pod", POD,
        "--restart", "unless-stopped", *LIMITS[name],
        "--env-file", APP_ENV, *TELEMETRY_OFF, "-e", f"PORT={port}",
        "-v", f"{ROOT}:/work", "-w", f"/work/{workdir}",
        "--health-cmd", health, "--health-interval", "30s",
        "--health-retries", "3", "--health-start-period", "60s",
        image, "sh", "-c", script,
    ])


def cmd_api():
    run_service(
        API, BUN_IMAGE, "apps/api", API_PORT, "exec bun dist/main.js",
        f"bun -e \"const r=await fetch('http://127.0.0.1:{API_PORT}/health');process.exit(r.ok?0:1)\"",
    )


def cmd_app():
    run_service(
        APP, NODE_IMAGE, "apps/app", APP_PORT,
        f"exec ./node_modules/.bin/next start -H 0.0.0.0 -p {APP_PORT}",
        f"node -e \"fetch('http://127.0.0.1:{APP_PORT}/sign-in').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))\"",
    )


def cmd_up():
    cmd_secrets()
    cmd_pod()
    cmd_db()
    cmd_api()
    cmd_app()


def cmd_status():
    r = sh(["podman", "ps", "-a", "--filter", "name=compai-prod",
            "--format", "{{.Names}}\t{{.Status}}\t{{.Ports}}"], quiet=True)
    print(r.stdout)


def cmd_logs(name):
    r = sh(["podman", "logs", "--tail", "60", name], quiet=True)
    print(r.stdout[-5000:])
    print(r.stderr[-5000:])
    st = sh(["podman", "inspect", "-f", "{{.State.Status}} exit={{.State.ExitCode}}", name], quiet=True)
    print("state:", st.stdout.strip())


def cmd_down():
    for name in (APP, API, DB):
        sh(["podman", "rm", "-f", "-t", "10", name])
    sh(["podman", "pod", "rm", "-f", POD])


COMMANDS = {
    "secrets": cmd_secrets, "pod": cmd_pod, "db": cmd_db, "migrate": cmd_migrate,
    "seed": cmd_seed, "demo-env": cmd_demo_env, "reset-db": cmd_reset_db, "reset-demo": cmd_reset_demo,
    "build-api": cmd_build_api, "build-app": cmd_build_app,
    "api": cmd_api, "app": cmd_app, "up": cmd_up, "status": cmd_status,
    "down": cmd_down,
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or (sys.argv[1] not in COMMANDS and sys.argv[1] != "logs"):
        sys.exit(__doc__)
    if sys.argv[1] == "logs":
        cmd_logs(sys.argv[2])
    else:
        COMMANDS[sys.argv[1]]()
