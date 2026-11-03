import test from "node:test";
import assert from "node:assert/strict";
import { money } from "../src/lib/format.ts";
import { formatDate, setLocale } from "../src/lib/dates.ts";

test("money formats non-USD locales", () => {
  assert.match(money(1234.5, "EUR", "de-DE"), /1\.234,50/);
  assert.match(money(1234.5, "USD", "en-US"), /\$1,234\.50/);
});

test("date formatting follows the configured locale", () => {
  setLocale("de-DE");
  assert.match(formatDate("2026-11-02T12:00:00Z", "UTC"), /Nov/);
  setLocale("en-US");
  assert.equal(formatDate("2026-11-02T12:00:00Z", "UTC"), "Nov 2, 2026");
});
