# OpenRoster — implement #7, #8, #6, #9

Work in `/Users/mojics/apps/openRoster`. One slice per iteration; keep `make test`, `make test-api`, `make test-ui`, lint and build green; commit/push and watch CI after each slice.

## Status — COMPLETE
- [x] Slice 1 #7 DX env/ports — bb580da bf1db26
- [x] Slice 2 #8 demand forecast — 50961ac
- [x] Slice 3 #6 export contract + void reversal — 9b91a64
- [x] Slice 4 #9 i18n first pass — d916bf6
- Release: https://github.com/jaxjixmix/openRoster/releases/tag/v0.8.0-alpha
- Issue comments posted on #6, #7, #8, #9.

## Boundaries kept
- No tax tables, no direct deposit, no provider APIs — #6 stays export-only.
- No auto-published shifts from forecasts.
- Alpha banner intact; payroll remains preview/export.

## Final verification — externally rerunnable
- Working directory: `/Users/mojics/apps/openRoster`
- Environment: none required (test scripts self-provision; ports 18097/3001).
- Command:

```bash
cd /Users/mojics/apps/openRoster
make test && make test-api && \
  (cd web && npm run lint && NEXT_PUBLIC_PB_URL=http://127.0.0.1:18097 npm run build) && \
  make test-ui && docker compose config >/dev/null && \
  node scripts/check-pb-url.mjs http://127.0.0.1:18097
```

- Output summary: all tests pass (unit 13+3+2+4, API/setup, browser suites; 0 failures), lint clean, production build ok, compose valid, embedded-PB-URL check passes.
- Verified at tag `v0.8.0-alpha`.
