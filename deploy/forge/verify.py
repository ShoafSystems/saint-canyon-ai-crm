#!/usr/bin/env python3
"""Verify the private production stack and write evidence as JSON.

Usage: python3 deploy/forge/verify.py [OUTPUT.json]

Checks: container state, healthchecks, restart policy, resource limits,
loopback-only bindings, image digests, seeded row counts, the API health body,
the app's sign-in page body, the app's /api proxy, self-hosted fonts and the
absence of Google Fonts in the build output. Never reads or prints secrets.
"""

import datetime
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stack  # noqa: E402

# A font load: the googleapis stylesheet or a gstatic font file. simple-icons
# ships gstatic product-logo URLs (fonts.gstatic.com/s/i/productlogos/...) as
# inert attribution strings; those are reported, not failed.
GOOGLE_FONTS = re.compile(rb"fonts\.googleapis\.com/css|fonts\.gstatic\.com/s/(?!i/)")
GOOGLE_ANY = re.compile(rb"fonts\.(googleapis|gstatic)\.com")


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=60)


def fetch(url):
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return r.status, r.url, r.read()
    except urllib.error.HTTPError as e:
        return e.code, url, e.read()
    except Exception as e:  # noqa: BLE001
        return 0, url, str(e).encode()


def container(name):
    raw = run(["podman", "inspect", name])
    if raw.returncode != 0:
        return {"exists": False}
    info = json.loads(raw.stdout)[0]
    host = info["HostConfig"]
    health = run(["podman", "healthcheck", "run", name])
    env_keys = [e.split("=", 1)[0] for e in info["Config"]["Env"]]
    return {
        "exists": True,
        "status": info["State"]["Status"],
        "healthcheck": "healthy" if health.returncode == 0 else f"unhealthy: {health.stdout.strip()}{health.stderr.strip()}"[:200],
        "image": info["ImageName"],
        "image_digest_pinned": "@sha256:" in info["ImageName"],
        "restart_policy": host["RestartPolicy"]["Name"],
        "memory_bytes": host["Memory"],
        "nano_cpus": host["NanoCpus"],
        "pids_limit": host["PidsLimit"],
        "telemetry_off": None if name == stack.DB else all(
            k in env_keys for k in ("CRM_TELEMETRY_DISABLED", "DO_NOT_TRACK", "NEXT_TELEMETRY_DISABLED")),
    }


def pod_ports():
    raw = run(["podman", "pod", "inspect", stack.POD])
    if raw.returncode != 0:
        return {"exists": False}
    info = json.loads(raw.stdout)
    info = info[0] if isinstance(info, list) else info
    bindings = info.get("InfraConfig", {}).get("PortBindings", {})
    flat = {port: [f"{b['HostIp']}:{b['HostPort']}" for b in hosts] for port, hosts in bindings.items()}
    return {
        "bindings": flat,
        "loopback_only": all(b.startswith("127.0.0.1:") for hosts in flat.values() for b in hosts),
        "dns": info.get("InfraConfig", {}).get("DNSServer"),
    }


def listeners():
    out = run(["ss", "-ltnH"]).stdout.splitlines()
    wanted = (stack.DB_PORT, stack.API_PORT, stack.APP_PORT)
    found = sorted({line.split()[3] for line in out for p in wanted if line.split()[3].endswith(f":{p}")})
    return {"sockets": found, "loopback_only": bool(found) and all(s.startswith("127.0.0.1:") for s in found)}


def row_counts():
    sql = ("select json_build_object('companies',(select count(*) from company),"
           "'contacts',(select count(*) from contact),'deals',(select count(*) from deal),"
           "'activities',(select count(*) from activity),'users',(select count(*) from \"user\"))")
    r = run(["podman", "exec", stack.DB, "psql", "-U", "postgres", "-d", "crm", "-tAc", sql])
    return json.loads(r.stdout) if r.returncode == 0 else {"error": r.stderr[-300:]}


def app_checks():
    status, final_url, body = fetch(f"{stack.APP_URL}/sign-in")
    html = body.decode(errors="replace")
    text = re.sub(r"<[^>]+>", " ", re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.S))
    text = re.sub(r"\s+", " ", text).strip()
    css_urls = sorted(set(re.findall(r'href="(/_next/static/[^"]+\.css)"', html)))
    woff2 = set()
    google_in_css = False
    for css in css_urls:
        _, _, css_body = fetch(stack.APP_URL + css)
        for ref in re.findall(rb"url\(([^)]+\.woff2)\)", css_body):
            woff2.add(urllib.parse.urljoin(css, ref.decode().strip("\"'")))
        google_in_css = google_in_css or bool(GOOGLE_FONTS.search(css_body))
    font_status = {f: fetch(stack.APP_URL + f)[0] for f in sorted(woff2)}
    root_status, root_url, _ = fetch(f"{stack.APP_URL}/")
    proxy_status, _, proxy_body = fetch(f"{stack.APP_URL}/api/auth/get-session")
    return {
        "sign_in": {
            "status": status,
            "url": final_url,
            "title": (re.search(r"<title>([^<]*)</title>", html) or [None, None])[1],
            "body_text_sample": text[:300],
            "has_known_string": "Comp AI" in html,
        },
        "root_redirect": {"status": root_status, "final_url": root_url},
        "api_proxy_get_session": {"status": proxy_status, "body": proxy_body[:100].decode(errors="replace")},
        "fonts": {
            "self_hosted_woff2": font_status,
            "google_fonts_in_html": bool(GOOGLE_FONTS.search(body)),
            "google_fonts_in_css": google_in_css,
        },
    }


def build_output_clean():
    hits, inert = [], []
    for base in ("apps/app/.next/static", "apps/app/.next/server"):
        for directory, _, files in os.walk(os.path.join(stack.ROOT, base)):
            for f in files:
                path = os.path.join(directory, f)
                with open(path, "rb") as fh:
                    data = fh.read()
                if GOOGLE_FONTS.search(data):
                    hits.append(os.path.relpath(path, stack.ROOT))
                elif GOOGLE_ANY.search(data):
                    inert.append(os.path.relpath(path, stack.ROOT))
    return {"google_font_loads": hits[:20], "inert_gstatic_icon_strings": inert[:20], "clean": not hits}


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(stack.ROOT, ".qa", "prod-proof.json")
    api_status, _, api_body = fetch(f"{stack.API_URL}/health")
    api_log = run(["podman", "logs", stack.API])
    proof = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "git_head": run(["git", "-C", stack.ROOT, "rev-parse", "HEAD"]).stdout.strip(),
        "containers": {n: container(n) for n in (stack.DB, stack.API, stack.APP)},
        "pod": pod_ports(),
        "listeners": listeners(),
        "seed_counts": row_counts(),
        "api_health": {"status": api_status, "body": api_body[:200].decode(errors="replace")},
        "api_production_mode": '"environment":"production"' in api_log.stdout + api_log.stderr,
        "api_telemetry_off_logged": "telemetry is off" in api_log.stdout + api_log.stderr,
        "app": app_checks(),
        "build_output": build_output_clean(),
    }
    proof["checks_pass"] = all([
        all(c.get("status") == "running" and c.get("healthcheck") == "healthy" for c in proof["containers"].values()),
        proof["pod"].get("loopback_only"), proof["listeners"]["loopback_only"],
        proof["api_health"]["status"] == 200 and '"database":"up"' in proof["api_health"]["body"],
        proof["api_production_mode"], proof["api_telemetry_off_logged"],
        proof["app"]["sign_in"]["status"] == 200 and proof["app"]["sign_in"]["has_known_string"],
        proof["app"]["fonts"]["self_hosted_woff2"] and all(s == 200 for s in proof["app"]["fonts"]["self_hosted_woff2"].values()),
        not proof["app"]["fonts"]["google_fonts_in_html"], not proof["app"]["fonts"]["google_fonts_in_css"],
        proof["build_output"]["clean"],
        proof["seed_counts"].get("companies", 0) > 0,
    ])
    os.makedirs(os.path.dirname(out), exist_ok=True)
    existing = {}
    if os.path.exists(out):
        with open(out) as f:
            existing = json.load(f)
    existing["verify"] = proof
    with open(out, "w") as f:
        json.dump(existing, f, indent=2)
    print(json.dumps(proof, indent=2)[:6000])


if __name__ == "__main__":
    main()
