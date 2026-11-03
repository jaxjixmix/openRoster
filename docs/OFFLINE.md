# Offline clock and PWA

OpenRoster installs as a PWA (Chrome/Edge/Safari “Add to Home Screen”) and keeps the time clock usable when the network drops.

## What works offline

- The app shell and time-clock page stay available after one online visit.
- Clock in/out and break punches are stored in `localStorage` on that device.
- When the browser fires `online`, queued punches replay in order and are removed only after the server accepts them (or rejects them because the clock state changed).
- The manifest and icons make the app installable; `sw.js` caches the shell and serves `offline.html` for navigation failures.

## Limits

- The queue belongs to one browser profile, not the server. Clearing site data clears unsynced punches.
- Queued punches carry the device timestamp and are marked `source = offline` with a note. Timestamps can be edited on a compromised device; managers should review queued punches like any manual correction.
- Geofence checks cannot run while offline. The server validates coordinates only when they are present, so offline punches are not geofence-verified.
- Queued punches older than 72 hours are rejected.
- Payroll, reports, schedules and manager edits need the server. Do not treat the offline shell as a full offline mode.
- Full UI translations (i18n) are tracked separately in [#9](https://github.com/jaxjixmix/openRoster/issues/9); the alpha UI is English-only.

## Queue key

`openroster.offline-punches.v1` — an array of `{id, employee, type, punched_at, offset_minutes, lat?, lng?}`.
