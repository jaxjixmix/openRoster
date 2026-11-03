# OpenRoster

**Workforce management for small teams.** Scheduling, time clock, timesheets, time off and payroll in one calm, self-hosted workspace.

Built for restaurants, clinics and shops that run on real shifts. One PocketBase binary, one Next.js app, SQLite. No per-seat cloud.

> **Alpha — not payroll-compliant.** Payroll here is a configurable preview, not tax withholding, filings or direct deposit. **Do not use it to pay real people yet.** Read [Status](#status) and [Scope boundaries](#scope-boundaries-read-this) before deploying.

![OpenRoster dashboard](docs/dashboard.png)

## Why this exists

[TimeTrex](https://github.com/timetrex/TimeTrex) has deep payroll and time & attendance, but it is an AGPL PHP/Zend Framework monolith. [Staffjoy](https://github.com/Staffjoy/v2) had a clean scheduling model, but its v2 stack (Go + Bazel + Kubernetes) is deprecated and V1 is a Python microservice constellation.

OpenRoster borrows the *ideas* — Staffjoy's company/location/team/worker model and TimeTrex's punch → timesheet → pay-run pipeline — and implements them from scratch. No TimeTrex code is used. The repo is MIT.

## Status

OpenRoster is a **working alpha**. Current release: **v0.4.0-alpha**. The delivery backlog is public:

- [#1 P0 — data safety and correctness](https://github.com/jaxjixmix/openRoster/issues/1) — safe archive, no cascade deletes, transactions, money-record locks, unit/API/setup tests.
- [#2 P1 — payroll periods, clock, timezone](https://github.com/jaxjixmix/openRoster/issues/2) — complete: pay periods, PTO ledger, printable stubs, locale, pay-period clock, DST tests, breaks/rounding, geofence, punch corrections, kiosk PIN, currency/CSV.
- [#3 P2 — employee self-service, notifications, scheduling depth](https://github.com/jaxjixmix/openRoster/issues/3) — complete for alpha: self-service, open-shift claiming, notifications/preferences, copy week, swaps, recurring templates, labor budget, time-off calendar/blackouts, certifications, expiry reminders. Demand forecast is explicitly deferred.
- [#4 P3 — operations, exports, polish](https://github.com/jaxjixmix/openRoster/issues/4) — shipped: Caddy, backups, non-root containers, API docs and CSV. Remaining: monitoring, type generation, i18n/PWA, accessibility pass.
- [#5 Public repo bar](https://github.com/jaxjixmix/openRoster/issues/5) — this repo is public under an alpha disclaimer.

## What v1 does

- **First-run setup** — create the company, first location and first administrator in the browser. Demo data is opt-in.
- **Pay periods** — generated from weekly/biweekly/semimonthly/monthly frequency, selected in Payroll and locked when paid.
- **PTO ledger** — carryover, accrual, approved usage and manual adjustments; balances recalculate from the ledger.
- **Self-service** — staff profile, availability editing, PTO history and time-off requests.
- **Open shifts** — staff can see published open shifts and claim them; the server checks leave, availability and weekly hours.
- **Schedule** — week board and hour-by-hour timeline, location filter, draft/publish, copy week, shift swaps, recurring templates, labor-budget warnings, realtime updates, overlap/leave/certification checks.
- **Auto-fill** — assigns open shifts using availability, approved time off, existing shifts, weekly hour caps and position fit. It leaves genuinely uncovered shifts open instead of guessing.
- **Time clock** — clock in/out, break start/end, optional rounding, PIN-locked kiosk mode, live “on the clock” list, duplicate-punch and backdating protection.
- **Timesheets** — generated from punches (scheduled hours are a fallback), daily and weekly overtime, PTO, approve individually or in bulk. Approved sheets are locked.
- **Payroll** — preview and draft runs from approved timesheets, configurable percent/fixed rules, per-stub breakdown, pay history, draft → approved → paid → voided, no destructive deletes.
- **People** — profiles, pay, availability, documents, certifications, PTO ledger, recent punches, archive/restore.
- **Time off** — requests, approve/deny queue, balances, month calendar, blackout dates and coverage-conflict warnings.
- **Reports** — date ranges, scheduled vs actual variance, labor by department/location, coverage, OT forecast and PTO liability.
- **Notifications** — in-app bell with optional email delivery through PocketBase mail settings, including daily certification/document expiry reminders.
- **Exports** — CSV for timesheets, payroll preview, people and schedules.
- **Settings** — company, locations, departments, positions, pay rules, holidays, role-based access, audit log.

Staff see their own schedule, clock, timesheet and time off. Managers see the company. Admins manage roles and company settings.

![OpenRoster schedule](docs/schedule.png)

## Stack

```
Browser
  │  PocketBase JS SDK (REST + realtime)
  ▼
Next.js 16 / React 19        PocketBase 0.40 (Go)
  port 3000        ───────►  port 8097
                             SQLite + auth + files
                             pb_hooks: clock, auto-fill,
                             timesheets, payroll, audit
```

There is **no extra API layer**. PocketBase is the backend and enforces access with collection rules. The Next app is a client-rendered product surface. Heavy domain logic lives in `pb/pb_hooks/main.pb.js` and `pb/pb_hooks/lib.js`.

## Quick start (local)

Requirements: Node 22+, npm, and `curl`/`unzip`.

```bash
make setup                 # download PocketBase + npm install
make dev-pb                # terminal 1 — http://127.0.0.1:8097
make dev-web               # terminal 2 — http://127.0.0.1:3000
```

Open **http://127.0.0.1:3000/setup** on a fresh database. The setup screen creates the company, first location and administrator, then signs you in. The setup endpoint disables itself after the first account exists.

A PocketBase superuser is only needed for the PocketBase dashboard (`/_/`), not for the app:

```bash
make admin ADMIN_PASSWORD='a-strong-superuser-password'
```

`make admin` refuses to run without a password. If PocketBase is not on the default port, set `NEXT_PUBLIC_PB_URL` in your local env file.

### Demo data (optional)

The demo is **not** installed by default. With PocketBase running:

```bash
make admin ADMIN_PASSWORD='demo-superuser-password'
PB_SUPERUSER_PASSWORD='demo-superuser-password' make seed
```

The seed creates “Harbor & Hearth”, two locations, 12 people, two weeks of shifts, punches for today, generated timesheets and a draft pay run. It is date-relative, so it always lands in the current week.

| Role | Email | Password |
|---|---|---|
| Administrator | `maya@harborhearth.co` | `OpenRoster123!` |
| Manager | `jordan@harborhearth.co` | `OpenRoster123!` |
| Team member | `sam@harborhearth.co` | `OpenRoster123!` |

These are **demo credentials only**. Change or remove them before exposing a real deployment.

## Docker

```bash
NEXT_PUBLIC_PB_URL=http://localhost:8097 docker compose up --build
```

Open http://localhost:3000/setup for a clean workspace.

For the optional demo, create a superuser and seed from the host:

```bash
docker compose exec pocketbase pocketbase superuser upsert admin@openroster.local 'your-strong-password' --dir=/pb_data
PB_URL=http://127.0.0.1:8097 PB_SUPERUSER=admin@openroster.local PB_SUPERUSER_PASSWORD='your-strong-password' node scripts/seed.mjs
```

The PocketBase dashboard is at http://localhost:8097/_/; keep it private.

`NEXT_PUBLIC_PB_URL` is baked into the browser bundle at image build time, so set it to the URL the **browser** will use (not a Docker-internal hostname). For production, put both services behind HTTPS.

## Production notes

- **TLS / reverse proxy:** see [`deploy/Caddyfile`](deploy/Caddyfile). Use `app.example.com` for Next and `api.example.com` for PocketBase, then build the web image with `NEXT_PUBLIC_PB_URL=https://api.example.com`.
- **Backups:** `make backup`, then read [`docs/BACKUP.md`](docs/BACKUP.md). Restore is scripted and should be tested quarterly.
- **Containers:** both images run as non-root; the web container has a healthcheck.
- **Upgrades:** see [`docs/UPGRADE.md`](docs/UPGRADE.md).
- **API:** custom routes are documented in [`docs/API.md`](docs/API.md).
- **Monitoring:** see [`docs/MONITORING.md`](docs/MONITORING.md) for health checks, logs and optional Sentry/GlitchTip.
- **Payroll model:** see [`docs/PAYROLL.md`](docs/PAYROLL.md).

## Tests and CI

```bash
make test        # payroll, timesheet and date unit tests
make test-api    # fresh PocketBase: seed, login, auto-fill, timesheets, payroll, locks, setup
make test-ui     # Playwright: seeded dashboard/schedule/payroll + first-run setup
make types       # regenerate PocketBase TypeScript definitions (PB must be running)
cd web && npm run lint && npm run build
```

CI runs build, lint, unit tests, API/setup tests and a secret scan. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## Data model

| Collection | Purpose |
|---|---|
| `companies`, `locations`, `departments`, `positions` | Org structure |
| `users` (auth) | Login + role: `admin`, `manager`, `employee` |
| `employees` | Profile, pay type/rate, max hours, PTO, manager, archive state |
| `availability` | Repeating weekly windows |
| `time_off_requests` | Vacation/sick/unpaid, approval state |
| `shifts` | Assigned or open, draft/published, local date, breaks |
| `punches` | In/out events with source and optional location |
| `timesheets`, `timesheet_entries` | Period totals and daily detail |
| `pay_periods` | Generated weekly/biweekly/semimonthly/monthly periods |
| `pay_runs`, `pay_stubs` | Draft/approved/paid/voided runs and per-person breakdowns |
| `pay_rules` | Percent / per-hour / per-period withholdings and contributions |
| `pto_entries` | Carryover, accrual, usage and adjustment ledger |
| `holidays`, `documents` | Calendar and protected HR files |
| `audit_log` | Actor, summary, before/after snapshots |

Schema lives in `pb/pb_migrations/`. Access rules are part of the schema: employees can read their own records, managers their company, admins everything. History-bearing relations no longer cascade-delete; people are archived instead.

## How scheduling works

`POST /api/openroster/schedule/auto` loads every open shift in the week, then scores each active hourly employee:

- hard filters: approved time off, overlapping shift, weekly hour cap, location, availability window (if any are defined)
- score: position match, department match, location match, fairness (fewer scheduled hours wins), overtime risk, same-day continuity

The client sends per-day UTC offsets for the company timezone, because PocketBase's JS runtime has no `Intl`. Manual assignment additionally checks approved leave and the weekly hour cap server-side. Only empty shifts are touched, and nothing is assigned if no one passes the hard filters.

## How pay is calculated

1. Pay periods are generated from `pay_frequency`; Payroll selects one period.
2. Approved timesheets inside the period are selected. Salaried staff are included without a timesheet.
3. Hourly: `regular hours × rate`, `overtime hours × rate × multiplier`, plus PTO.
4. Salary: annual rate prorated by calendar days in the period.
5. Each active `pay_rule` adds a withholding or employer contribution: percent of gross, fixed per hour, or fixed per period.
6. Net = gross − employee taxes − employee deductions. Employer taxes are reported as cost, not withheld.
7. Creating a run writes `pay_runs` + `pay_stubs` in a transaction, locks the period when paid, and keeps stubs/timesheets on void.
8. PTO accrual (per period and/or per hour) is written to `pto_entries` when a pay run is created. Approved leave writes a usage entry; denial/cancellation reverses it.

## Scope boundaries (read this)

OpenRoster is a complete workflow, not a compliance product.

- **Not a tax engine.** Pay rules are flat rates you configure. There are no federal/state withholding tables, wage-base caps, reciprocity, or filings. Verify every rate and consult a payroll provider before paying people.
- **No payments.** No direct deposit, checks, or provider integration.
- **Single tenant.** One company per install. Multi-tenant isolation is not implemented.
- **SQLite / PocketBase scale.** Excellent for a few hundred staff and modest concurrency; not a distributed enterprise system.
- **Geofence is best-effort.** When the browser shares coordinates, clock-in rejects a punch outside the location radius. If permission is denied, the punch is accepted.
- **No shift swaps, recurring shifts, copy-week, labor budgets, certifications, or push notifications yet.**
- **Kiosk PIN is a UI lock, not an authentication boundary.** Use a locked-down tablet and HTTPS.
- **Email notifications require SMTP.** In-app notifications are built in; email is opt-in and needs PocketBase mail settings.
- **No payroll tax engine or payment provider.** Pay stubs are printable, not filed.
- **No translation/i18n.** Locale controls currency/date formatting; UI copy is English. Break punches, rounding and a kiosk PIN are supported.
- **Locations share the company timezone in this alpha.** Per-location timezones are stored but not used for scheduling.
- **Tests are not a full regression suite.** CI covers payroll math, dates, API, setup and browser smoke; deep scheduling/compliance scenarios are still thin.

## Project layout

```
.github/                CI, issue templates, PR template
deploy/                 Caddy reverse-proxy example
docs/                   screenshots, payroll model, API, backup, upgrade
pb/
  pb_migrations/        schema, rules, indexes, timestamps
  pb_hooks/main.pb.js   routes + validation + audit
  pb_hooks/lib.js       shared domain helpers
web/
  src/lib/pb-generated.ts  generated PocketBase collection types
  src/app/(app)/        Today, Schedule, Time Clock, Timesheets, Requests,
                        People, Payroll, Reports, Settings
  src/app/setup/        first-run wizard
  src/components/       UI system, schedule, clock, modals
  src/lib/              PocketBase client, auth, types, date/format helpers
scripts/
  seed.mjs              date-relative demo company
  test-api.mjs          seeded API smoke test
  test-setup.mjs        empty-workspace setup test
  fetch-pocketbase.sh   pinned binary download
  backup.sh             tar-based backup
  restore.sh            tested restore helper
tests/
  lib.test.cjs          payroll, overtime, breaks, dates and pay periods
web/tests/
  tz.test.mjs           DST offset tests
```

## Attribution

- Scheduling/product model inspired by **Staffjoy V2** (MIT) and **Staffjoy Suite** (MIT-licensed per repo; original autoscheduler in Julia).
- Time & attendance / payroll pipeline inspired by **TimeTrex** (AGPL-3.0). **No TimeTrex code is included or linked**, so this project stays MIT.
- Built with [PocketBase](https://pocketbase.io) (MIT), [Next.js](https://nextjs.org) (MIT), [date-fns](https://date-fns.org) (MIT) and [Lucide](https://lucide.dev) (ISC).

## License

MIT. See [LICENSE](LICENSE).
