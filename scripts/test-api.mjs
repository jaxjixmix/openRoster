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
    assert.equal(bootstrap.data.company.weekly_labor_budget, 6000);
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
    const reclaim = await request("/api/openroster/shifts/claim", {
      method: "POST",
      token: samLogin.data.token,
      body: { shift: openShift.data.id },
    });
    assert.equal(reclaim.status, 409, "a claimed shift cannot be claimed twice");
    console.log("PASS open shift claim");

    const notifications = await request("/api/collections/notifications/records?perPage=20", { token: samLogin.data.token });
    assert.ok(notifications.data.items.some((notification) => notification.title === "Shift claimed"), "claim creates notification");
    const readAll = await request("/api/openroster/notifications/read-all", { method: "POST", token: samLogin.data.token });
    assert.equal(readAll.status, 200);
    assert.ok(readAll.data.updated > 0);
    const readAllAgain = await request("/api/openroster/notifications/read-all", { method: "POST", token: samLogin.data.token });
    assert.equal(readAllAgain.data.updated, 0);
    const retention = spawnSync(process.execPath, [path.join(ROOT, "scripts/retention.mjs"), "--apply"], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        PB_URL: BASE,
        PB_SUPERUSER_PASSWORD: SUPER_PASSWORD,
        RETENTION_NOTIFICATION_DAYS: "0",
      },
    });
    assert.equal(retention.status, 0, retention.stderr || retention.stdout);
    assert.match(retention.stdout, /Deleted [1-9]/);
    const afterRetention = await request("/api/collections/notifications/records?perPage=1", { token: samLogin.data.token });
    assert.equal(afterRetention.data.totalItems, 0);
    console.log("PASS in-app notification, read-all and retention");

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

    const templateWeek = new Date(new Date(weekStart + "T00:00:00Z").getTime() + 42 * 86400000).toISOString().slice(0, 10);
    const template = await request("/api/collections/shift_templates/records", {
      method: "POST",
      token,
      body: {
        company: bootstrap.data.company.id,
        location: sam.location,
        department: sam.department,
        position: sam.position,
        employee: sam.id,
        weekday: String(new Date(templateWeek + "T00:00:00Z").getUTCDay()),
        start_time: "09:00",
        end_time: "12:00",
        break_minutes: 0,
        active: true,
      },
    });
    assert.equal(template.status, 200, "template created");
    const applied = await request("/api/openroster/shift_templates/apply", {
      method: "POST",
      token,
      body: { week_start: templateWeek, offsets },
    });
    assert.equal(applied.status, 200, "template applied");
    assert.equal(applied.data.created, 1);
    const reapplied = await request("/api/openroster/shift_templates/apply", {
      method: "POST",
      token,
      body: { week_start: templateWeek, offsets },
    });
    assert.equal(reapplied.data.created, 0, "template is idempotent");
    console.log("PASS shift templates");

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
    const priyaLocation = (await request(`/api/collections/locations/records/${priya.location}`, { token })).data;
    const priyaCoords = { lat: priyaLocation.lat, lng: priyaLocation.lng };
    const breakIn = await request("/api/openroster/clock", { method: "POST", token, body: { employee: priya.id, type: "in", offset_minutes: -480, ...priyaCoords } });
    assert.equal(breakIn.status, 200, "clock in: " + JSON.stringify(breakIn.data));
    const breakStart = await request("/api/openroster/clock", { method: "POST", token, body: { employee: priya.id, type: "break_start", offset_minutes: -480, ...priyaCoords } });
    assert.equal(breakStart.status, 200, "break start");
    assert.equal(breakStart.data.on_break, true);
    const breakEnd = await request("/api/openroster/clock", { method: "POST", token, body: { employee: priya.id, type: "break_end", offset_minutes: -480, ...priyaCoords } });
    assert.equal(breakEnd.status, 200, "break end");
    const breakOut = await request("/api/openroster/clock", { method: "POST", token, body: { employee: priya.id, type: "out", offset_minutes: -480, ...priyaCoords } });
    assert.equal(breakOut.status, 200, "clock out");
    console.log("PASS break punches");

    const offlineClient = `offline-test-${Date.now()}`;
    const offlineIn = await request("/api/openroster/clock", {
      method: "POST",
      token,
      body: {
        employee: priya.id,
        type: "in",
        source: "offline",
        offset_minutes: -480,
        client_id: offlineClient,
        punched_at: new Date(Date.now() + 1000).toISOString(),
      },
    });
    assert.equal(offlineIn.status, 200, "offline punch accepted");
    assert.equal(offlineIn.data.punch.client_id, offlineClient);
    assert.equal(offlineIn.data.punch.source, "offline");
    const duplicateOffline = await request("/api/openroster/clock", {
      method: "POST",
      token,
      body: {
        employee: priya.id,
        type: "in",
        offset_minutes: -480,
        client_id: offlineClient,
        punched_at: new Date(Date.now() + 1000).toISOString(),
      },
    });
    assert.equal(duplicateOffline.status, 200);
    assert.equal(duplicateOffline.data.duplicate, true);
    assert.equal(duplicateOffline.data.punch.id, offlineIn.data.punch.id);
    const staleOffline = await request("/api/openroster/clock", {
      method: "POST",
      token,
      body: {
        employee: priya.id,
        type: "out",
        offset_minutes: -480,
        client_id: `${offlineClient}-stale`,
        punched_at: new Date(Date.now() - 96 * 3600 * 1000).toISOString(),
      },
    });
    assert.equal(staleOffline.status, 422, "stale offline punch rejected");
    const offlineOut = await request("/api/openroster/clock", {
      method: "POST",
      token,
      body: {
        employee: priya.id,
        type: "out",
        offset_minutes: -480,
        client_id: `${offlineClient}-out`,
        punched_at: new Date(Date.now() + 2000).toISOString(),
      },
    });
    assert.equal(offlineOut.status, 200, "offline clock out");
    console.log("PASS offline punch idempotency");

    // A fenced site cannot be bypassed by denying browser coordinates.
    const fencedLocation = priyaLocation;
    assert.ok(fencedLocation.id, "Priya has a location");
    const fenced = await request(`/api/collections/locations/records/${fencedLocation.id}`, {
      method: "PATCH",
      token,
      body: { lat: 37.7749, lng: -122.4194, geofence_meters: 500 },
    });
    assert.equal(fenced.status, 200, "location geofence configured");
    const noCoords = await request("/api/openroster/clock", {
      method: "POST",
      token,
      body: { employee: priya.id, type: "in", offset_minutes: -480 },
    });
    assert.equal(noCoords.status, 422, "fenced punch without coordinates is rejected");
    const farCoords = await request("/api/openroster/clock", {
      method: "POST",
      token,
      body: { employee: priya.id, type: "in", offset_minutes: -480, lat: 0, lng: 0 },
    });
    assert.equal(farCoords.status, 422, "fenced punch outside the radius is rejected");
    const insideCoords = await request("/api/openroster/clock", {
      method: "POST",
      token,
      body: {
        employee: priya.id,
        type: "in",
        offset_minutes: -480,
        lat: 37.7749,
        lng: -122.4194,
        client_id: `fenced-in-${Date.now()}`,
        punched_at: new Date(Date.now() + 10000).toISOString(),
      },
    });
    assert.equal(insideCoords.status, 200, "fenced punch inside the radius is accepted: " + JSON.stringify(insideCoords.data));
    const fencedOut = await request("/api/openroster/clock", {
      method: "POST",
      token,
      body: {
        employee: priya.id,
        type: "out",
        offset_minutes: -480,
        lat: 37.7749,
        lng: -122.4194,
        client_id: `fenced-out-${Date.now()}`,
        punched_at: new Date(Date.now() + 11000).toISOString(),
      },
    });
    assert.equal(fencedOut.status, 200, "fenced clock out accepted: " + JSON.stringify(fencedOut.data));
    const offlineFencedId = `fenced-offline-${Date.now()}`;
    const offlineFenced = await request("/api/openroster/clock", {
      method: "POST",
      token,
      body: {
        employee: priya.id,
        type: "in",
        offset_minutes: -480,
        client_id: offlineFencedId,
        punched_at: new Date(Date.now() + 20000).toISOString(),
      },
    });
    assert.equal(offlineFenced.status, 200, "offline punch is accepted without coordinates");
    assert.match(offlineFenced.data.punch.note, /Geofence not verified/);
    const offlineFencedOut = await request("/api/openroster/clock", {
      method: "POST",
      token,
      body: {
        employee: priya.id,
        type: "out",
        offset_minutes: -480,
        client_id: `${offlineFencedId}-out`,
        punched_at: new Date(Date.now() + 21000).toISOString(),
      },
    });
    assert.equal(offlineFencedOut.status, 200, "offline clock out accepted without coordinates");
    await request(`/api/collections/locations/records/${fencedLocation.id}`, {
      method: "PATCH",
      token,
      body: { lat: priyaCoords.lat, lng: priyaCoords.lng, geofence_meters: 150 },
    });
    console.log("PASS geofence enforcement");

    const weekStartStr = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const recommend = await request("/api/openroster/demand/recommend", {
      method: "POST",
      token,
      body: { week_start: weekStartStr, covers: Array(7).fill(0).map((_, index) => (index === 2 ? 50 : 0)), productivity: 16 },
    });
    assert.equal(recommend.status, 200);
    assert.equal(recommend.data.days[2].headcount, 4);
    assert.equal(recommend.data.days[2].hours, 32);
    assert.match(recommend.data.days[2].explanation, /50 covers/);
    const recommendUnauth = await request("/api/openroster/demand/recommend", { method: "POST", body: { week_start: weekStartStr, covers: [1,1,1,1,1,1,1] } });
    assert.equal(recommendUnauth.status, 401);
    const recommendBadWeek = await request("/api/openroster/demand/recommend", { method: "POST", token, body: { week_start: "nope", covers: [1,1,1,1,1,1,1] } });
    assert.equal(recommendBadWeek.status, 400);

    const storeWeek = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const demandSet = await request("/api/collections/demand_forecasts/records", {
      method: "POST",
      token,
      body: { company: bootstrap.data.company.id, week_start: storeWeek, location: "", days: { [storeWeek]: 50 }, productivity: 16, break_minutes: 30 },
    });
    assert.equal(demandSet.status, 200, JSON.stringify(demandSet.data));

    const demandPlan = await request("/api/openroster/demand/apply", {
      method: "POST",
      token,
      body: { week_start: weekStartStr, covers: Array(7).fill(0).map((_, index) => (index === 2 ? 50 : 0)), productivity: 16, offsets: [-480,-480,-480,-480,-480,-480,-480] },
    });
    assert.equal(demandPlan.status, 200);
    assert.equal(demandPlan.data.created, 4);
    const appliedAgain = await request("/api/openroster/demand/apply", {
      method: "POST",
      token,
      body: { week_start: weekStartStr, covers: Array(7).fill(0).map((_, index) => (index === 2 ? 50 : 0)), productivity: 16 },
    });
    assert.equal(appliedAgain.status, 200);
    assert.equal(appliedAgain.data.created, 0);
    const appliedReplace = await request("/api/openroster/demand/apply", {
      method: "POST",
      token,
      body: { week_start: weekStartStr, covers: Array(7).fill(0).map((_, index) => (index === 2 ? 34 : 0)), productivity: 16, replace: true },
    });
    assert.equal(appliedReplace.data.replaced, true);
    assert.equal(appliedReplace.data.created, 3);
    const forecastEnd = new Date(Date.parse(weekStartStr + "T00:00:00Z") + 7 * 86400000).toISOString().slice(0, 10);
    const forecastShifts = await request(
      `/api/collections/shifts/records?perPage=10&sort=-created&filter=${encodeURIComponent(`starts_at >= "${weekStartStr}" && starts_at < "${forecastEnd}" && notes = "${appliedReplace.data.note}"`)}`,
      { token }
    );
    assert.ok(forecastShifts.data.items.length > 0, "forecast shifts exist");
    assert.ok(forecastShifts.data.items.every((shift) => shift.status === "draft"));
    console.log("PASS demand forecast and apply");

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

    const kioskDevice = await request("/api/openroster/kiosk/devices", {
      method: "POST",
      token,
      body: { name: "API test kiosk", location: sam.location },
    });
    assert.equal(kioskDevice.status, 201, JSON.stringify(kioskDevice.data));
    assert.match(kioskDevice.data.code, /^\d{6}$/);
    const paired = await request("/api/openroster/kiosk/pair", {
      method: "POST",
      body: { code: kioskDevice.data.code },
    });
    assert.equal(paired.status, 200, JSON.stringify(paired.data));
    const kioskHeaders = { "X-Kiosk-Token": paired.data.token };
    const roster = await request("/api/openroster/kiosk/roster", { headers: kioskHeaders });
    assert.equal(roster.status, 200, JSON.stringify(roster.data));
    const samRoster = roster.data.employees.find((employee) => employee.id === sam.id);
    assert.ok(samRoster, "kiosk roster includes Sam");
    assert.equal(samRoster.has_pin, true);
    const kioskType = samRoster.clocked_in ? "out" : "in";
    const wrongPin = await request("/api/openroster/kiosk/punch", {
      method: "POST",
      headers: kioskHeaders,
      body: { employee: sam.id, type: kioskType, pin: "0000" },
    });
    assert.equal(wrongPin.status, 401, "wrong kiosk PIN rejected");
    const kioskPunch = await request("/api/openroster/kiosk/punch", {
      method: "POST",
      headers: kioskHeaders,
      body: { employee: sam.id, type: kioskType, pin: "1234" },
    });
    assert.equal(kioskPunch.status, 200, JSON.stringify(kioskPunch.data));
    assert.equal(kioskPunch.data.punch.kiosk_device, kioskDevice.data.device.id);
    const reverseKiosk = await request("/api/openroster/kiosk/punch", {
      method: "POST",
      headers: kioskHeaders,
      body: { employee: sam.id, type: kioskType === "in" ? "out" : "in", pin: "1234" },
    });
    assert.equal(reverseKiosk.status, 200, "kiosk can reverse the punch for cleanup");
    const offlineKioskId = `kiosk-offline-${Date.now()}`;
    const offlineKiosk = await request("/api/openroster/kiosk/punch", {
      method: "POST",
      headers: kioskHeaders,
      body: {
        employee: sam.id,
        type: "in",
        offline: true,
        client_id: offlineKioskId,
        punched_at: new Date(Date.now() + 30000).toISOString(),
      },
    });
    assert.equal(offlineKiosk.status, 200, "kiosk offline punch accepted");
    assert.match(offlineKiosk.data.punch.note, /PIN not verified/);
    const duplicateKiosk = await request("/api/openroster/kiosk/punch", {
      method: "POST",
      headers: kioskHeaders,
      body: {
        employee: sam.id,
        type: "in",
        offline: true,
        client_id: offlineKioskId,
        punched_at: new Date(Date.now() + 30000).toISOString(),
      },
    });
    assert.equal(duplicateKiosk.status, 200);
    assert.equal(duplicateKiosk.data.duplicate, true);
    const offlineKioskOut = await request("/api/openroster/kiosk/punch", {
      method: "POST",
      headers: kioskHeaders,
      body: {
        employee: sam.id,
        type: "out",
        offline: true,
        client_id: `${offlineKioskId}-out`,
        punched_at: new Date(Date.now() + 31000).toISOString(),
      },
    });
    assert.equal(offlineKioskOut.status, 200, "kiosk offline clock out accepted");

    const devices = await request("/api/openroster/kiosk/devices", { token });
    assert.ok(devices.data.items.some((device) => device.id === kioskDevice.data.device.id));
    const revoked = await request("/api/openroster/kiosk/devices/revoke", {
      method: "POST",
      token,
      body: { device: kioskDevice.data.device.id },
    });
    assert.equal(revoked.status, 200);
    const revokedRoster = await request("/api/openroster/kiosk/roster", { headers: kioskHeaders });
    assert.equal(revokedRoster.status, 401, "revoked device loses access");
    console.log("PASS kiosk pairing, PIN punch and revoke");

    const cert = await request("/api/collections/certifications/records", {
      method: "POST",
      token,
      body: { company: bootstrap.data.company.id, name: "Food Safety", active: true },
    });
    const certPosition = await request("/api/collections/positions/records", {
      method: "POST",
      token,
      body: { company: bootstrap.data.company.id, department: sam.department, name: "Certified Cook", required_certifications: [cert.data.id], active: true },
    });
    const certWeek = new Date(new Date(weekStart + "T00:00:00Z").getTime() + 56 * 86400000).toISOString().slice(0, 10);
    const certShiftBody = {
      company: bootstrap.data.company.id,
      location: sam.location,
      department: sam.department,
      position: certPosition.data.id,
      employee: sam.id,
      starts_at: `${certWeek} 17:00:00.000Z`,
      ends_at: `${certWeek} 21:00:00.000Z`,
      local_date: `${certWeek} 00:00:00.000Z`,
      local_start: "10:00",
      local_end: "14:00",
      status: "published",
    };
    const missingCert = await request("/api/collections/shifts/records", { method: "POST", token, body: certShiftBody });
    assert.equal(missingCert.status, 400, "missing certification blocks assignment");
    await request("/api/collections/employee_certifications/records", {
      method: "POST",
      token,
      body: {
        company: bootstrap.data.company.id,
        employee: sam.id,
        certification: cert.data.id,
        issued_at: `${weekStart} 00:00:00.000Z`,
        expires_at: `${new Date().getUTCFullYear() + 2}-12-31 00:00:00.000Z`,
      },
    });
    const withCert = await request("/api/collections/shifts/records", { method: "POST", token, body: certShiftBody });
    assert.equal(withCert.status, 200, "certification allows assignment");
    console.log("PASS certifications");

    const expiringCert = await request("/api/collections/certifications/records", {
      method: "POST",
      token,
      body: { company: bootstrap.data.company.id, name: "Expiring License", active: true },
    });
    const expiry = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    await request("/api/collections/employee_certifications/records", {
      method: "POST",
      token,
      body: { company: bootstrap.data.company.id, employee: sam.id, certification: expiringCert.data.id, expires_at: `${expiry} 00:00:00.000Z` },
    });
    await request("/api/collections/documents/records", {
      method: "POST",
      token,
      body: { employee: sam.id, name: "Expiring ID", expires_at: `${expiry} 00:00:00.000Z` },
    });
    const beforeReminders = await request("/api/collections/notifications/records?perPage=100", { token: samLogin.data.token });
    const reminders = await request("/api/openroster/reminders/run", { method: "POST", token });
    assert.equal(reminders.status, 200);
    assert.ok(reminders.data.certifications >= 1 && reminders.data.documents >= 1);
    const afterReminders = await request("/api/collections/notifications/records?perPage=100", { token: samLogin.data.token });
    assert.ok(afterReminders.data.items.length > beforeReminders.data.items.length);
    await request("/api/openroster/reminders/run", { method: "POST", token });
    const deduped = await request("/api/collections/notifications/records?perPage=100", { token: samLogin.data.token });
    assert.equal(deduped.data.items.length, afterReminders.data.items.length, "reminders dedupe per day");
    console.log("PASS expiry reminders");

    const blackout = await request("/api/collections/blackout_dates/records", {
      method: "POST",
      token,
      body: { company: bootstrap.data.company.id, name: "Test blackout", start_date: `${weekStart} 00:00:00.000Z`, end_date: `${weekStart} 00:00:00.000Z`, active: true },
    });
    assert.equal(blackout.status, 200, "blackout created");
    const employeeBlackouts = await request("/api/collections/blackout_dates/records?perPage=10", { token: samLogin.data.token });
    assert.ok(employeeBlackouts.data.items.length > 0, "employees can see blackouts");
    console.log("PASS blackout dates");

    const clientError = await request("/api/openroster/client-error", {
      method: "POST",
      body: { message: "API test client error", path: "/test", stack: "test" },
    });
    assert.equal(clientError.status, 200, "client error endpoint accepts reports");
    console.log("PASS client error reporting");

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

    const revertedSheets = await request(`/api/collections/timesheets/records?perPage=50&filter=${encodeURIComponent("status = 'approved'")}`, { token });
    assert.ok(revertedSheets.data.totalItems > 0, "void reverts paid timesheets to approved");

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

    const suAuth = await request("/api/collections/_superusers/auth-with-password", {
      method: "POST",
      body: { identity: SUPER_EMAIL, password: SUPER_PASSWORD },
    });
    assert.equal(suAuth.status, 200, "superuser login for accrual test");
    const su = suAuth.data.token;
    const companyPatch = await request(`/api/collections/companies/records/${bootstrap.data.company.id}`, {
      method: "PATCH",
      token: su,
      body: { pto_accrual_hours_per_period: 2 },
    });
    assert.equal(companyPatch.status, 200);

    const allPeriods = await request("/api/collections/pay_periods/records?perPage=200&sort=period_start", { token });
    const laterPeriod = allPeriods.data.items.find((period) => period.period_start.slice(0, 10) > payEnd);
    assert.ok(laterPeriod, "a later pay period exists");
    const accrualPeriodStart = laterPeriod.period_start.slice(0, 10);
    const accrualPeriodEnd = accrualDepositEnd(laterPeriod);

    function accrualDepositEnd(period) {
      return new Date(new Date(period.period_end).getTime() + 86400000).toISOString().slice(0, 10);
    }

    const accrualRun = await request("/api/openroster/payroll/run", {
      method: "POST",
      token,
      body: { period_start: accrualPeriodStart, period_end: accrualPeriodEnd },
    });
    assert.equal(accrualRun.status, 200, accrualRun.data.message || "accrual run created");
    const accrualRunId = accrualRun.data.run ? accrualRun.data.run.id : accrualRun.data.run_id;
    assert.ok(accrualRunId, "accrual run id present");

    const accrualsBefore = await request(
      `/api/collections/pto_entries/records?perPage=50&filter=${encodeURIComponent(`type = 'accrual' && period_start = "${accrualPeriodStart} 00:00:00.000Z"`)}`,
      { token }
    );
    assert.ok(accrualsBefore.data.items.length > 0, "payroll run books PTO accruals");

    const accrualApprove = await request("/api/openroster/payroll/status", {
      method: "POST",
      token,
      body: { run: accrualRunId, status: "approved" },
    });
    assert.equal(accrualApprove.status, 200);
    const accrualPaid = await request("/api/openroster/payroll/status", {
      method: "POST",
      token,
      body: { run: accrualRunId, status: "paid" },
    });
    assert.equal(accrualPaid.status, 200);

    const accrualVoid = await request("/api/openroster/payroll/status", {
      method: "POST",
      token,
      body: { run: accrualRunId, status: "voided", reason: "accrual reversal test" },
    });
    assert.equal(accrualVoid.status, 200);

    const accrualsAfter = await request(
      `/api/collections/pto_entries/records?perPage=50&filter=${encodeURIComponent(`type = 'accrual' && period_start = "${accrualPeriodStart} 00:00:00.000Z"`)}`,
      { token }
    );
    assert.equal(accrualsAfter.data.totalItems, 0, "void deletes the run's PTO accruals");
    await request(`/api/collections/companies/records/${bootstrap.data.company.id}`, {
      method: "PATCH",
      token: su,
      body: { pto_accrual_hours_per_period: 0 },
    });
    console.log("PASS pay run void reverses accruals");

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
