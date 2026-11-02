#!/usr/bin/env python3
"""Order and fail-fast checks for stack.py. Runs no podman: subprocess.run is
replaced by a recorder, and prod.env lives in a temporary directory.

python3 -I deploy/forge/test_stack.py
"""

import importlib.util
import os
import subprocess
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("stack", os.path.join(HERE, "stack.py"))
stack = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stack)

OLD_SECRET = "BETTER_AUTH_SECRET=old-test-value"


class Recorder:
    """Stands in for subprocess.run. Each call is logged as (label, flag) where
    flag is DEMO_LOGIN_ENABLED in prod.env at that moment."""

    def __init__(self, env_path, fail_on=()):
        self.env_path = env_path
        self.fail_on = fail_on
        self.calls = []

    def env(self):
        with open(self.env_path) as f:
            return dict(l.split("=", 1) for l in f.read().splitlines() if "=" in l)

    def __call__(self, cmd, **_):
        label = label_of(cmd)
        self.calls.append((label, self.env().get("DEMO_LOGIN_ENABLED")))
        code = 1 if label in self.fail_on else 0
        return subprocess.CompletedProcess(cmd, code, stdout="", stderr="")

    def labels(self):
        return [label for label, _ in self.calls]


def label_of(cmd):
    if cmd[:2] == ["podman", "stop"]:
        return f"stop {cmd[-1]}"
    if cmd[:3] == ["podman", "container", "exists"]:
        return f"exists {cmd[-1]}"
    if cmd[:2] == ["podman", "exec"]:
        return {"dropdb": "dropdb", "createdb": "createdb", "psql": "revoke"}.get(cmd[3], cmd[3])
    if cmd[:2] == ["podman", "run"]:
        return f"run {cmd[cmd.index('--name') + 1]}"
    return " ".join(cmd[:3])


class StackTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.env_path = os.path.join(self.dir.name, "prod.env")
        stack.write_private(self.env_path, [
            "NODE_ENV=production", OLD_SECRET, "DEMO_LOGIN_ENABLED=true",
            f"DEMO_LOGIN_EMAIL={stack.DEMO_LOGIN_EMAIL}",
        ])
        self.pg_path = os.path.join(self.dir.name, "pg.env")
        stack.write_private(self.pg_path, ["POSTGRES_USER=postgres"])
        self.patches = [
            mock.patch.object(stack, "APP_ENV", self.env_path),
            mock.patch.object(stack, "PG_ENV", self.pg_path),
            mock.patch.object(stack, "PRIV", self.dir.name),
            mock.patch("builtins.print"),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.dir.cleanup()

    def run_cmd(self, fn, fail_on=()):
        rec = Recorder(self.env_path, fail_on)
        with mock.patch.object(stack.subprocess, "run", rec):
            try:
                fn()
                exited = False
            except SystemExit:
                exited = True
        return rec, exited

    def secret_rotated(self):
        with open(self.env_path) as f:
            return OLD_SECRET not in f.read().splitlines()

    # L1: reset-demo fails fast
    def test_reset_demo_runs_every_step_in_order(self):
        rec, exited = self.run_cmd(stack.cmd_reset_demo)
        self.assertFalse(exited)
        labels = rec.labels()
        order = ["stop compai-prod-app", "stop compai-prod-api", "dropdb", "createdb",
                 "run compai-prod-migrate", "run compai-prod-seed", "revoke",
                 "run compai-prod-api", "run compai-prod-app"]
        self.assertEqual([l for l in labels if l in order], order)
        self.assertTrue(self.secret_rotated())

    def test_reset_demo_stops_before_rotating_when_a_step_fails(self):
        for failing in ["stop compai-prod-api", "dropdb", "createdb",
                        "run compai-prod-migrate", "run compai-prod-seed"]:
            with self.subTest(failing=failing):
                stack.write_private(self.env_path, ["NODE_ENV=production", OLD_SECRET])
                rec, exited = self.run_cmd(stack.cmd_reset_demo, fail_on=(failing,))
                self.assertTrue(exited)
                self.assertFalse(self.secret_rotated())
                self.assertNotIn("revoke", rec.labels())
                self.assertNotIn("run compai-prod-api", rec.labels())
                self.assertNotIn("run compai-prod-app", rec.labels())

    def test_reset_demo_leaves_services_stopped_when_revoke_fails(self):
        rec, exited = self.run_cmd(stack.cmd_reset_demo, fail_on=("revoke",))
        self.assertTrue(exited)
        self.assertNotIn("run compai-prod-api", rec.labels())

    def test_reset_demo_fails_when_the_api_will_not_start(self):
        rec, exited = self.run_cmd(stack.cmd_reset_demo, fail_on=("run compai-prod-api",))
        self.assertTrue(exited)
        self.assertNotIn("run compai-prod-app", rec.labels())

    # M1: disable-demo
    def test_disable_demo_order_leaves_no_unguarded_window(self):
        rec, exited = self.run_cmd(stack.cmd_disable_demo)
        self.assertFalse(exited)
        labels = rec.labels()
        order = ["stop compai-prod-app", "stop compai-prod-api", "revoke",
                 "run compai-prod-api", "run compai-prod-app"]
        self.assertEqual([l for l in labels if l in order], order)
        # Both services were stopped while the flag was still true, and only
        # started again once it was false and the secret rotated.
        flags = dict(rec.calls)
        self.assertEqual(flags["stop compai-prod-api"], "true")
        self.assertEqual(flags["revoke"], "false")
        self.assertEqual(flags["run compai-prod-api"], "false")
        self.assertTrue(self.secret_rotated())
        env = rec.env()
        self.assertEqual(env["DEMO_LOGIN_ENABLED"], "false")
        self.assertEqual(env["DEMO_LOGIN_EMAIL"], stack.DEMO_LOGIN_EMAIL)
        self.assertEqual(env["NODE_ENV"], "production")

    def test_disable_demo_fails_closed(self):
        for failing in ["stop compai-prod-app", "revoke"]:
            with self.subTest(failing=failing):
                rec, exited = self.run_cmd(stack.cmd_disable_demo, fail_on=(failing,))
                self.assertTrue(exited)
                self.assertNotIn("run compai-prod-api", rec.labels())
                self.assertNotIn("run compai-prod-app", rec.labels())

    def test_up_does_not_switch_a_disabled_demo_back_on(self):
        stack.set_env({"DEMO_LOGIN_ENABLED": "false"})
        self.run_cmd(stack.cmd_secrets)
        with open(self.env_path) as f:
            self.assertIn("DEMO_LOGIN_ENABLED=false", f.read().splitlines())

    def test_disable_demo_is_a_command(self):
        self.assertIs(stack.COMMANDS["disable-demo"], stack.cmd_disable_demo)


if __name__ == "__main__":
    unittest.main(verbosity=2)
