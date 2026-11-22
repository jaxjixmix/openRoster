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

// ------------------------------------------------------------------ kiosk PIN security
// PocketBase's $security.hs256 is HMAC-SHA256 and $security.sha256 is SHA-256, so the
// hooks can be exercised here against Node's own implementations of the same primitives.
const crypto = require("node:crypto");

globalThis.__kioskDigest = (message, key) => crypto.createHmac("sha256", key).update(message).digest("hex");
global.$security = {
  hs256: globalThis.__kioskDigest,
  sha256: (value) => crypto.createHash("sha256").update(String(value)).digest("hex"),
  equal: (a, b) => String(a) === String(b),
  randomString: (length) => crypto.randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length),
};

const PIN_RECORD = (hash) => record({ kiosk_pin_hash: hash });

test("kiosk PINs are salted, peppered and iterated, and only the right PIN verifies", () => {
  const pin = "4821";
  const hash = h.kioskHashPin(pin, "pepper-one");
  const parsed = h.kioskPinParse(hash);
  assert.equal(parsed.algo, "v2");
  assert.equal(parsed.rounds, h.KIOSK_PIN_ROUNDS);
  assert.ok(parsed.salt.length >= 16);
  assert.notEqual(parsed.digest, crypto.createHash("sha256").update(pin).digest("hex"));
  assert.equal(h.kioskPinVerify(PIN_RECORD(hash), pin, "pepper-one").ok, true);
  assert.equal(h.kioskPinVerify(PIN_RECORD(hash), "4822", "pepper-one").ok, false);
  assert.equal(h.kioskPinVerify(PIN_RECORD(hash), pin, "pepper-two").ok, false);
  assert.equal(h.kioskPinChain(parsed.salt, pin, parsed.rounds, "pepper-one"), parsed.digest);

  const other = h.kioskPinParse(h.kioskHashPin(pin, "pepper-one"));
  assert.notEqual(other.salt, parsed.salt, "each PIN gets its own salt");
  assert.notEqual(other.digest, parsed.digest, "the same PIN never hashes to the same digest");
});

test("legacy sha256 rows still verify once and are flagged for a rehash", () => {
  const legacy = h.kioskPinParse(crypto.createHash("sha256").update("123456").digest("hex"));
  assert.equal(legacy.algo, "legacy");
  const verdict = h.kioskPinVerify(PIN_RECORD(crypto.createHash("sha256").update("123456").digest("hex")), "123456", "pepper");
  assert.equal(verdict.ok, true);
  assert.equal(verdict.needsRehash, true);
  assert.equal(h.kioskPinVerify(PIN_RECORD(crypto.createHash("sha256").update("123456").digest("hex")), "123457", "pepper").ok, false);
  assert.equal(h.kioskPinVerify(PIN_RECORD(""), "123456", "pepper").ok, false);
  assert.equal(h.kioskPinVerify(PIN_RECORD("not-a-hash"), "123456", "pepper").ok, false);
  assert.equal(h.kioskPinVerify(PIN_RECORD(h.kioskHashPin("123456", "pepper")), "123456", "pepper").needsRehash, false);
});

test("weak kiosk PINs are refused with a reason the manager can read", () => {
  assert.match(h.kioskPinIsWeak("123", {}), /4–8 digits/);
  assert.match(h.kioskPinIsWeak("123456789", {}), /4–8 digits/);
  assert.match(h.kioskPinIsWeak("12ab", {}), /4–8 digits/);
  assert.match(h.kioskPinIsWeak("0000", {}), /same digit/);
  assert.match(h.kioskPinIsWeak("55555555", {}), /same digit/);
  assert.match(h.kioskPinIsWeak("1234", {}), /consecutive/);
  assert.match(h.kioskPinIsWeak("987654", {}), /consecutive/);
  assert.match(h.kioskPinIsWeak("121212", {}), /short pattern/);
  assert.match(h.kioskPinIsWeak("4949", {}), /short pattern/);
  assert.match(h.kioskPinIsWeak("0417", { phone: "0417" }), /phone number|date/);
  assert.match(h.kioskPinIsWeak("0417293", { phone: "0417 293" }), /phone number|date/);
  assert.match(h.kioskPinIsWeak("0917", { employee_number: "EMP-0917" }), /phone number|date/);
  assert.match(h.kioskPinIsWeak("0315", { hire_date: "2026-03-15 00:00:00.000Z" }), /phone number|date/);
  assert.equal(h.kioskPinIsWeak("4821", { phone: "0400 111 222", hire_date: "2026-03-15" }), "");
  assert.equal(h.kioskPinIsWeak("918273", {}), "");
});

test("the company-wide PIN fingerprint is stable, peppered and not reversible", () => {
  const key = h.kioskPinKey("4821", "pepper-one");
  assert.equal(key, h.kioskPinKey("4821", "pepper-one"));
  assert.notEqual(key, h.kioskPinKey("4822", "pepper-one"));
  assert.notEqual(key, h.kioskPinKey("4821", "pepper-two"));
  assert.equal(key.length, 32);
  assert.ok(!key.includes("4821"));
});

test("the lockout escalates with each wrong PIN", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 40].map(h.kioskLockSeconds), [0, 0, 0, 10, 30, 300, 900, 1800, 1800]);
  assert.equal(h.kioskLockLabel(10), "10 seconds");
  assert.equal(h.kioskLockLabel(60), "1 minute");
  assert.equal(h.kioskLockLabel(300), "5 minutes");
  assert.equal(h.kioskLockLabel(1800), "30 minutes");
});

// The hooks write their attempt trail through `new Record(collection)` + `app.save`.
class FakeRecord {
  constructor(collection) { this.collection = collection; this.data = {}; }
  set(key, value) { this.data[key] = value; }
  get(key) { return this.data[key]; }
  getString(key) { return this.data[key] === undefined || this.data[key] === null ? "" : String(this.data[key]); }
}
global.Record = FakeRecord;

function fakeApp(rows) {
  return {
    rows: rows,
    findCollectionByNameOrId: (name) => ({ name }),
    save: (row) => { rows.push(row); },
    findRecordsByFilter: (collection, filter, sort, limit, offset, params) => {
      let out = rows.slice();
      if (filter.includes("kind = {:kind}")) out = out.filter((row) => row.get("kind") === params.kind);
      if (filter.includes("employee = {:employee}")) out = out.filter((row) => row.get("employee") === params.employee);
      if (filter.includes("device = {:device}")) out = out.filter((row) => row.get("device") === params.device);
      if (filter.includes("ip_hash = {:ip_hash}")) out = out.filter((row) => row.get("ip_hash") === params.ip_hash);
      if (filter.includes("at >= {:since}")) out = out.filter((row) => row.get("at") >= params.since);
      out.sort((a, b) => (a.get("at") < b.get("at") ? 1 : -1));
      return out.slice(0, limit);
    },
  };
}

function authEvent(kind, at, extra = {}) {
  return record({ kind, at: h.kioskTimestamp(at), ...extra });
}

test("three wrong PINs lock the employee out for ten seconds", () => {
  const now = Date.now();
  const app = fakeApp([
    authEvent("fail", now - 20000, { employee: "emp1", device: "dev1" }),
    authEvent("fail", now - 10000, { employee: "emp1", device: "dev1" }),
    authEvent("fail", now - 1000, { employee: "emp1", device: "dev1" }),
  ]);
  const state = h.kioskLockState(app, { employee: "emp1" }, h.KIOSK_EMPLOYEE_FAIL_LIMIT, h.KIOSK_PIN_WINDOW_MS, null);
  assert.equal(state.fails, 3);
  assert.ok(state.retryAfter >= 8 && state.retryAfter <= 10, `retryAfter was ${state.retryAfter}`);
  assert.equal(state.attemptsLeft, 0);

  const two = h.kioskLockState(fakeApp(app.rows.slice(1)), { employee: "emp1" }, h.KIOSK_EMPLOYEE_FAIL_LIMIT, h.KIOSK_PIN_WINDOW_MS, null);
  assert.equal(two.fails, 2);
  assert.equal(two.retryAfter, 0);
  assert.equal(two.attemptsLeft, 1);

  const old = h.kioskLockState(fakeApp([authEvent("fail", now - h.KIOSK_PIN_WINDOW_MS - 60000, { employee: "emp1" })]), { employee: "emp1" }, h.KIOSK_EMPLOYEE_FAIL_LIMIT, h.KIOSK_PIN_WINDOW_MS, null);
  assert.equal(old.fails, 0, "an old failure falls out of the window");
});

test("a successful punch or a manager reset clears the running count", () => {
  const now = Date.now();
  const fails = [authEvent("fail", now - 30000, { employee: "emp1" }), authEvent("fail", now - 20000, { employee: "emp1" }), authEvent("fail", now - 10000, { employee: "emp1" })];
  const sincePunch = h.kioskLockState(fakeApp(fails), { employee: "emp1" }, h.KIOSK_EMPLOYEE_FAIL_LIMIT, h.KIOSK_PIN_WINDOW_MS, null, now - 5000);
  assert.equal(sincePunch.fails, 0);
  assert.equal(sincePunch.retryAfter, 0);

  const rows = fails.concat([authEvent("reset", now - 4000, { employee: "emp1" })]);
  const afterReset = h.kioskLockState(fakeApp(rows), { employee: "emp1" }, h.KIOSK_EMPLOYEE_FAIL_LIMIT, h.KIOSK_PIN_WINDOW_MS, null);
  assert.equal(afterReset.fails, 0, "a manager reset clears the lock");
});

test("a locked scope answers 429 with a retry delay, otherwise 401", () => {
  const now = Date.now();
  const app = fakeApp([]);
  const calls = [];
  const e = { json: (status, body) => { calls.push({ status, body }); return { status, body }; } };

  h.kioskAuthEvent(app, "fail", { employee: "emp1", device: "dev1", ip_hash: "abc" });
  assert.equal(app.rows.length, 1, "the attempt is written to the trail");
  assert.equal(app.rows[0].getString("kind"), "fail");
  assert.ok(!app.rows[0].getString("at").includes("T"), "stored in PocketBase's date format");

  const open = h.kioskLockState(app, { employee: "emp1" }, h.KIOSK_EMPLOYEE_FAIL_LIMIT, h.KIOSK_PIN_WINDOW_MS, null);
  assert.equal(open.retryAfter, 0);
  assert.equal(open.attemptsLeft, 2);

  for (let i = 0; i < 2; i++) h.kioskAuthEvent(app, "fail", { employee: "emp1", ip_hash: "abc" });
  const locked = h.kioskLockState(app, { employee: "emp1" }, h.KIOSK_EMPLOYEE_FAIL_LIMIT, h.KIOSK_PIN_WINDOW_MS, null);
  assert.equal(locked.fails, 3);
  assert.ok(locked.retryAfter >= 8 && locked.retryAfter <= 10);

  const refusal = h.kioskLocked(e, "Too many wrong PINs.", locked.retryAfter);
  assert.equal(refusal.status, 429);
  assert.equal(refusal.body.data.locked, true);
  assert.ok(refusal.body.data.retry_after >= 8 && refusal.body.data.retry_after <= 10);
  assert.match(refusal.body.message, /Too many wrong PINs/);
});

test("the device budget locks a tablet that fails across employees", () => {
  const now = Date.now();
  const rows = [];
  for (let i = 0; i < h.KIOSK_DEVICE_FAIL_LIMIT; i++) rows.push(authEvent("fail", now - 1000 - i, { device: "dev1", employee: "emp" + i }));
  const state = h.kioskLockState(fakeApp(rows), { device: "dev1" }, h.KIOSK_DEVICE_FAIL_LIMIT, h.KIOSK_PIN_WINDOW_MS, h.KIOSK_DEVICE_LOCK_SECONDS);
  assert.equal(state.fails, h.KIOSK_DEVICE_FAIL_LIMIT);
  assert.ok(state.retryAfter > 800 && state.retryAfter <= h.KIOSK_DEVICE_LOCK_SECONDS);
  const otherDevice = h.kioskLockState(fakeApp(rows), { device: "dev2" }, h.KIOSK_DEVICE_FAIL_LIMIT, h.KIOSK_PIN_WINDOW_MS, h.KIOSK_DEVICE_LOCK_SECONDS);
  assert.equal(otherDevice.retryAfter, 0);
});

test("pairing attempts are capped per client address", () => {
  const now = Date.now();
  const rows = [];
  for (let i = 0; i < h.KIOSK_PAIR_FAIL_LIMIT; i++) rows.push(authEvent("fail", now - 500 - i, { ip_hash: "abc" }));
  const state = h.kioskLockState(fakeApp(rows), { ip_hash: "abc" }, h.KIOSK_PAIR_FAIL_LIMIT, h.KIOSK_PAIR_WINDOW_MS, h.KIOSK_PAIR_LOCK_SECONDS);
  assert.ok(state.retryAfter > 500 && state.retryAfter <= h.KIOSK_PAIR_LOCK_SECONDS);
  assert.equal(h.kioskLockState(fakeApp(rows), { ip_hash: "def" }, h.KIOSK_PAIR_FAIL_LIMIT, h.KIOSK_PAIR_WINDOW_MS, h.KIOSK_PAIR_LOCK_SECONDS).retryAfter, 0);
});

test("the attempt trail stores a hash of the address, never the address", () => {
  const hash = h.kioskIpHash({ realIP: () => "203.0.113.42" });
  assert.equal(hash.length, 32);
  assert.ok(!hash.includes("203"));
  assert.equal(hash, h.kioskIpHash({ realIP: () => "203.0.113.42" }));
  assert.notEqual(hash, h.kioskIpHash({ realIP: () => "203.0.113.43" }));
  assert.equal(h.kioskIpHash({}), "");
});

test("the attempt trail is written in PocketBase's own date format", () => {
  const stored = h.kioskTimestamp(Date.parse("2026-11-22T23:05:57.907Z"));
  assert.equal(stored, "2026-11-22 23:05:57.907Z");
  assert.ok(!stored.includes("T"), "a T separator would sort before every stored row");
  assert.ok(h.toMs(stored) > 0, "the stored form parses back");

  const now = Date.now();
  const app = fakeApp([authEvent("fail", now - 1000, { employee: "emp1" })]);
  const state = h.kioskLockState(app, { employee: "emp1" }, h.KIOSK_EMPLOYEE_FAIL_LIMIT, h.KIOSK_PIN_WINDOW_MS, null);
  assert.equal(state.fails, 1, "a fresh failure is inside the window");
  assert.equal(state.attemptsLeft, 2);
});

test("the pepper file is read whether the runtime hands back text or bytes", () => {
  const saved = global.$os;
  global.$os = { readFile: () => [104, 101, 108, 108, 111] };
  assert.equal(h.kioskReadFile("x"), "hello");
  global.$os = { readFile: () => "hello" };
  assert.equal(h.kioskReadFile("x"), "hello");
  global.$os = { readFile: () => null };
  assert.equal(h.kioskReadFile("x"), "");
  global.$os = saved;
});
