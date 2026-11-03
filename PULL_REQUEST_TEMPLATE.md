## What changed

## Why

## Testing

- [ ] `make test`
- [ ] `make test-api`
- [ ] `cd web && npm run lint && npm run build`
- [ ] Manual check of the affected flow

## Data / security checklist

- [ ] No secrets, `pb_data`, binaries, or local env files committed
- [ ] New migrations are additive and have a rollback where practical
- [ ] Payroll/attendance history is not deleted or cascade-deleted
- [ ] Server-side validation covers the new path
