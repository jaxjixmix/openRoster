# Contributing

OpenRoster is an alpha project. Small, focused pull requests are easiest to review.

## Setup

```bash
make setup
make dev-pb     # terminal 1 — http://127.0.0.1:8097
make dev-web    # terminal 2 — http://127.0.0.1:3000
```

Open http://127.0.0.1:3000/setup for a clean workspace. The demo seed and credentials live in the README and are opt-in.

## Tests

```bash
make test        # payroll/date unit tests
make test-api    # PocketBase API + setup smoke tests
cd web && npm run lint && npm run build
```

CI runs all of these. Add a test for every behavior change in payroll, timesheets, scheduling, or access rules.

## Migrations

- Add a new file in `pb/pb_migrations/`, never edit an applied migration.
- Use `<unix timestamp>_description.js`.
- Include an up and, where practical, a down.
- Do not re-enable `cascadeDelete` for payroll/attendance history.
- Test against a throwaway data directory:

```bash
cd pb
./pocketbase migrate up --dir=/tmp/openroster-test
```

## Code style

- TypeScript, strict mode, no `any` unless unavoidable.
- Tailwind for styling; reuse `web/src/components/ui.tsx`.
- PocketBase hooks: keep shared logic in `pb/pb_hooks/lib.js`; handlers run in isolated JS runtimes.
- Server-side validation must not rely on the UI.
- Money math is rounded with `round2` and tested in `tests/lib.test.cjs`.

## Pull requests

- One concern per PR.
- Include a test or explain why none is needed.
- Update the README or issue if behavior changes.
- Never commit `pb_data`, the PocketBase binary, secrets, or local env files.

## Security

See [SECURITY.md](SECURITY.md). Do not report vulnerabilities in public issues.
