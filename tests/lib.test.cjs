const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("../pb/pb_hooks/lib.js");

function record(data = {}) {
  return {
    getString: (key) => (data[key] === undefined || data[key] === null ? "" : String(data[key])),
    getFloat: (key) => Number(data[key] || 0),
    getBool: (key) => Boolean(data[key]),
    get: (key) => data[key],
  };
}

function company(overrides = {}) {
  return record({ pay_frequency: "biweekly", overtime_multiplier: 1.5, week_start: "1", ...overrides });
}

function employee(overrides = {}) {
  return record({ pay_type: "hourly", pay_rate: 20, ...overrides });
}

function rule(overrides = {}) {
  return record({ calc: "percent", rate: 0, applies_to: "gross", employer: false, ...overrides });
}

test("hourly stub pays regular, overtime and PTO", () => {
  const stub = h.buildStub(company(), employee(), { regular: 40, overtime: 5, pto: 2 }, [], 14);
  assert.equal(stub.regular_pay, 800);
  assert.equal(stub.overtime_pay, 150);
  assert.equal(stub.pto_pay, 40);
  assert.equal(stub.gross_pay, 990);
  assert.equal(stub.net_pay, 990);
});

test("rules split employee taxes, deductions and employer cost", () => {
  const rules = [
    rule({ name: "Federal", type: "federal_tax", calc: "percent", rate: 10 }),
    rule({ name: "Health", type: "health", calc: "fixed_per_period", rate: 50 }),
    rule({ name: "Employer SS", type: "social_security", calc: "percent", rate: 6.2, employer: true }),
  ];
  const stub = h.buildStub(company(), employee(), { regular: 40, overtime: 0, pto: 0 }, rules, 14);
  assert.equal(stub.gross_pay, 800);
  assert.equal(stub.employee_taxes, 80);
  assert.equal(stub.employee_deductions, 50);
  assert.equal(stub.employer_taxes, 49.6);
  assert.equal(stub.net_pay, 670);
  assert.equal(stub.breakdown.length, 3);
});

test("salary is prorated by calendar days", () => {
  const salaried = employee({ pay_type: "salary", pay_rate: 73000 });
  const twoWeeks = h.buildStub(company(), salaried, { regular: 0, overtime: 0, pto: 0 }, [], 14);
  const oneWeek = h.buildStub(company(), salaried, { regular: 0, overtime: 0, pto: 0 }, [], 7);
  assert.equal(twoWeeks.regular_pay, 2800);
  assert.equal(oneWeek.regular_pay, 1400);
  assert.equal(twoWeeks.overtime_pay, 0);
});

test("percent rules can apply to regular pay only", () => {
  const rules = [rule({ name: "Regular only", type: "retirement", calc: "percent", rate: 5, applies_to: "regular" })];
  const stub = h.buildStub(company(), employee(), { regular: 10, overtime: 10, pto: 0 }, rules, 14);
  assert.equal(stub.gross_pay, 500);
  assert.equal(stub.employee_deductions, 10);
});

test("daily overtime is applied before weekly overtime", () => {
  const result = h.computeTimesheetHours(
    { "2026-11-02": 8 * 60, "2026-11-03": 9 * 60, "2026-11-04": 8 * 60 },
    8,
    40,
  );
  assert.equal(result.daily["2026-11-02"].regular, 8);
  assert.equal(result.daily["2026-11-03"].regular, 8);
  assert.equal(result.daily["2026-11-03"].overtime, 1);
  assert.equal(result.regular, 24);
  assert.equal(result.overtime, 1);
});

test("weekly overtime converts regular hours over the cap", () => {
  const week = {
    "2026-11-02": 8 * 60,
    "2026-11-03": 8 * 60,
    "2026-11-04": 8 * 60,
    "2026-11-05": 8 * 60,
    "2026-11-06": 8 * 60,
    "2026-11-07": 8 * 60,
  };
  const result = h.computeTimesheetHours(week, 12, 40);
  assert.equal(result.regular, 40);
  assert.equal(result.overtime, 8);
});

test("punches pair into daily worked minutes and ignore an open punch", () => {
  const app = {
    findRecordsByFilter: () => [
      record({ type: "in", punched_at: "2026-11-02 09:00:00.000Z" }),
      record({ type: "out", punched_at: "2026-11-02 17:00:00.000Z" }),
      record({ type: "in", punched_at: "2026-11-03 09:00:00.000Z" }),
    ],
  };
  const result = h.workedMinutesByDay(app, "emp", "2026-11-01", "2026-11-07");
  assert.deepEqual(result, { "2026-11-02": 480 });
});

test("small helpers keep date and time semantics correct", () => {
  assert.equal(h.round2(1.234), 1.23);
  assert.equal(h.minutesOfDay("09:30"), 570);
  assert.equal(h.weekKey("2026-11-08"), "2026-11-02");
  assert.equal(h.addDays("2026-11-02", 7), "2026-11-09");
  assert.equal(h.weekStartDate("2026-11-06", 1), "2026-11-02");
  assert.equal(h.weekStartDate("2026-11-06", 0), "2026-11-01");
  assert.equal(h.overlaps(0, 10, 5, 20), true);
  assert.equal(h.overlaps(0, 10, 10, 20), false);
});

test("shiftDate prefers the stored local date", () => {
  const shift = record({ starts_at: "2026-11-03 01:00:00.000Z", local_date: "2026-11-02 00:00:00.000Z" });
  assert.equal(h.shiftDate(shift), "2026-11-02");
});

test("pbDate-style timestamps are parsed across platforms", () => {
  assert.equal(h.toMs("2026-11-02 09:00:00.000Z"), Date.parse("2026-11-02T09:00:00.000Z"));
});

test("pay period generation follows weekly, biweekly, semimonthly and monthly calendars", () => {
  const weekly = h.generatePayPeriods("weekly", "2026-11-02", "2026-11-15", 1, 5);
  assert.deepEqual(weekly.map((p) => [p.start, p.end]), [
    ["2026-11-02", "2026-11-08"],
    ["2026-11-09", "2026-11-15"],
  ]);

  const biweekly = h.generatePayPeriods("biweekly", "2026-11-02", "2026-11-29", 1, 5);
  assert.deepEqual(biweekly.map((p) => [p.start, p.end]), [
    ["2026-11-02", "2026-11-15"],
    ["2026-11-16", "2026-11-29"],
  ]);
  assert.equal(biweekly[0].pay_date, "2026-11-20");

  const semi = h.generatePayPeriods("semimonthly", "2026-11-01", "2026-11-30", 1, 5);
  assert.deepEqual(semi.map((p) => [p.start, p.end]), [
    ["2026-11-01", "2026-11-15"],
    ["2026-11-16", "2026-11-30"],
  ]);

  const monthly = h.generatePayPeriods("monthly", "2026-11-01", "2026-12-31", 1, 5);
  assert.deepEqual(monthly.map((p) => [p.start, p.end]), [
    ["2026-11-01", "2026-11-30"],
    ["2026-12-01", "2026-12-31"],
  ]);
});

test("geofence distance is in meters", () => {
  assert.equal(h.distanceMeters(37.7955, -122.3937, 37.7955, -122.3937), 0);
  const oneDegree = h.distanceMeters(0, 0, 0, 1);
  assert.ok(oneDegree > 110000 && oneDegree < 112000);
});

test("breaks are subtracted from worked minutes and rounding is applied", () => {
  const app = {
    findRecordsByFilter: () => [
      record({ type: "in", punched_at: "2026-11-02 09:00:00.000Z" }),
      record({ type: "break_start", punched_at: "2026-11-02 12:00:00.000Z" }),
      record({ type: "break_end", punched_at: "2026-11-02 12:30:00.000Z" }),
      record({ type: "out", punched_at: "2026-11-02 17:00:00.000Z" }),
    ],
  };
  assert.deepEqual(h.workedMinutesByDay(app, "emp", "2026-11-01", "2026-11-07"), { "2026-11-02": 450 });
  assert.deepEqual(h.workedMinutesByDay(app, "emp", "2026-11-01", "2026-11-07", 30), { "2026-11-02": 450 });
  assert.equal(h.roundMinutes(452, 15), 450);
  assert.equal(h.roundMinutes(458, 15), 465);
});
