# OpenRoster schedule calendar layout

Work in `/Users/mojics/apps/openRoster` (canonical checkout; the workspace copy only holds loop state).

## Goal
Make the schedule ranges read as their names imply, and keep them usable for large rosters.

## Checklist
- [x] Add a weekday header row for 2-week, 4-week and month views.
- [x] Group 2-week and 4-week boards by week so each row has a "Week of …" label.
- [x] Keep month aligned to full calendar weeks, with adjacent-month days dimmed.
- [x] Keep day view as a single full-width day (timeline by default) and week as the existing board/timeline.
- [x] Keep mobile readable; do not render 42 empty sections.
- [x] Add browser coverage for the 2-week/4-week row structure and month header.
- [x] Run unit/API/UI tests, lint, build; commit/push and watch CI.
- [x] Update the task file and tag a prerelease.

## Result
- Commit: `601082c`.
- Release: https://github.com/jaxjixmix/openRoster/releases/tag/v0.7.0-alpha
- Day: one full-width day. Week: existing board/timeline. 2 weeks: two 7-column rows. 4 weeks: four 7-column rows. Month: weekday header + calendar grid with dimmed adjacent days.
- Large-roster guards: shifts grouped by day with a Map; per-day render caps (month 4, 2/4-week 6, week 8) with “+N more · view day”; day is the drill-down; realtime debounce 600 ms.
- The load still fetches the full range in one query. If ranges routinely exceed ~5k shifts, move the per-day summary server-side (code comment records this shortcut).

## Final verification — externally rerunnable

- Working directory: `/Users/mojics/apps/openRoster`
- Environment: no extra variables; test scripts create their own superuser and use ports 18097/3001.
- Command:

```bash
cd /Users/mojics/apps/openRoster
make test && make test-api && \
  (cd web && npm run lint && NEXT_PUBLIC_PB_URL=http://127.0.0.1:18097 npm run build) && \
  make test-ui && docker compose config >/dev/null
```

- Output summary: 13 unit + 3 timezone + 2 format + 4 schedule-range tests pass; API/setup pass; Playwright view-switch, 2/4-week row counts, month header, context-menu copy/paste/delete/repeat and offline flows pass; lint/build/compose validate.
- Verified commit: `601082c`; tag: `v0.7.0-alpha`.

## Rules
- One coherent slice per iteration.
- Keep shift context-menu behaviour and conflict checks intact.
- Payroll remains preview/export only.
