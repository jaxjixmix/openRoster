#!/usr/bin/env node
// Tests the first-run setup route against a completely empty PocketBase database.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PB_DIR = path.join(ROOT, "pb");
const PB = path.join(PB_DIR, "pocketbase");
const DATA = path.join(PB_DIR, ".test-setup-data");
const PORT = Number(process.env.TEST_SETUP_PORT || 18098);
const BASE = `http://127.0.0.1:${PORT}`;

let server = null;

function run(command, args) {
  const result = spawnSync(command, args, { cwd: PB_DIR, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} failed\n${result.stdout}\n${result.stderr}`);
}

async function request(pathname, options = {}) {
  const res = await fetch(BASE + pathname, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: options.token } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

async function waitForHealth() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(BASE + "/api/health");
      if (res.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("PocketBase did not become healthy");
}

async function main() {
  if (!fs.existsSync(PB)) throw new Error("PocketBase binary missing. Run `make pb`.");
  fs.rmSync(DATA, { recursive: true, force: true });
  run(PB, ["migrate", "up", "--dir=.test-setup-data"]);

  server = spawn(PB, ["serve", `--http=127.0.0.1:${PORT}`, "--dir=.test-setup-data"], {
    cwd: PB_DIR,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  server.stdout.on("data", (chunk) => { log += chunk; });
  server.stderr.on("data", (chunk) => { log += chunk; });

  try {
    await waitForHealth();

    const before = await request("/api/openroster/status");
    assert.equal(before.data.setup_required, true);
    assert.equal(before.data.demo_available, false);
    console.log("PASS empty workspace status");

    const setup = await request("/api/openroster/setup", {
      method: "POST",
      body: {
        company_name: "Setup Test Co",
        admin_name: "Test Admin",
        admin_email: "admin@example.com",
        admin_password: "a-very-long-password",
        location_name: "Main St",
        location_address: "1 Main St",
        timezone: "America/Los_Angeles",
        currency: "USD",
        week_start: "1",
      },
    });
    assert.equal(setup.status, 201, "setup succeeds");
    assert.ok(setup.data.company_id);
    console.log("PASS setup creates workspace");

    const after = await request("/api/openroster/status");
    assert.equal(after.data.setup_required, false);

    const login = await request("/api/collections/users/auth-with-password", {
      method: "POST",
      body: { identity: "admin@example.com", password: "a-very-long-password" },
    });
    assert.equal(login.status, 200, "setup admin can log in");
    const token = login.data.token;

    const bootstrap = await request("/api/openroster/bootstrap", { token });
    assert.equal(bootstrap.status, 200);
    assert.equal(bootstrap.data.company.name, "Setup Test Co");
    assert.equal(bootstrap.data.is_manager, true);
    assert.equal(bootstrap.data.employee.first_name, "Test");

    const periods = await request("/api/collections/pay_periods/records?perPage=200", { token });
    assert.ok(periods.data.items.length > 0, "setup generates pay periods");
    console.log("PASS setup admin bootstrap and pay periods");

    const again = await request("/api/openroster/setup", {
      method: "POST",
      body: {
        company_name: "Another Co",
        admin_name: "Another Admin",
        admin_email: "another@example.com",
        admin_password: "a-very-long-password",
        location_name: "Other St",
      },
    });
    assert.equal(again.status, 409, "setup is one-time only");
    console.log("PASS setup guard");

    console.log("ALL SETUP TESTS PASSED");
  } catch (err) {
    console.error(err);
    if (log) console.error(log.slice(-6000));
    process.exitCode = 1;
  } finally {
    if (server) server.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.rmSync(DATA, { recursive: true, force: true });
  }
}

main();
