# Comp AI CRM on Forge: private production stack

Rootless podman, one pod, three long-running containers. All of it is loopback-only.

| Container | Image (pinned) | Runs | Host port |
| --- | --- | --- | --- |
| `compai-prod-db` | `postgres@sha256:266d3c25…` (17-alpine) | Postgres 17, volume `compai-prod-pgdata` | `127.0.0.1:55433` |
| `compai-prod-api` | `oven/bun@sha256:5ff60936…` (1.4.0) | `bun dist/main.js` | `127.0.0.1:3101` |
| `compai-prod-app` | `node@sha256:4b150b48…` (22-bookworm-slim) | `next start` | `127.0.0.1:3100` |

Every container has `--restart unless-stopped`, memory, CPU and pids limits, and a healthcheck. Telemetry is off: `CRM_TELEMETRY_DISABLED`, `DO_NOT_TRACK`, `NEXT_TELEMETRY_DISABLED` and `TURBO_TELEMETRY_DISABLED` are all set. The pod's DNS is blackholed (`127.0.0.9`), because nothing in this slice needs egress. Remove `--dns` in `stack.py` when Gmail sync, FX rates or the agent go live.

Code runs from the worktree, which is mounted at `/work`. The containers do not bake an image.

## Secrets

`python3 deploy/forge/stack.py secrets` writes two files to `~/.local/share/compai-crm-prod/`. The directory is `0700` and the files are `0600`.

- `pg.env` holds the Postgres credentials.
- `prod.env` holds `DATABASE_URL`, `BETTER_AUTH_SECRET`, `CRON_SECRET`, `AGENT_BRIDGE_SECRET`, `ALLOWED_SIGN_IN`, `API_URL`, `APP_URL` and the telemetry flags.

The command never overwrites existing files. Containers get secrets only through `--env-file`, so none of them appear in `ps`, in argv, or in script output.

## Bring-up from scratch

```
python3 deploy/forge/stack.py secrets
python3 deploy/forge/stack.py pod
python3 deploy/forge/stack.py db
python3 deploy/forge/stack.py migrate      # prisma migrate deploy
python3 deploy/forge/stack.py seed         # sample data; skip on a real install
python3 deploy/forge/stack.py build-api    # bun build, --network none
python3 deploy/forge/stack.py build-app    # next build on Node 22, --network none, detached
python3 deploy/forge/stack.py logs compai-prod-build-app   # repeat until "exited 0"
python3 deploy/forge/stack.py api
python3 deploy/forge/stack.py app
python3 deploy/forge/verify.py             # evidence -> .qa/prod-proof.json
```

On later starts, `up` runs pod, db, api and app. `down` removes the containers and the pod, and keeps the volume.

Build notes:

- **No network at build.** Both builds run with `--network none`, so a successful build proves that nothing is fetched. The Geist fonts are vendored in `apps/app/app/fonts/` (geist@1.9.0, SIL OFL) and load through `next/font/local`.
- **Worker count.** By default `next build` starts one worker per host CPU (36 here). Each worker spawns Rust threads, which exhausts the pids limit. The build therefore runs under `taskset -c 0-3`. It uses `taskset` rather than `--cpuset-cpus` because the rootless cgroup here delegates only cpu, memory and pids.
- **Pre-staged `node_modules`.** The builds assume a `node_modules` that is already installed (bun, isolated linker) and a generated Prisma client. On a fresh checkout, run `bun install` first, with network allowed for that step only.

## Scheduler

`deploy/forge/cron.py` stands in for Vercel Cron (`apps/api/vercel.json`). It POSTs to the API's `/internal/*` routes on loopback, with `Authorization: Bearer $CRON_SECRET` read from `prod.env`.

```
python3 deploy/forge/cron.py rates     # one job: mailboxes | rates | telemetry | tracking | archive
python3 deploy/forge/cron.py due       # the jobs whose UTC schedule matches this minute
python3 deploy/forge/cron.py all       # everything, once
```

Running `due` once a minute reproduces the upstream schedule. Mailbox sync runs every 5 minutes, and rates, retention, archive pruning and the telemetry rollup run daily. This slice deliberately sets up **no** trigger: no cron, no systemd timer, no loop container. Choosing one is a separate decision.

## Public origin (planned, not enabled)

The target is `https://forge-precision-7920-tower.tail0fa6dc.ts.net:8443`, with the API on the **same host**. There are no subdomains, so no `AUTH_COOKIE_DOMAIN` is needed.

The app already routes this way:

- The browser only calls its own origin. The tRPC client uses `/api/trpc`, and the Better Auth client uses `window.location.origin`.
- `apps/app/app/api/[...path]/route.ts` proxies every `/api/*` request, including `/api/auth/*`, to the API on the server side. It passes redirects and every `Set-Cookie` header through unchanged.

**Choice: no Caddy.** Tailscale serve terminates TLS on `:8443` and forwards everything to `127.0.0.1:3100`. To cut over:

1. In `prod.env`, set `API_URL` and `APP_URL` to the public origin. These are what the API uses for Better Auth's `baseURL`, its trusted origins and the OAuth callbacks (`<origin>/api/auth/callback/google`). Then restart the API (`stack.py api`).
2. The app needs **no rebuild**. `build-app` pins the inlined `API_URL` to the in-pod `http://127.0.0.1:3101`, which is the server-side target of the proxy, so the app never makes a hairpin call through the public origin.
3. Add the Google OAuth client (Internal on Workspace), then set `ALLOWED_SIGN_IN` to the real domain.

Consequences:

- `/internal/*` (cron) and the Swagger UI at the API root stay unreachable from outside, because only the app port is served.
- Through `/api/*` the API sees the app's IP rather than the client's. The demo sign-in, the one route rate-limited by IP, goes through `apps/app/app/demo/session/route.ts` instead. That route forwards `X-Forwarded-For` unchanged and appends nothing. On the path browser → Funnel → app → API, only Funnel appends to it, so `TRUST_PROXY_HOPS=1` keys the limit on the address Funnel saw.
- If either of these becomes a problem, a small Caddy can send `/api/*` straight to `:3101`, with no change to the env.

## Public demo: reset before exposure and nightly

```
python3 deploy/forge/stack.py reset-demo
```

This runs `reset-db`: it stops the api and app, recreates the database, then migrates and reseeds it. Next it rotates `BETTER_AUTH_SECRET` in `prod.env`, and runs an explicit, counted delete of the demo user's sessions and API keys. Last, it starts the api and app again.

Recreating the database drops the session rows, but that alone is not enough. Better Auth's cookie cache (5 minutes) keeps honouring a signed session cookie without checking the database. Rotating the secret is what ends every visitor's session immediately. The demo has no real users, so nothing else depends on the old secret.

Run it once right before switching the public link on, then nightly while the demo is public. This slice sets up no scheduler (see Scheduler). A nightly trigger is a separate decision, for example a systemd user timer that runs the command above. Every run interrupts sign-in for about a minute.

Every step must succeed. If stopping a container, `dropdb`, `createdb`, migrate, seed or the revoke fails, the command stops there, before the secret is rotated or anything restarts. The api and app are left stopped, so a "reset" never comes back up on old or empty data. Fix the cause and run it again; it is safe to repeat.

## Public demo: switching it off

```
python3 deploy/forge/stack.py disable-demo
```

Do not just edit `DEMO_LOGIN_ENABLED` by hand. A demo session can outlive the flag (2 hours, kept alive by the 5-minute cookie cache), and `disable-demo` ends it. It runs these steps in order:

1. Stop the app and the API, so nothing is served while the rest changes.
2. Set `DEMO_LOGIN_ENABLED=false` in `prod.env`.
3. Rotate `BETTER_AUTH_SECRET`. Every cookie that was signed before is now void.
4. Delete the demo user's sessions and API keys, and print the counts.
5. Start the API and the app again.

It stops at the first failure and leaves the api and app stopped. Because the stop comes first and the start comes last, the demo is never served unguarded at any point.

There is a second line of defence. The guards (the Better Auth `demoGuard`, the tRPC `DemoGuardMiddleware` and the eve proxy) match the configured `DEMO_LOGIN_EMAIL` whether or not the flag is on. So a demo session that somehow survives still cannot mint keys, change settings or reach REST. Keep `DEMO_LOGIN_EMAIL` set while that account exists. The flag now controls only whether demo sign-in is offered and whether the UI shows demo hints.

`up` and `secrets` reuse an existing `prod.env` as it is, so they never switch the demo back on. To turn it on again, run `demo-env` and then `reset-demo`.

## Not in this slice

- The agent (`apps/agent`). Steel is doing the Anthropic provider swap in parallel.
- Backups.
- Tailscale exposure.
- Real sign-in. No Google, Microsoft or SSO method is configured, and the sign-in page says so.
- A restart policy that survives a host reboot. In rootless podman, `unless-stopped` does not survive a reboot without a systemd unit, and service changes are out of scope here.
