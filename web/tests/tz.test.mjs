import test from "node:test";
import assert from "node:assert/strict";
import { tzOffsetForDate, tzOffsets } from "../src/lib/tz.js";

test("Los Angeles offsets across the DST boundary", () => {
  assert.equal(tzOffsetForDate("2026-03-08", "America/Los_Angeles"), -480);
  assert.equal(tzOffsetForDate("2026-03-09", "America/Los_Angeles"), -420);
  assert.equal(tzOffsetForDate("2026-11-01", "America/Los_Angeles"), -420);
  assert.equal(tzOffsetForDate("2026-11-02", "America/Los_Angeles"), -480);
});

test("New York offsets across the DST boundary", () => {
  assert.equal(tzOffsetForDate("2026-03-08", "America/New_York"), -300);
  assert.equal(tzOffsetForDate("2026-03-09", "America/New_York"), -240);
});

test("week offsets return one value per day and match the date helper", () => {
  const offsets = tzOffsets("2026-03-02", "America/Los_Angeles");
  assert.equal(offsets.length, 7);
  assert.equal(offsets[6], -480);
  assert.equal(tzOffsets("2026-03-09", "America/Los_Angeles")[0], -420);
});
