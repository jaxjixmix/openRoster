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
      if (message.type() === "error") errors.push(message.text());
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

    await page.goto(`${WEB_URL}/schedule`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    assert.equal(await page.locator("h1").first().innerText(), "Schedule");
    console.log("PASS schedule");

    await page.getByRole("button", { name: /Add shift/ }).first().click();
    await page.getByRole("dialog").waitFor();
    assert.match(await page.getByRole("dialog").innerText(), /Create a shift/);
    await page.getByRole("dialog").getByRole("button", { name: "Add shift" }).click();
    await page.waitForTimeout(900);
    assert.match(await page.locator(".fixed.bottom-5").innerText(), /Shift added/);
    console.log("PASS shift modal and create");

    await page.goto(`${WEB_URL}/payroll`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    assert.equal(await page.locator("h1").first().innerText(), "Payroll");
    console.log("PASS payroll");

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
