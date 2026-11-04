#!/usr/bin/env node
// Seeds a demo company. Safe to re-run: creates a second company with a suffix.
const PB = process.env.PB_URL || "http://127.0.0.1:8097";
const EMAIL = process.env.PB_SUPERUSER || "admin@openroster.local";
const PASSWORD = process.env.PB_SUPERUSER_PASSWORD;
const TZ = process.env.DEMO_TZ || "America/Los_Angeles";

if (!PASSWORD) {
  console.error("Set PB_SUPERUSER_PASSWORD to the PocketBase superuser password.");
  process.exit(1);
}

let token = "";

async function api(path, opts = {}) {
  const res = await fetch(PB + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`${opts.method || "GET"} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  return data;
}

function addDays(date, n) {
  return new Date(new Date(date + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);
}

function tzOffset(date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" }).formatToParts(new Date(date + "T12:00:00Z"));
  const name = parts.find((p) => p.type === "timeZoneName")?.value || "GMT+00:00";
  return name.replace("GMT", "") || "+00:00";
}

const iso = (date, hhmm) => new Date(`${date}T${hhmm}:00${tzOffset(date)}`).toISOString();

const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const DAY_OF_WEEK = new Date(TODAY + "T00:00:00Z").getUTCDay();
const WEEK_START = addDays(TODAY, -((DAY_OF_WEEK + 6) % 7));

function nowMinutes() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === "hour")?.value || 0) * 60 + Number(parts.find((p) => p.type === "minute")?.value || 0);
}

function hhmm(mins) {
  const m = Math.max(0, Math.min(1439, Math.round(mins)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

async function create(collection, data) {
  return api(`/api/collections/${collection}/records`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function main() {
  const auth = await api("/api/collections/_superusers/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
  });
  token = auth.token;
  console.log("Authenticated as superuser");

  const existing = await api(`/api/collections/users/records?perPage=1&filter=${encodeURIComponent('email="maya@harborhearth.co"')}`);
  if (existing.totalItems > 0) {
    console.log("Demo data already exists (maya@harborhearth.co). Reset pb_data or use a fresh PocketBase instance.");
    return;
  }

  const suffix = Date.now().toString().slice(-4);
  const company = await create("companies", {
    name: "Harbor & Hearth",
    legal_name: `Harbor & Hearth Hospitality ${suffix}`,
    timezone: "America/Los_Angeles",
    currency: "USD",
    locale: "en-US",
    week_start: "1",
    pay_frequency: "biweekly",
    overtime_weekly_hours: 40,
    overtime_daily_hours: 8,
    overtime_multiplier: 1.5,
    pto_accrual_hours_per_period: 4,
    pto_accrual_hours_per_hour: 0,
    punch_rounding_minutes: 0,
    weekly_labor_budget: 6000,
    expiry_reminder_days: 30,
    address: "1 Ferry Building, San Francisco, CA",
    phone: "(415) 555-0142",
    setup_complete: true,
  });
  console.log("Company:", company.id);

  const ferry = await create("locations", {
    company: company.id, name: "Ferry Building", address: "1 Ferry Building, San Francisco, CA",
    timezone: "America/Los_Angeles", lat: 37.7955, lng: -122.3937, geofence_meters: 150, active: true,
  });
  const mission = await create("locations", {
    company: company.id, name: "Mission District", address: "2814 Mission St, San Francisco, CA",
    timezone: "America/Los_Angeles", lat: 37.7509, lng: -122.4183, geofence_meters: 150, active: true,
  });

  const kitchen = await create("departments", { company: company.id, name: "Kitchen", color: "#C4552D" });
  const foh = await create("departments", { company: company.id, name: "Front of House", color: "#3F6B57" });
  const bar = await create("departments", { company: company.id, name: "Bar", color: "#7B5C9E" });

  const pos = {};
  for (const [key, name, dept, rate] of [
    ["line_cook", "Line Cook", kitchen.id, 24],
    ["prep_cook", "Prep Cook", kitchen.id, 20],
    ["server", "Server", foh.id, 18],
    ["host", "Host", foh.id, 17],
    ["bartender", "Bartender", bar.id, 22],
  ]) {
    pos[key] = await create("positions", {
      company: company.id, department: dept, name, default_rate: rate, active: true,
    });
  }

  const people = [
    { first: "Maya", last: "Chen", email: "maya@harborhearth.co", role: "admin", type: "full_time", pay: "salary", rate: 92000, pos: null, dept: foh.id, loc: ferry.id, max: 45 },
    { first: "Jordan", last: "Ellis", email: "jordan@harborhearth.co", role: "manager", type: "full_time", pay: "salary", rate: 72000, pos: null, dept: foh.id, loc: ferry.id, max: 45 },
    { first: "Sam", last: "Rivera", email: "sam@harborhearth.co", role: "employee", type: "full_time", pay: "hourly", rate: 24, pos: "line_cook", dept: kitchen.id, loc: ferry.id, max: 40 },
    { first: "Alicia", last: "Gomez", email: "alicia@harborhearth.co", role: "employee", type: "part_time", pay: "hourly", rate: 20, pos: "prep_cook", dept: kitchen.id, loc: ferry.id, max: 28 },
    { first: "Theo", last: "Brooks", email: "theo@harborhearth.co", role: "employee", type: "full_time", pay: "hourly", rate: 18, pos: "server", dept: foh.id, loc: ferry.id, max: 40 },
    { first: "Priya", last: "Nair", email: "priya@harborhearth.co", role: "employee", type: "part_time", pay: "hourly", rate: 18, pos: "server", dept: foh.id, loc: mission.id, max: 28 },
    { first: "Luis", last: "Ortiz", email: "luis@harborhearth.co", role: "employee", type: "full_time", pay: "hourly", rate: 22, pos: "bartender", dept: bar.id, loc: ferry.id, max: 40 },
    { first: "Nina", last: "Park", email: "nina@harborhearth.co", role: "employee", type: "part_time", pay: "hourly", rate: 17, pos: "host", dept: foh.id, loc: mission.id, max: 24 },
    { first: "Owen", last: "Reed", email: "owen@harborhearth.co", role: "employee", type: "full_time", pay: "hourly", rate: 24, pos: "line_cook", dept: kitchen.id, loc: mission.id, max: 40 },
    { first: "Fatima", last: "Hassan", email: "fatima@harborhearth.co", role: "employee", type: "part_time", pay: "hourly", rate: 22, pos: "bartender", dept: bar.id, loc: mission.id, max: 28 },
    { first: "Diego", last: "Marin", email: "diego@harborhearth.co", role: "employee", type: "part_time", pay: "hourly", rate: 18, pos: "server", dept: foh.id, loc: ferry.id, max: 24 },
    { first: "Hana", last: "Sato", email: "hana@harborhearth.co", role: "employee", type: "part_time", pay: "hourly", rate: 20, pos: "prep_cook", dept: kitchen.id, loc: mission.id, max: 24 },
  ];

  const employees = {};
  const demoUsers = {};
  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    const user = await create("users", {
      email: p.email,
      password: "OpenRoster123!",
      passwordConfirm: "OpenRoster123!",
      name: `${p.first} ${p.last}`,
      role: p.role,
      phone: `(415) 555-01${String(10 + i).padStart(2, "0")}`,
      verified: true,
    });
    demoUsers[p.first.toLowerCase()] = user;
    const emp = await create("employees", {
      user: user.id,
      company: company.id,
      location: p.loc,
      department: p.dept,
      position: p.pos ? pos[p.pos].id : undefined,
      employee_number: `HH-${String(101 + i)}`,
      first_name: p.first,
      last_name: p.last,
      email: p.email,
      phone: `(415) 555-01${String(10 + i).padStart(2, "0")}`,
      hire_date: "2024-03-18 00:00:00.000Z",
      employment_type: p.type,
      pay_type: p.pay,
      pay_rate: p.rate,
      overtime_exempt: p.pay === "salary",
      max_weekly_hours: p.max,
      pto_balance_hours: p.type === "full_time" ? 56 : 24,
      status: "active",
    });
    employees[p.first.toLowerCase()] = emp;
    await create("pto_entries", {
      company: company.id,
      employee: emp.id,
      date: `${TODAY} 00:00:00.000Z`,
      type: "carryover",
      hours: p.type === "full_time" ? 56 : 24,
      note: "Opening balance",
    });
  }
  console.log("Employees:", Object.keys(employees).length);
  await create("notifications", {
    user: demoUsers.maya.id,
    type: "system",
    title: "Welcome to OpenRoster",
    body: "Your demo workspace is ready. Start with the schedule or the time clock.",
    link: "/schedule",
  });
  await create("notifications", {
    user: demoUsers.jordan.id,
    type: "system",
    title: "Welcome to OpenRoster",
    body: "Your demo workspace is ready. Start with the schedule or the time clock.",
    link: "/schedule",
  });

  // Availability: weekdays 0=Sun ... 6=Sat. Only for hourly staff.
  const availability = {
    sam: [["1", "09:00", "18:00"], ["2", "09:00", "18:00"], ["3", "09:00", "18:00"], ["4", "09:00", "18:00"], ["5", "09:00", "18:00"]],
    alicia: [["1", "07:00", "15:00"], ["2", "07:00", "15:00"], ["3", "07:00", "15:00"], ["4", "07:00", "15:00"]],
    theo: [["2", "10:00", "22:00"], ["3", "10:00", "22:00"], ["4", "10:00", "22:00"], ["5", "10:00", "23:00"], ["6", "10:00", "23:00"]],
    priya: [["1", "10:00", "20:00"], ["3", "10:00", "20:00"], ["5", "10:00", "22:00"], ["6", "10:00", "22:00"]],
    luis: [["2", "15:00", "23:30"], ["3", "15:00", "23:30"], ["4", "15:00", "23:30"], ["5", "15:00", "23:30"], ["6", "15:00", "23:30"]],
    nina: [["1", "15:00", "22:00"], ["2", "15:00", "22:00"], ["5", "15:00", "23:00"], ["6", "15:00", "23:00"]],
    owen: [["1", "09:00", "18:00"], ["2", "09:00", "18:00"], ["3", "09:00", "18:00"], ["4", "09:00", "18:00"], ["5", "09:00", "18:00"]],
    fatima: [["1", "16:00", "23:30"], ["2", "16:00", "23:30"], ["4", "16:00", "23:30"], ["5", "16:00", "23:30"]],
    diego: [["2", "10:00", "20:00"], ["3", "10:00", "20:00"], ["4", "10:00", "20:00"], ["5", "10:00", "21:00"], ["6", "10:00", "21:00"]],
    hana: [["1", "08:00", "16:00"], ["2", "08:00", "16:00"], ["3", "08:00", "16:00"]],
  };
  for (const [key, windows] of Object.entries(availability)) {
    for (const [weekday, start, end] of windows) {
      await create("availability", {
        employee: employees[key].id,
        weekday,
        start_time: start,
        end_time: end,
        effective_from: "2026-01-01 00:00:00.000Z",
      });
    }
  }

  // Two published weeks. Last shift of each day starts unassigned on purpose.
  const weeks = [WEEK_START, addDays(WEEK_START, 7)];
  const templates = [
    { loc: ferry.id, dept: kitchen.id, pos: pos.line_cook.id, key: "sam", start: "10:00", end: "18:00", break: 30, days: [0, 1, 2, 3, 4] },
    { loc: ferry.id, dept: kitchen.id, pos: pos.prep_cook.id, key: "alicia", start: "07:00", end: "15:00", break: 30, days: [0, 1, 2] },
    { loc: ferry.id, dept: foh.id, pos: pos.server.id, key: "theo", start: "11:00", end: "19:00", break: 30, days: [1, 2, 3, 4, 5] },
    { loc: mission.id, dept: foh.id, pos: pos.server.id, key: "priya", start: "12:00", end: "20:00", break: 30, days: [0, 2, 4] },
    { loc: ferry.id, dept: bar.id, pos: pos.bartender.id, key: "luis", start: "17:00", end: "23:00", break: 30, days: [1, 2, 3, 4, 5] },
    { loc: ferry.id, dept: kitchen.id, pos: pos.prep_cook.id, key: null, start: "08:00", end: "14:00", break: 0, days: [0, 2, 4] },
    { loc: mission.id, dept: kitchen.id, pos: pos.line_cook.id, key: "owen", start: "10:00", end: "18:00", break: 30, days: [0, 1, 2, 3, 4] },
    { loc: mission.id, dept: foh.id, pos: pos.host.id, key: "nina", start: "16:00", end: "22:00", break: 0, days: [0, 1, 4, 5] },
    { loc: mission.id, dept: bar.id, pos: pos.bartender.id, key: "fatima", start: "17:00", end: "23:30", break: 30, days: [0, 1, 3, 4] },
    { loc: ferry.id, dept: foh.id, pos: pos.server.id, key: null, start: "12:00", end: "18:00", break: 0, days: [1, 3, 4, 6] },
    { loc: mission.id, dept: kitchen.id, pos: pos.prep_cook.id, key: "hana", start: "08:00", end: "14:00", break: 0, days: [0, 1, 2] },
    { loc: ferry.id, dept: foh.id, pos: pos.host.id, key: null, start: "15:00", end: "21:00", break: 0, days: [0, 3, 6] },
  ];

  let shiftCount = 0;
  for (const week of weeks) {
    for (let day = 0; day < 7; day++) {
      const date = addDays(week, day);
      for (const t of templates) {
        if (!t.days.includes(day)) continue;
        try {
          await create("shifts", {
            company: company.id,
            location: t.loc,
            department: t.dept,
            position: t.pos,
            employee: t.key ? employees[t.key].id : undefined,
            starts_at: iso(date, t.start),
            ends_at: iso(date, t.end),
            local_date: `${date} 00:00:00.000Z`,
            local_start: t.start,
            local_end: t.end,
            break_minutes: t.break,
            status: "published",
            source: "manual",
          });
        } catch (err) {
          console.error("Shift failed:", date, t.key, t.start, t.end, err.message);
          throw err;
        }
        shiftCount++;
      }
    }
  }
  console.log("Shifts:", shiftCount);

  // Punches for today, always in the past. A live punch is added after timesheets.
  const now = nowMinutes();
  if (now > 9 * 60) {
    const end = Math.min(now - 30, 22 * 60);
    const start = Math.max(6 * 60, end - 450);
    const crew = ["sam", "alicia", "theo", "luis", "owen"];
    for (let i = 0; i < crew.length; i++) {
      const key = crew[i];
      const inMin = Math.min(start + i * 12, end - 150);
      const outMin = Math.max(inMin + 120, end - i * 8);
      const loc = people.find((p) => p.first.toLowerCase() === key).loc;
      await create("punches", {
        employee: employees[key].id, location: loc, type: "in", punched_at: iso(TODAY, hhmm(inMin)), source: "web",
      });
      await create("punches", {
        employee: employees[key].id, location: loc, type: "out", punched_at: iso(TODAY, hhmm(outMin)), source: "web",
      });
    }
    console.log("Punches seeded for", TODAY);
  }

  await create("time_off_requests", {
    employee: employees.sam.id, type: "vacation", start_date: `${addDays(TODAY, 10)} 00:00:00.000Z`,
    end_date: `${addDays(TODAY, 11)} 00:00:00.000Z`, hours: 16, status: "approved", note: "Family trip",
  });
  await create("time_off_requests", {
    employee: employees.alicia.id, type: "sick", start_date: `${addDays(TODAY, 4)} 00:00:00.000Z`,
    end_date: `${addDays(TODAY, 4)} 00:00:00.000Z`, hours: 8, status: "pending", note: "Doctor appointment",
  });
  await create("time_off_requests", {
    employee: employees.nina.id, type: "vacation", start_date: `${addDays(TODAY, 18)} 00:00:00.000Z`,
    end_date: `${addDays(TODAY, 20)} 00:00:00.000Z`, hours: 18, status: "pending", note: "Wedding",
  });

  const rules = [
    ["Federal income tax", "federal_tax", "percent", 12, "gross", false],
    ["California income tax", "state_tax", "percent", 5, "gross", false],
    ["Social Security", "social_security", "percent", 6.2, "gross", false],
    ["Medicare", "medicare", "percent", 1.45, "gross", false],
    ["Employer Social Security", "social_security", "percent", 6.2, "gross", true],
    ["Employer Medicare", "medicare", "percent", 1.45, "gross", true],
    ["Health plan", "health", "fixed_per_period", 25, "gross", false],
    ["401(k) 3%", "retirement", "percent", 3, "gross", false],
  ];
  for (const [name, type, calc, rate, applies, employer] of rules) {
    await create("pay_rules", { company: company.id, name, type, calc, rate, applies_to: applies, employer, active: true });
  }

  const year = Number(TODAY.slice(0, 4));
  const thanksgiving = `${year}-11-26` < TODAY ? `${year + 1}-11-26` : `${year}-11-26`;
  const christmas = `${year}-12-25` < TODAY ? `${year + 1}-12-25` : `${year}-12-25`;
  await create("holidays", { company: company.id, name: "Thanksgiving", date: `${thanksgiving} 00:00:00.000Z`, paid: true });
  await create("holidays", { company: company.id, name: "Christmas Day", date: `${christmas} 00:00:00.000Z`, paid: true });

  // Switch to the manager to generate demo timesheets and a draft pay run.
  const manager = await api("/api/collections/users/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: "jordan@harborhearth.co", password: "OpenRoster123!" }),
  });
  token = manager.token;

  const periodFrom = addDays(WEEK_START, -7);
  const periodTo = addDays(WEEK_START, 90);
  await api("/api/openroster/pay_periods/generate", {
    method: "POST",
    body: JSON.stringify({ from: periodFrom, to: periodTo }),
  });
  const periods = await api(`/api/collections/pay_periods/records?perPage=100&sort=-period_start&filter=${encodeURIComponent(`period_start <= '${TODAY} 23:59:59.999Z' && period_end >= '${TODAY} 00:00:00.000Z'`)}`);
  const currentPeriod = periods.items[0];
  const runStart = currentPeriod ? currentPeriod.period_start.slice(0, 10) : WEEK_START;
  const runEnd = currentPeriod ? currentPeriod.period_end.slice(0, 10) : addDays(WEEK_START, 6);

  const generated = await api("/api/openroster/timesheets/generate", {
    method: "POST",
    body: JSON.stringify({ period_start: WEEK_START, period_end: addDays(WEEK_START, 6) }),
  });
  const sheets = await api(`/api/collections/timesheets/records?perPage=50&sort=-total_hours&filter=${encodeURIComponent(`period_start >= '${WEEK_START} 00:00:00.000Z'`)}`);
  let approved = 0;
  for (let i = 0; i < sheets.items.length; i++) {
    if (i < 2) continue;
    await api(`/api/collections/timesheets/records/${sheets.items[i].id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "approved", approved_by: manager.record.id, approved_at: new Date().toISOString() }),
    });
    approved++;
  }
  console.log("Timesheets:", generated.sheets, "approved:", approved);

  try {
    const run = await api("/api/openroster/payroll/run", {
      method: "POST",
      body: JSON.stringify({ period_start: runStart, period_end: runEnd }),
    });
    console.log("Pay period:", runStart, "to", runEnd);
    console.log("Draft pay run:", run.totals.employees, "people, net", run.totals.net);
  } catch (err) {
    console.log("Payroll draft skipped:", err.message);
  }

  // Leave one person on the clock for the live time clock demo.
  if (now > 10 * 60) {
    await create("punches", {
      employee: employees.theo.id,
      location: ferry.id,
      type: "in",
      punched_at: iso(TODAY, hhmm(Math.max(6 * 60, now - 10))),
      source: "web",
    });
  }

  await create("demand_forecasts", {
    company: company.id,
    location: "",
    week_start: addDays(TODAY, 7),
    days: {
      [addDays(TODAY, 7)]: 120,
      [addDays(TODAY, 8)]: 110,
      [addDays(TODAY, 9)]: 80,
      [addDays(TODAY, 10)]: 70,
      [addDays(TODAY, 11)]: 130,
      [addDays(TODAY, 12)]: 190,
      [addDays(TODAY, 13)]: 170,
    },
    productivity: 16,
    break_minutes: 30,
  });
  console.log("Demand forecast seeded for next week");

  console.log("\nDone. Sign in with:");
  console.log("  admin   maya@harborhearth.co / OpenRoster123!");
  console.log("  manager jordan@harborhearth.co / OpenRoster123!");
  console.log("  staff   sam@harborhearth.co / OpenRoster123!");
}

main().catch((err) => { console.error(err); process.exit(1); });
