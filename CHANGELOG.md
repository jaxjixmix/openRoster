# Changelog

All notable changes to OpenRoster are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
pre-1.0 prerelease versions while the payroll boundary remains alpha.

## [0.11.0-alpha] — 2026-11-09

### Added
- Standalone `/kiosk` PWA for paired tablets: pairing codes, device tokens, location-scoped roster, employee PIN keypad, large touch targets, idle reset, wake lock and fullscreen.
- Manager Settings pairing/revocation list with last-seen timestamps.
- Hashed employee kiosk PINs set in the person editor.
- Kiosk offline queue with idempotent replay; offline punches are marked `PIN not verified` for manager review.
- Dedicated kiosk manifest and `/docs/KIOSK.md` native-prep contract.

### Security
- Device tokens are clock-only, scoped to one company/location, and revocable.
- Kiosk pair codes expire after 10 minutes.

## [0.10.0-alpha] — 2026-11-04

### Security
- Geofenced locations require coordinates for online punches; offline punches are marked unverified.
- Open-shift claim, swap-accept and first-run setup re-check state inside transactions.
- Caddy example ships HSTS, nosniff, frame denial, referrer and permissions policies, and a framing/base/form CSP.
- Backups are created with mode 600.
- `main` is protected with required CI checks and review.

### Changed
- Public-release governance: Contributor Covenant, CHANGELOG, Dependabot, SECURITY supported versions, release checklist.
- Production dependency audit gate added to CI; dev-only minimatch/ESLint findings documented.
- Package metadata moved to 0.10.0 / MIT.

## [0.9.0-alpha] — 2026-11-04

### Added
- Schedule day / week / 2-week / 4-week / month views with week rows and calendar grid.
- Shift context menu: copy, paste, repeat next week, repeat next 4 weeks, delete.
- Drag-to-move shifts between days with drop highlighting.
- Auto-fill and Publish confirmations with counts and previews; undoable delete.
- Visible shift action buttons, add slots on populated days, sticky mobile day headers.
- URL state for schedule view, week, and layout.

### Fixed
- Schedule color legend now follows departments; open shifts use a neutral rail.
- Data type floor and contrast on schedule cards; timeline labels anchor to start time.
- Menu focus, arrow keys, Escape restore, aria-expanded and tablist semantics.
- Missing English i18n keys surfaced by the schedule re-critique.

### Security
- Fenced locations require coordinates for online punches; offline punches are marked unverified.
- Claim, swap-accept and first-run setup re-check state inside transactions.

## [0.8.0-alpha] — 2026-11-04

### Added
- Demand forecast alpha: weekly covers, recommended headcount/hours/cost with per-day explanations and draft-only shift creation.
- Versioned payroll JSON export and documented CSV contract.
- English/Spanish i18n foundation with company language setting.
- PWA install, service worker shell, and offline punch queue.

### Fixed
- Voiding a paid pay run reverts paid timesheets and reverses PTO accruals.
- Root `.env.example`; consistent `NEXT_PUBLIC_PB_URL` across local and Docker.
- Actionable banner when PocketBase is unreachable.

## [0.7.0-alpha] — 2026-11-03

### Changed
- Schedule calendar layout: labelled week rows for 2/4-week views, weekday header and dimmed adjacent-month days for month.
- Bounded schedule rendering with per-day caps and “view day” drill-down; day-grouping map and slower realtime refetch.

## [0.6.0-alpha] — 2026-11-03

### Added
- Installable PWA, offline punch queue with idempotent replay, and offline fallback page.
- CSV exports for punches, pay stubs, and audit activity.
- Retention policy and purge tooling for notifications, audit entries, and archived-employee documents.
- Richer reports: date ranges, variance, overtime forecast, PTO liability, labor by location.

### Changed
- Production containers run non-root with healthchecks and resource limits.
- Accessibility pass: focus trap/restore, skip link, keyboard tabs, labeled fields, reduced motion.

## [0.5.0-alpha] — 2026-11-03

### Added
- Printable pay stubs, company locale, break punches, rounding, kiosk PIN, DST tests.
- Notifications, shift swaps, copy week, shift templates, labor budget, time-off calendar, certifications, expiry reminders.
- PocketBase type generation, monitoring hook, and richer operations docs.

## [0.1.0-alpha] — 2026-11-03

### Added
- First public alpha: setup wizard, schedule, time clock, timesheets, time off, people, payroll preview, reports, settings.
