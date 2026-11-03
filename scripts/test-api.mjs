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

    const periodRes = await request("/api/collections/pay_periods/records?perPage=200&sort=-period_start", { token });
    assert.ok(periodRes.data.items.length > 0, "seed creates pay periods");
    const currentPeriod = periodRes.data.items.find((period) => period.period_start.slice(0, 10) <= weekStart && period.period_end.slice(0, 10) >= weekStart);
    assert.ok(currentPeriod, "current pay period exists");
    const payStart = currentPeriod.period_start.slice(0, 10);
    const payEnd = currentPeriod.period_end.slice(0, 10);
    console.log("PASS pay periods");

    const claimDate = new Date(new Date(weekStart + "T00:00:00Z").getTime() + 21 * 86400000).toISOString().slice(0, 10);
    const openShift = await request("/api/collections/shifts/records", {
      method: "POST",
      token,
      body: {
        company: bootstrap.data.company.id,
        location: sam.location,
        department: sam.department,
        position: sam.position,
        starts_at: `${claimDate} 17:00:00.000Z`,
        ends_at: `${claimDate} 20:00:00.000Z`,
        local_date: `${claimDate} 00:00:00.000Z`,
        local_start: "09:00",
        local_end: "12:00",
        status: "published",
      },
    });
    assert.equal(openShift.status, 200, "open shift created");

    const samLogin = await request("/api/collections/users/auth-with-password", {
      method: "POST",
      body: { identity: "sam@harborhearth.co", password: "OpenRoster123!" },
    });
    const claimed = await request("/api/openroster/shifts/claim", {
      method: "POST",
      token: samLogin.data.token,
      body: { shift: openShift.data.id },
    });
    assert.equal(claimed.status, 200, "employee claims open shift");
    assert.equal(claimed.data.shift.employee, sam.id);
    console.log("PASS open shift claim");

    const notifications = await request("/api/collections/notifications/records?perPage=20", { token: samLogin.data.token });
    assert.ok(notifications.data.items.some((notification) => notification.title === "Shift claimed"), "claim creates notification");
    console.log("PASS in-app notification");

    const swapDate = new Date(new Date(weekStart + "T00:00:00Z").getTime() + 35 * 86400000).toISOString().slice(0, 10);
    const swapShift = await request("/api/collections/shifts/records", {
      method: "POST",
      token,
      body: {
        company: bootstrap.data.company.id,
        location: sam.location,
        department: sam.department,
        position: sam.position,
        employee: sam.id,
        starts_at: `${swapDate} 17:00:00.000Z`,
        ends_at: `${swapDate} 21:00:00.000Z`,
        local_date: `${swapDate} 00:00:00.000Z`,
        local_start: "10:00",
        local_end: "14:00",
        status: "published",
      },
    });
    assert.equal(swapShift.status, 200, "swap shift created");
    const offered = await request("/api/openroster/swaps", {
      method: "POST",
      token: samLogin.data.token,
      body: { shift: swapShift.data.id, note: "Test swap" },
    });
    assert.equal(offered.status, 200, "shift offered for swap");
    const owenLogin = await request("/api/collections/users/auth-with-password", {
      method: "POST",
      body: { identity: "owen@harborhearth.co", password: "OpenRoster123!" },
    });
    const accepted = await request("/api/openroster/swaps/accept", {
      method: "POST",
      token: owenLogin.data.token,
      body: { swap: offered.data.swap.id },
    });
    assert.equal(accepted.status, 200, "swap accepted");
    const approved = await request("/api/openroster/swaps/status", {
      method: "POST",
      token,
      body: { swap: offered.data.swap.id, status: "approved" },
    });
    assert.equal(approved.status, 200, "swap approved");
    const reassigned = await request(`/api/collections/shifts/records/${swapShift.data.id}`, { token });
    assert.equal(reassigned.data.employee, employeesForShift.data.items.find((employee) => employee.first_name === "Owen").id);
    console.log("PASS shift swap");

    const copyTarget = new Date(new Date(weekStart + "T00:00:00Z").getTime() + 28 * 86400000).toISOString().slice(0, 10);
    const copied = await request("/api/openroster/schedule/copy", {
      method: "POST",
      token,
      body: { from_week: weekStart, to_week: copyTarget, from_offsets: offsets, to_offsets: offsets },
    });
    assert.equal(copied.status, 200, "copy week");
    assert.ok(copied.data.created > 0);
    const copiedAgain = await request("/api/openroster/schedule/copy", {
      method: "POST",
      token,
      body: { from_week: weekStart, to_week: copyTarget, from_offsets: offsets, to_offsets: offsets },
    });
    assert.equal(copiedAgain.status, 409, "copy into non-empty week is blocked");
    console.log("PASS copy week");

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

    const openSheetsRes = await request("/api/collections/timesheets/records?perPage=50", { token });
    const openIds = openSheetsRes.data.items.filter((sheet) => sheet.status === "open" || sheet.status === "submitted").map((sheet) => sheet.id);
    if (openIds.length) {
      const bulk = await request("/api/openroster/timesheets/approve", {
        method: "POST",
        token,
        body: { ids: openIds },
      });
      assert.equal(bulk.status, 200, "bulk timesheet approval");
      assert.equal(bulk.data.approved, openIds.length);
    }
    console.log("PASS bulk timesheet approval");

    const preview = await request("/api/openroster/payroll/preview", {
      method: "POST",
      token,
      body: { period_start: payStart, period_end: payEnd },
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

    const priya = (await request("/api/collections/employees/records?perPage=50", { token })).data.items.find((employee) => employee.first_name === "Priya");
    assert.ok(priya, "Priya exists");
    const breakIn = await request("/api/openroster/clock", { method: "POST", token, body: { employee: priya.id, type: "in", offset_minutes: -480 } });
    assert.equal(breakIn.status, 200, "clock in");
    const breakStart = await request("/api/openroster/clock", { method: "POST", token, body: { employee: priya.id, type: "break_start", offset_minutes: -480 } });
    assert.equal(breakStart.status, 200, "break start");
    assert.equal(breakStart.data.on_break, true);
    const breakEnd = await request("/api/openroster/clock", { method: "POST", token, body: { employee: priya.id, type: "break_end", offset_minutes: -480 } });
    assert.equal(breakEnd.status, 200, "break end");
    const breakOut = await request("/api/openroster/clock", { method: "POST", token, body: { employee: priya.id, type: "out", offset_minutes: -480 } });
    assert.equal(breakOut.status, 200, "clock out");
    console.log("PASS break punches");

    await request("/api/collections/kiosk_pins/records", {
      method: "POST",
      token,
      body: { company: bootstrap.data.company.id, pin: "2468", enabled: true },
    });
    const managerPins = await request("/api/collections/kiosk_pins/records?perPage=10", { token });
    assert.equal(managerPins.data.items.length, 1, "manager can read kiosk PIN");
    const samPins = await request("/api/collections/kiosk_pins/records?perPage=10", { token: samLogin.data.token });
    assert.equal(samPins.data.items.length, 0, "employees cannot read kiosk PIN");
    console.log("PASS kiosk PIN access");

    const ptoEntries = await request("/api/collections/pto_entries/records?perPage=100", { token });
    assert.ok(ptoEntries.data.items.length > 0, "ledger seeded");
    const pendingLeave = await request("/api/collections/time_off_requests/records?perPage=10&filter=" + encodeURIComponent("status = 'pending'"), { token });
    const leave = pendingLeave.data.items[0];
    if (leave) {
      const before = await request("/api/collections/employees/records?perPage=50", { token });
      const beforeBalance = before.data.items.find((employee) => employee.id === leave.employee).pto_balance_hours;
      const decided = await request(`/api/collections/time_off_requests/records/${leave.id}`, {
        method: "PATCH",
        token,
        body: { status: "approved" },
      });
      assert.equal(decided.status, 200, "approve time off");
      const after = await request("/api/collections/employees/records?perPage=50", { token });
      const afterBalance = after.data.items.find((employee) => employee.id === leave.employee).pto_balance_hours;
      assert.equal(afterBalance, beforeBalance - leave.hours, "PTO ledger decrements balance");
      console.log("PASS PTO ledger");
    }

    let punches = await request("/api/collections/punches/records?perPage=1&sort=-punched_at", { token });
    if (!punches.data.items.length) {
      const firstEmployee = employeesForShift.data.items[0];
      await request("/api/collections/punches/records", {
        method: "POST",
        token,
        body: { employee: firstEmployee.id, type: "in", punched_at: new Date().toISOString(), source: "admin" },
      });
      punches = await request("/api/collections/punches/records?perPage=1&sort=-punched_at", { token });
    }
    assert.ok(punches.data.items.length > 0);
    const punch = punches.data.items[0];
    const corrected = await request("/api/openroster/punches/correct", {
      method: "POST",
      token,
      body: { punch: punch.id, type: punch.type, punched_at: punch.punched_at, reason: "API smoke test correction" },
    });
    assert.equal(corrected.status, 200, "punch correction");
    console.log("PASS punch correction");

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

    const closedPeriods = await request("/api/collections/pay_periods/records?perPage=200", { token });
    const closedPeriod = closedPeriods.data.items.find((period) => period.period_start.slice(0, 10) === payStart);
    assert.equal(closedPeriod.status, "closed", "paid period locks");
    console.log("PASS pay run lock and period close");

    const voided = await request("/api/openroster/payroll/status", {
      method: "POST",
      token,
      body: { run: run.id, status: "voided", reason: "test reversal" },
    });
    assert.equal(voided.status, 200, "paid run can be voided");

    const reopenedPeriods = await request("/api/collections/pay_periods/records?perPage=200", { token });
    const reopenedPeriod = reopenedPeriods.data.items.find((period) => period.period_start.slice(0, 10) === payStart);
    assert.equal(reopenedPeriod.status, "open", "voiding reopens the period");

    const replacement = await request("/api/openroster/payroll/run", {
      method: "POST",
      token,
      body: { period_start: payStart, period_end: payEnd },
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
