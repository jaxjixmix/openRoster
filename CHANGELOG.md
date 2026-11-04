# Changelog

All notable changes to OpenRoster are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
pre-1.0 prerelease versions while the payroll boundary remains alpha.

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
