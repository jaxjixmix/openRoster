#!/usr/bin/env node
// End-to-end API smoke test against a throwaway PocketBase database.
// Requires `make pb` first.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, "..");
const PB_DIR = path.join(ROOT, "pb");
const PB = path.join(PB_DIR, "pocketbase");
const DATA = path.join(PB_DIR, ".test-data");
const PORT = Number(process.env.TEST_PB_PORT || 18097);
const BASE = `http://127.0.0.1:${PORT}`;
const SUPER_EMAIL = "admin@openroster.local";
const SUPER_PASSWORD = "test-superuser-password";

let server = null;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: PB_DIR, encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

async function request(pathname, options = {}) {
  const res = await fetch(BASE + pathname, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: options.token } : {}),
      ...(options.headers || {}),
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
  if (!fs.existsSync(PB)) {
    throw new Error("PocketBase binary missing. Run `make pb`.");
  }

  fs.rmSync(DATA, { recursive: true, force: true });
  run(PB, ["migrate", "up", "--dir=.test-data"]);
  run(PB, ["superuser", "upsert", SUPER_EMAIL, SUPER_PASSWORD, "--dir=.test-data"]);

  server = spawn(PB, ["serve", `--http=127.0.0.1:${PORT}`, "--dir=.test-data"], {
    cwd: PB_DIR,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout.on("data", (chunk) => { serverLog += chunk; });
  server.stderr.on("data", (chunk) => { serverLog += chunk; });

  try {
    await waitForHealth();

    const seeded = spawnSync(process.execPath, [path.join(ROOT, "scripts/seed.mjs")], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        PB_URL: BASE,
        PB_SUPERUSER: SUPER_EMAIL,
        PB_SUPERUSER_PASSWORD: SUPER_PASSWORD,
      },
    });
    if (seeded.status !== 0) throw new Error(`seed failed\n${seeded.stdout}\n${seeded.stderr}`);
    console.log("PASS seed");

    const auth = await request("/api/collections/users/auth-with-password", {
      method: "POST",
      body: { identity: "jordan@harborhearth.co", password: "OpenRoster123!" },
    });
    assert.equal(auth.status, 200, "manager login");
    const token = auth.data.token;
    console.log("PASS manager login");

    const status = await request("/api/openroster/status");
    assert.equal(status.data.setup_required, false);
    assert.equal(status.data.demo_available, true);
    console.log("PASS setup status");

    const bootstrap = await request("/api/openroster/bootstrap", { token });
    assert.equal(bootstrap.status, 200);
    assert.equal(bootstrap.data.is_manager, true);
    assert.ok(bootstrap.data.company.name);
    console.log("PASS bootstrap");

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const todayDate = new Date(today + "T00:00:00Z");
    const weekStart = new Date(todayDate.getTime() - ((todayDate.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
    const weekEnd = new Date(new Date(weekStart + "T00:00:00Z").getTime() + 6 * 86400000).toISOString().slice(0, 10);

    const offsets = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(new Date(weekStart + "T12:00:00Z").getTime() + i * 86400000);
      const name = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", timeZoneName: "longOffset" })
        .formatToParts(date).find((part) => part.type === "timeZoneName")?.value || "GMT-08:00";
      const match = name.match(/GMT([+-])(\d{2}):(\d{2})/);
      if (!match) return -480;
      const minutes = Number(match[2]) * 60 + Number(match[3]);
      return match[1] === "-" ? -minutes : minutes;
    });

    const employeesForShift = await request("/api/collections/employees/records?perPage=20", { token });
    const sam = employeesForShift.data.items.find((employee) => employee.first_name === "Sam");
    assert.ok(sam, "Sam exists");
    const sunday = new Date(new Date(weekStart + "T00:00:00Z").getTime() - 86400000).toISOString().slice(0, 10);
    const invalidShift = await request("/api/collections/shifts/records", {
      method: "POST",
      token,
      body: {
        company: bootstrap.data.company.id,
        location: sam.location,
        department: sam.department,
        position: sam.position,
        employee: sam.id,
        starts_at: `${sunday} 18:00:00.000Z`,
        ends_at: `${sunday} 20:00:00.000Z`,
        local_date: `${sunday} 00:00:00.000Z`,
        local_start: "10:00",
        local_end: "12:00",
        status: "published",
      },
    });
    assert.equal(invalidShift.status, 400, "manual assignment outside availability must fail");
    console.log("PASS manual availability check");

    const auto = await request("/api/openroster/schedule/auto", {
      method: "POST",
      token,
      body: { week_start: weekStart, offsets },
    });
    assert.equal(auto.status, 200, "auto-fill");
    assert.ok(auto.data.checked >= 0);
    console.log("PASS auto-fill");

    const generated = await request("/api/openroster/timesheets/generate", {
      method: "POST",
      token,
      body: { period_start: weekStart, period_end: weekEnd },
    });
    assert.equal(generated.status, 200, "timesheet generation");
    assert.ok(generated.data.sheets >= 0);
    console.log("PASS timesheet generation");

    const preview = await request("/api/openroster/payroll/preview", {
      method: "POST",
      token,
      body: { period_start: weekStart, period_end: weekEnd },
    });
    assert.equal(preview.status, 200, "payroll preview");
    assert.ok(preview.data.totals.employees >= 1);
    assert.ok(preview.data.totals.gross > 0);
    console.log("PASS payroll preview");

    const employees = await request("/api/collections/employees/records?perPage=5", { token });
    assert.ok(employees.data.items.length > 0);
    const deleted = await request(`/api/collections/employees/records/${employees.data.items[0].id}`, {
      method: "DELETE",
      token,
    });
    assert.equal(deleted.ok, false, "manager must not delete an employee");
    console.log("PASS destructive delete blocked");

    const runs = await request("/api/collections/pay_runs/records?perPage=5", { token });
    assert.ok(runs.data.items.length > 0);
    const run = runs.data.items[0];

    const approve = await request("/api/openroster/payroll/status", {
      method: "POST",
      token,
      body: { run: run.id, status: "approved" },
    });
    assert.equal(approve.status, 200, "pay run approve");

    const tamper = await request(`/api/collections/pay_runs/records/${run.id}`, {
      method: "PATCH",
      token,
      body: { total_gross: 1 },
    });
    assert.equal(tamper.ok, false, "approved pay run totals must be locked");

    const paid = await request("/api/openroster/payroll/status", {
      method: "POST",
      token,
      body: { run: run.id, status: "paid" },
    });
    assert.equal(paid.status, 200, "pay run mark paid");

    const reopen = await request(`/api/collections/pay_runs/records/${run.id}`, {
      method: "PATCH",
      token,
      body: { status: "draft" },
    });
    assert.equal(reopen.ok, false, "paid pay run must stay paid/voided");
    console.log("PASS pay run lock");

    const voided = await request("/api/openroster/payroll/status", {
      method: "POST",
      token,
      body: { run: run.id, status: "voided", reason: "test reversal" },
    });
    assert.equal(voided.status, 200, "paid run can be voided");

    const replacement = await request("/api/openroster/payroll/run", {
      method: "POST",
      token,
      body: { period_start: weekStart, period_end: weekEnd },
    });
    assert.equal(replacement.status, 200, "voided period can be rerun");
    console.log("PASS pay run void and replacement");

    const sheets = await request("/api/collections/timesheets/records?perPage=50", { token });
    const lockedSheet = sheets.data.items.find((sheet) => sheet.status === "approved" || sheet.status === "paid");
    if (lockedSheet) {
      const edit = await request(`/api/collections/timesheets/records/${lockedSheet.id}`, {
        method: "PATCH",
        token,
        body: { regular_hours: 99 },
      });
      assert.equal(edit.ok, false, "approved/paid timesheet hours must be locked");
      console.log("PASS timesheet lock");
    }

    const setupAgain = await request("/api/openroster/setup", {
      method: "POST",
      body: {
        company_name: "Nope",
        admin_name: "Nope",
        admin_email: "nope@example.com",
        admin_password: "long-enough-password",
        location_name: "Nope",
      },
    });
    assert.equal(setupAgain.status, 409, "setup must not run twice");
    console.log("PASS setup guard");

    console.log("ALL API TESTS PASSED");
  } catch (err) {
    console.error(err);
    if (serverLog) console.error("\n--- PocketBase log ---\n" + serverLog.slice(-8000));
    process.exitCode = 1;
  } finally {
    if (server) server.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.rmSync(DATA, { recursive: true, force: true });
  }
}

main();
