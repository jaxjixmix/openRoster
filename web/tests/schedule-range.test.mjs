import test from "node:test";
import assert from "node:assert/strict";
import { scheduleRange } from "../src/lib/dates.ts";

test("day view is one day", () => {
  const range = scheduleRange("2026-11-04", "day", 1);
  assert.equal(range.start, "2026-11-04");
  assert.equal(range.end, "2026-11-05");
  assert.deepEqual(range.days, ["2026-11-04"]);
});

test("week, two-week and four-week views start on Monday", () => {
  const week = scheduleRange("2026-11-04", "week", 1);
  assert.equal(week.start, "2026-11-02");
  assert.equal(week.end, "2026-11-09");
  assert.equal(week.days.length, 7);

  const two = scheduleRange("2026-11-04", "2weeks", 1);
  assert.equal(two.start, "2026-11-02");
  assert.equal(two.end, "2026-11-16");
  assert.equal(two.days.length, 14);

  const four = scheduleRange("2026-11-04", "4weeks", 1);
  assert.equal(four.start, "2026-11-02");
  assert.equal(four.end, "2026-11-30");
  assert.equal(four.days.length, 28);
});

test("month view covers whole calendar weeks", () => {
  const range = scheduleRange("2026-11-15", "month", 1);
  assert.equal(range.start, "2026-10-26");
  assert.equal(range.end, "2026-12-07");
  assert.equal(range.days.length, 42);
  assert.equal(range.days[0], "2026-10-26");
  assert.equal(range.days.at(-1), "2026-12-06");
});

test("month view respects a Sunday week start", () => {
  const range = scheduleRange("2026-11-15", "month", 0);
  assert.equal(range.start, "2026-11-01");
  assert.equal(range.end, "2026-12-06");
  assert.equal(range.days.length, 35);
});
