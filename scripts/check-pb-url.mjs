#!/usr/bin/env node
// Asserts the web production build has an embedded PocketBase URL.
// Usage: node scripts/check-pb-url.mjs [expected-host:port]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const expected = process.argv[2] || "";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "web", ".next", "static");

let hits = 0;
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".js") && fs.readFileSync(full, "utf8").includes(expected)) hits++;
  }
};
try {
  walk(root);
} catch (err) {
  console.error(`No web build at ${root}. Run the web build first.`);
  process.exit(1);
}
if (expected && hits === 0) {
  console.error(`Web build does not reference ${expected}. Rebuild with NEXT_PUBLIC_PB_URL=${expected}.`);
  process.exit(1);
}
console.log(`PocketBase URL check passed (${expected || "any URL"} referenced by ${hits} chunk(s)).`);
