#!/usr/bin/env node
// Browser smoke test. Build first with NEXT_PUBLIC_PB_URL=http://127.0.0.1:18097
// and install Chromium with: npx playwright install chromium
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(__dirname, "..");
const ROOT = path.resolve(WEB, "..");
const PB_DIR = path.join(ROOT, "pb");
const PB = path.join(PB_DIR, "pocketbase");
const DATA = path.join(PB_DIR, ".test-ui-data");
const PB_PORT = Number(process.env.TEST_PB_PORT || 18097);
const WEB_PORT = Number(process.env.TEST_WEB_PORT || 3001);
const PB_URL = `http://127.0.0.1:${PB_PORT}`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
const SUPER_PASSWORD = "test-superuser-password";

let pb = null;
let web = null;
let log = "";

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} failed\n${result.stdout}\n${result.stderr}`);
}

async function waitFor(url, label) {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not become ready`);
}

async function main() {
  if (!fs.existsSync(PB)) throw new Error("PocketBase binary missing. Run `make pb`.");
  fs.rmSync(DATA, { recursive: true, force: true });
  run(PB, ["migrate", "up", "--dir=.test-ui-data"], PB_DIR);
  run(PB, ["superuser", "upsert", "admin@openroster.local", SUPER_PASSWORD, "--dir=.test-ui-data"], PB_DIR);

  pb = spawn(PB, ["serve", `--http=127.0.0.1:${PB_PORT}`, "--dir=.test-ui-data"], {
    cwd: PB_DIR,
    stdio: ["ignore", "pipe", "pipe"],
  });
  pb.stdout.on("data", (chunk) => { log += chunk; });
  pb.stderr.on("data", (chunk) => { log += chunk; });
  await waitFor(`${PB_URL}/api/health`, "PocketBase");

  const seeded = spawnSync(process.execPath, [path.join(ROOT, "scripts/seed.mjs")], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, PB_URL, PB_SUPERUSER: "admin@openroster.local", PB_SUPERUSER_PASSWORD: SUPER_PASSWORD },
  });
  if (seeded.status !== 0) throw new Error(`seed failed\n${seeded.stdout}\n${seeded.stderr}`);

  web = spawn(process.execPath, [path.join(WEB, "node_modules/next/dist/bin/next"), "start", "-p", String(WEB_PORT)], {
    cwd: WEB,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NEXT_PUBLIC_PB_URL: PB_URL, NEXT_TELEMETRY_DISABLED: "1" },
  });
  web.stdout.on("data", (chunk) => { log += chunk; });
  web.stderr.on("data", (chunk) => { log += chunk; });
  await waitFor(`${WEB_URL}/login`, "Next.js");

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !message.text().includes("ERR_INTERNET_DISCONNECTED") &&
        !message.text().includes("ERR_CONNECTION_REFUSED") &&
        !message.text().includes("ERR_INCOMPLETE_CHUNKED_ENCODING")
      ) errors.push(message.text());
    });

    await page.goto(`${WEB_URL}/login`, { waitUntil: "networkidle" });
    await page.fill("#email", "jordan@harborhearth.co");
    await page.fill("#password", "OpenRoster123!");
    await page.click("button[type=submit]");
    await page.waitForURL(`${WEB_URL}/`, { timeout: 20000 });
    await page.waitForTimeout(1200);

    const dashboard = await page.locator("main").innerText();
    assert.match(dashboard, /ON TODAY|Your week/);
    assert.match(dashboard, /Alpha/);
    console.log("PASS dashboard");

    await page.getByRole("button", { name: "Notifications" }).first().click();
    await page.getByRole("dialog").waitFor();
    assert.match(await page.getByRole("dialog").innerText(), /Welcome to OpenRoster/);
    await page.keyboard.press("Escape");
    console.log("PASS notification bell");

    await page.goto(`${WEB_URL}/schedule`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    assert.equal(await page.locator("h1").first().innerText(), "Schedule");
    assert.match(await page.locator("main").innerText(), /Scheduled labor budget/);
    console.log("PASS schedule and labor budget");

    await page.getByRole("button", { name: /Auto-fill/ }).click();
    await page.getByRole("dialog").waitFor();
    assert.match(await page.getByRole("dialog").innerText(), /Auto-fill open shifts/);
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    console.log("PASS auto-fill confirm");

    await page.getByTestId("schedule-view-day").click();
    await page.waitForTimeout(500);
    assert.match(await page.getByTestId("range-label").innerText(), /day,/);
    await page.getByTestId("schedule-view-2weeks").click();
    await page.waitForTimeout(500);
    assert.match(await page.getByTestId("range-label").innerText(), /–/);
    assert.equal(await page.locator("[data-week-row]").count(), 2);
    await page.getByTestId("schedule-view-4weeks").click();
    await page.waitForTimeout(500);
    assert.match(await page.getByTestId("range-label").innerText(), /–/);
    assert.equal(await page.locator("[data-week-row]").count(), 4);
    await page.getByTestId("schedule-view-month").click();
    await page.waitForTimeout(500);
    assert.match(await page.getByTestId("range-label").innerText(), /\d{4}/);
    assert.equal(await page.getByRole("button", { name: "Timeline" }).count(), 0);
    assert.ok(await page.getByTestId("weekday-header").isVisible());
    assert.ok(await page.getByTestId("month-grid").isVisible());
    assert.ok(await page.locator("[data-day-cell]").count() >= 35);
    assert.ok(await page.getByRole("button", { name: /more · view day/ }).count() > 0);
    await page.getByTestId("schedule-view-week").click();
    await page.waitForTimeout(700);

    // color truth: rails follow departments, never hash-of-position
    const railMismatch = await page.evaluate(() => {
      const legend = new Set();
      document.querySelectorAll("[data-department-dot]").forEach((dot) => {
        legend.add(getComputedStyle(dot).backgroundColor);
      });
      const cardColors = new Set();
      document.querySelectorAll("[data-shift-id]").forEach((card) => {
        const style = getComputedStyle(card);
        if (style.borderLeftWidth === "3px" && card.offsetParent !== null) {
          cardColors.add(style.borderLeftColor);
        }
      });
      const offLegend = [...cardColors].filter(
        (color) => !legend.has(color) && color !== "rgb(216, 210, 194)",
      );
      return { total: cardColors.size, offLegend: offLegend.length };
    });
    assert.equal(railMismatch.offLegend, 0, `card rails use colors outside the department legend: ${JSON.stringify(railMismatch)}`);
    console.log("PASS department rail color truth");

    // URL state: switching views updates the URL and survives a reload
    await page.getByTestId("schedule-view-month").click();
    await page.waitForTimeout(700);
    assert.match(page.url(), /view=month/);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    assert.equal(await page.getByTestId("schedule-view-month").getAttribute("aria-selected"), "true", "month tab selected after reload");
    assert.ok(await page.getByTestId("month-grid").isVisible(), "month grid restored from URL");
    await page.getByTestId("schedule-view-week").click();
    await page.getByRole("button", { name: /This week/ }).first().click();
    await page.waitForTimeout(700);
    console.log("PASS schedule url state");

    // deterministic open shift for drag/copy/paste — independent of seed availability
    const firstDay = await page.locator("[data-day-cell]").first().getAttribute("data-day-cell");
    const secondDay = await page.locator("[data-day-cell]").nth(1).getAttribute("data-day-cell");
    const testShift = await page.evaluate(async ({ pbUrl, firstDayInput }) => {
      const auth = JSON.parse(localStorage.getItem("pocketbase_auth") || "{}");
      const headers = { Authorization: auth.token, "Content-Type": "application/json" };
      const bootstrap = await (await fetch(`${pbUrl}/api/openroster/bootstrap`, { headers })).json();
      const res = await fetch(`${pbUrl}/api/collections/shifts/records`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          company: bootstrap.company.id,
          starts_at: `${firstDayInput}T17:00:00.000Z`,
          ends_at: `${firstDayInput}T18:00:00.000Z`,
          local_date: `${firstDayInput} 00:00:00.000Z`,
          local_start: "09:00",
          local_end: "10:00",
          break_minutes: 0,
          status: "draft",
          source: "manual",
          notes: "ui-smoke drag test",
        }),
      });
      return res.ok ? await res.json() : null;
    }, { pbUrl: PB_URL, firstDayInput: firstDay });
    assert.ok(testShift?.id, "drag test shift created");
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    const testCard = page.locator(`[data-shift-id="${testShift.id}"]`).first();
    await testCard.scrollIntoViewIfNeeded();

    await testCard.click({ button: "right" });
    await page.getByRole("menu").waitFor();
    assert.match(await page.getByRole("menu").innerText(), /Copy shift/);
    assert.match(await page.getByRole("menu").innerText(), /Repeat next week/);
    assert.match(await page.getByRole("menu").innerText(), /Delete shift/);
    await page.getByRole("menuitem", { name: /copy shift/i }).click();
    await page.waitForTimeout(300);
    assert.match(await page.locator(".fixed.bottom-5").innerText(), /Shift copied/);

    await page.evaluate(({ shiftId, targetDayInput }) => {
      const source = document.querySelector(`[data-shift-id="${shiftId}"]`);
      const target = document.querySelector(`[data-day-cell="${targetDayInput}"]`);
      if (!source || !target) throw new Error("drag nodes missing");
      const transfer = new DataTransfer();
      source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }));
      target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }, { shiftId: testShift.id, targetDayInput: secondDay });
    await page.getByText(/moved to/i).first().waitFor({ timeout: 8000 });
    const moved = await page.evaluate(async ({ pbUrl, shiftId }) => {
      const auth = JSON.parse(localStorage.getItem("pocketbase_auth") || "{}");
      const res = await fetch(`${pbUrl}/api/collections/shifts/records/${shiftId}`, { headers: { Authorization: auth.token } });
      return res.ok ? await res.json() : null;
    }, { pbUrl: PB_URL, shiftId: testShift.id });
    assert.equal(moved.local_date.slice(0, 10), secondDay, "drag updates local_date");
    console.log("PASS drag-to-move");

    await page.getByTestId("schedule-view-month").click();
    await page.waitForTimeout(500);
    const emptyDay = page.locator("[data-day-cell]").locator("button", { hasText: "+ Add shift" }).first();
    await emptyDay.click({ button: "right" });
    await page.getByRole("menuitem", { name: /Paste (shift )?here/i }).click();
    await page.getByText(/Created 1 shift/).first().waitFor({ timeout: 8000 });
    const pastedId = await page.evaluate(async (pbUrl) => {
      const auth = JSON.parse(localStorage.getItem("pocketbase_auth") || "{}");
      const res = await fetch(`${pbUrl}/api/collections/shifts/records?perPage=1&sort=-created`, {
        headers: { Authorization: auth.token },
      });
      return (await res.json()).items?.[0]?.id || "";
    }, PB_URL);
    assert.ok(pastedId, "pasted shift exists");
    await page.locator(`[data-shift-id="${pastedId}"]`).first().click({ button: "right" });
    await page.getByRole("menuitem", { name: /delete shift/i }).click();
    await page.waitForTimeout(500);
    assert.match(await page.locator(".fixed.bottom-5").innerText(), /Shift deleted/);
    await page.locator(".fixed.bottom-5").getByRole("button", { name: /Undo/i }).click();
    await page.waitForTimeout(700);
    assert.match(await page.locator(".fixed.bottom-5").innerText(), /restored/i);

    await page.getByTestId("schedule-view-week").click();
    await page.waitForTimeout(600);
    const openShift = page.locator("[data-shift-id]").filter({ hasText: "Open" }).first();
    await openShift.click({ button: "right" });
    await page.getByRole("menuitem", { name: /repeat next week/i }).click();
    await page.waitForTimeout(900);
    assert.match(await page.locator(".fixed.bottom-5").innerText(), /Created 1 repeated shift/);
    console.log("PASS schedule views and shift context menu");

    await page.getByRole("button", { name: /Add shift/ }).first().click();
    await page.getByRole("dialog").waitFor();
    const unlabeled = await page.evaluate(() =>
      [...document.querySelectorAll("label")].filter((label) => !label.htmlFor && !label.querySelector("input,select,textarea")).length
    );
    assert.equal(unlabeled, 0, "every label is associated with a control");
    assert.match(await page.getByRole("dialog").innerText(), /Create a shift/);
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.match(await page.evaluate(() => document.activeElement?.textContent?.trim() || ""), /Add shift/);
    await page.getByRole("button", { name: /Add shift/ }).first().click();
    await page.getByRole("dialog").waitFor();
    await page.getByRole("dialog").getByRole("button", { name: "Add shift" }).click();
    await page.waitForTimeout(900);
    assert.match(await page.locator(".fixed.bottom-5").innerText(), /Shift added/);
    console.log("PASS shift modal and create");

    await page.goto(`${WEB_URL}/payroll`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    assert.equal(await page.locator("h1").first().innerText(), "Payroll");

    const stubId = await page.evaluate(async (pbUrl) => {
      const auth = JSON.parse(localStorage.getItem("pocketbase_auth") || "{}");
      const res = await fetch(`${pbUrl}/api/collections/pay_stubs/records?perPage=1`, {
        headers: { Authorization: auth.token },
      });
      const data = await res.json();
      return data.items?.[0]?.id || "";
    }, PB_URL);
    assert.ok(stubId, "a pay stub exists");
    await page.goto(`${WEB_URL}/payroll/stub/${stubId}`, { waitUntil: "networkidle" });
    await page.getByText("Pay statement").waitFor({ timeout: 10000 });
    assert.match(await page.locator("main").innerText(), /pay statement/i);
    assert.match(await page.locator("main").innerText(), /Print \/ Save PDF/);
    console.log("PASS printable pay stub");

    await page.goto(`${WEB_URL}/timeclock`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: "Export punches" }).waitFor({ timeout: 10000 });
    console.log("PASS manager punch export");

    await page.goto(`${WEB_URL}/calendar`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    assert.equal(await page.locator("h1").first().innerText(), "Time-off calendar");
    console.log("PASS time-off calendar");

    await page.goto(`${WEB_URL}/reports`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    assert.equal(await page.locator("h1").first().innerText(), "Reports");
    assert.match(await page.locator("main").innerText(), /OT forecast/i);
    assert.match(await page.locator("main").innerText(), /PTO liability/i);
    assert.match(await page.locator("main").innerText(), /Labor by location/i);
    console.log("PASS richer reports");

    await page.goto(`${WEB_URL}/forecast`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    assert.equal(await page.locator("h1").first().innerText(), "Demand forecast");
    const nextWeek = await page.evaluate(() => {
      const d = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      return d;
    });
    await page.locator('input[type="date"]').first().fill(nextWeek);
    await page.waitForTimeout(500);
    const coversInput = page.locator('input[type="number"][placeholder="Covers"]').first();
    await coversInput.fill("80");
    await page.getByRole("button", { name: "Recommend" }).click();
    await page.getByText("Why this coverage").waitFor({ timeout: 10000 });
    assert.match(await page.locator("main").innerText(), /people/);
    await page.getByRole("button", { name: "Create draft shifts" }).click();
    await page.waitForTimeout(800);
    assert.match(await page.locator(".fixed.bottom-5").innerText(), /draft shifts/);
    console.log("PASS demand forecast");

    await page.goto(`${WEB_URL}/templates`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    assert.equal(await page.locator("h1").first().innerText(), "Shift templates");
    console.log("PASS templates page");

    await page.evaluate(() => localStorage.clear());
    await page.goto(`${WEB_URL}/login`, { waitUntil: "networkidle" });
    await page.fill("#email", "sam@harborhearth.co");
    await page.fill("#password", "OpenRoster123!");
    await page.click("button[type=submit]");
    await page.waitForURL(`${WEB_URL}/`, { timeout: 20000 });
    await page.goto(`${WEB_URL}/swaps`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    assert.equal(await page.locator("h1").first().innerText(), "Shift swaps");
    console.log("PASS swaps page");

    await page.goto(`${WEB_URL}/me`, { waitUntil: "networkidle" });
    await page.waitForURL(/\/people\//, { timeout: 20000 });
    await page.waitForTimeout(900);
    assert.match(await page.locator("h1").first().innerText(), /Sam Rivera/);
    assert.match(await page.locator("main").innerText(), /Weekly availability/);
    console.log("PASS employee self-service");

    await page.evaluate(() => localStorage.removeItem("openroster.offline-punches.v1"));
    await page.goto(`${WEB_URL}/timeclock`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Clock in" }).waitFor({ timeout: 10000 });
    await page.context().setOffline(true);
    await page.getByRole("button", { name: "Clock in" }).click();
    await page.waitForTimeout(700);
    assert.match(await page.locator("main").innerText(), /Offline|waiting to sync/i);
    const queued = await page.evaluate(() => JSON.parse(localStorage.getItem("openroster.offline-punches.v1") || "[]"));
    assert.equal(queued.length, 1, "offline punch queued");
    await page.context().setOffline(false);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("openroster.offline-punches.v1") || "[]").length === 0, null, { timeout: 15000 });
    await page.getByRole("button", { name: "Clock out" }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Clock out" }).click();
    await page.getByRole("button", { name: "Clock in" }).waitFor({ timeout: 10000 });
    const manifest = await fetch(`${WEB_URL}/manifest.webmanifest`);
    assert.equal(manifest.status, 200);
    assert.match(await manifest.text(), /OpenRoster/);
    console.log("PASS offline clock queue and PWA manifest");

    pb.kill("SIGKILL");
    await page.goto(`${WEB_URL}/login`, { waitUntil: "domcontentloaded" });
    await page.getByText(/Cannot reach PocketBase/i).waitFor({ timeout: 15000 });
    console.log("PASS unreachable PocketBase banner");
    pb = spawn(PB, ["serve", `--http=127.0.0.1:${PB_PORT}`, "--dir=.test-ui-data"], {
      cwd: PB_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitFor(`${PB_URL}/api/health`, "PocketBase");

    assert.deepEqual([...new Set(errors)], []);
    console.log("ALL UI TESTS PASSED");
  } finally {
    await browser.close();
  }
}

main()
  .catch((error) => {
    console.error(error);
    if (log) console.error(log.slice(-8000));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (web) web.kill("SIGTERM");
    if (pb) pb.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 500));
    fs.rmSync(DATA, { recursive: true, force: true });
    process.exit(process.exitCode || 0);
  });
