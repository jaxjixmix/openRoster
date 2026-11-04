# OpenRoster schedule improvements

Work in `/Users/mojics/apps/openRoster` (canonical checkout; the orca workspace copy only holds loop state).

## Goal
Add range views and fast shift actions to `/schedule` without breaking the existing week board/timeline.

## Checklist
- [x] Add a pure schedule-range helper and unit tests for day, week, 2 weeks, 4 weeks and month.
- [x] Wire Day / Week / 2 weeks / 4 weeks / Month navigation, labels, desktop board rows and mobile rendering.
- [x] Keep Board and Timeline where they make sense (day/week); hide Timeline for multi-week/month.
- [x] Add a shift context menu: Copy, Paste here, Repeat next week, Repeat next 4 weeks, Delete. Support right-click and keyboard/context-menu key; add a visible actions button on mobile.
- [x] Keep auto-fill, templates and copy-week scoped to the containing week and hide them for multi-week/month.
- [x] Add browser coverage for view switching and the context menu.
- [x] Run `make test`, `make test-api`, `make test-ui`, lint and production build.
- [x] Commit, push, watch CI, update the task file and open a release.

## Result
- Commit: `10f875c` (views + menu), `497b939` (range count label).
- Release: https://github.com/jaxjixmix/openRoster/releases/tag/v0.6.0-alpha
- Month grid uses full calendar weeks; adjacent-month days are dimmed.
- Multi-week/month mobile views list days that have shifts.
- Repeat/paste still obey overlap, leave, certification and hour-cap checks.
- Also fixed the sidebar rendering `aria-current` as visible text.

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

- Output summary: 13 unit + 3 timezone + 2 format + 4 schedule-range tests pass; API/setup pass; Playwright view-switch, context-menu copy/paste/delete/repeat, dashboard, payroll and offline flows pass; lint/build/compose validate.
- Verified commit: `497b939`; tag: `v0.6.0-alpha`.

## Rules
- One coherent slice per iteration; keep CI green.
- Do not delete or rewrite seeded shifts in tests.
- Payroll remains preview/export only.
