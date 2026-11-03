#!/usr/bin/env node
// Browser test for the first-run setup wizard. Build with
// NEXT_PUBLIC_PB_URL=http://127.0.0.1:18097 first.
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
const DATA = path.join(PB_DIR, ".test-setup-ui-data");
const PB_PORT = Number(process.env.TEST_PB_PORT || 18097);
const WEB_PORT = Number(process.env.TEST_WEB_PORT || 3001);
const PB_URL = `http://127.0.0.1:${PB_PORT}`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

let pb = null;
let web = null;
let log = "";

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} failed\n${result.stdout}\n${result.stderr}`);
}

async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${url} did not become ready`);
}

async function main() {
  if (!fs.existsSync(PB)) throw new Error("PocketBase binary missing. Run `make pb`.");
  fs.rmSync(DATA, { recursive: true, force: true });
  run(PB, ["migrate", "up", "--dir=.test-setup-ui-data"], PB_DIR);

  pb = spawn(PB, ["serve", `--http=127.0.0.1:${PB_PORT}`, "--dir=.test-setup-ui-data"], {
    cwd: PB_DIR,
    stdio: ["ignore", "pipe", "pipe"],
  });
  pb.stdout.on("data", (chunk) => { log += chunk; });
  pb.stderr.on("data", (chunk) => { log += chunk; });
  await waitFor(`${PB_URL}/api/health`);

  web = spawn(process.execPath, [path.join(WEB, "node_modules/next/dist/bin/next"), "start", "-p", String(WEB_PORT)], {
    cwd: WEB,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NEXT_PUBLIC_PB_URL: PB_URL, NEXT_TELEMETRY_DISABLED: "1" },
  });
  web.stdout.on("data", (chunk) => { log += chunk; });
  web.stderr.on("data", (chunk) => { log += chunk; });
  await waitFor(`${WEB_URL}/login`);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto(`${WEB_URL}/login`, { waitUntil: "networkidle" });
    await page.waitForURL(`${WEB_URL}/setup`, { timeout: 15000 });
    console.log("PASS empty workspace redirects to setup");

    await page.getByPlaceholder("Harbor & Hearth").fill("Setup UI Co");
    await page.getByPlaceholder("Ferry Building", { exact: true }).fill("Main Street");
    await page.getByPlaceholder("1 Ferry Building, San Francisco, CA").fill("1 Main St");
    await page.getByPlaceholder("Maya Chen").fill("Test Admin");
    await page.getByPlaceholder("maya@company.com").fill("admin@example.com");
    await page.getByPlaceholder("At least 10 characters").fill("a-very-long-password");
    await page.getByRole("button", { name: /Create workspace/ }).click();

    await page.waitForURL(`${WEB_URL}/`, { timeout: 20000 });
    await page.waitForTimeout(1200);
    assert.match(await page.locator("main").innerText(), /ON TODAY|Your week/);
    assert.match(await page.locator("main").innerText(), /Good (morning|afternoon|evening), Test\./);
    console.log("PASS setup wizard creates and signs in");

    assert.deepEqual([...new Set(errors)], []);
    console.log("ALL SETUP UI TESTS PASSED");
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
