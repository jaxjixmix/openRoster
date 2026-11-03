# OpenRoster custom API

PocketBase serves the standard `/api/collections/*` CRUD endpoints. The app adds these routes in `pb/pb_hooks/main.pb.js`.

All routes except `status` and `setup` require `Authorization: <PocketBase auth token>`.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/openroster/status` | public | `{ setup_required, demo_available }` |
| POST | `/api/openroster/setup` | public once | Create company, location, admin and pay periods |
| GET | `/api/openroster/bootstrap` | auth | Current user, employee, company, locations |
| POST | `/api/openroster/clock` | auth | Punch with `{type: in|out|break_start|break_end, offset_minutes?, lat?, lng?}` |
| POST | `/api/openroster/punches/correct` | manager | Correct a punch with `{punch, punched_at, type, reason}` |
| POST | `/api/openroster/schedule/auto` | manager | Auto-fill `{week_start, location?, offsets}` |
| POST | `/api/openroster/schedule/copy` | manager | Copy `{from_week, to_week, from_offsets, to_offsets}` into an empty week |
| POST | `/api/openroster/shift_templates/apply` | manager | Generate drafts from active templates `{week_start, offsets}` |
| POST | `/api/openroster/shifts/claim` | staff | Claim an open published shift `{shift}` |
| GET | `/api/openroster/swaps` | auth | List open/own/company swaps |
| POST | `/api/openroster/swaps` | staff | Offer own shift `{shift, note?}` |
| POST | `/api/openroster/swaps/accept` | staff | Accept `{swap}` |
| POST | `/api/openroster/swaps/status` | manager/owner | `{swap, status: approved|denied|cancelled}` |
| POST | `/api/openroster/timesheets/generate` | manager | Roll up `{period_start, period_end}` |
| POST | `/api/openroster/timesheets/approve` | manager | Bulk approve `{ids}` |
| POST | `/api/openroster/pay_periods/generate` | manager | Generate periods `{from, to}` |
| POST | `/api/openroster/payroll/preview` | manager | Preview `{period_start, period_end}` |
| POST | `/api/openroster/payroll/run` | manager | Create/update draft `{period_start, period_end}` |
| POST | `/api/openroster/payroll/status` | manager | `{run, status: approved|paid|voided, reason?}` |

## Examples

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8097/api/collections/users/auth-with-password \
  -H 'Content-Type: application/json' \
  -d '{"identity":"manager@example.com","password":"..."}' | jq -r .token)

curl -s http://127.0.0.1:8097/api/openroster/bootstrap \
  -H "Authorization: $TOKEN" | jq
```

## Money and time

- Dates are stored UTC; clients display company-local time.
- Shift local wall times are stored in `local_date`, `local_start`, `local_end` for availability checks.
- Pay periods are generated from `companies.pay_frequency`; pay date defaults to period end + 5 days.
- Payroll is a preview/export tool, not a tax engine.

## Time off and blackouts

`blackout_dates` is company-scoped and readable by authenticated staff; managers manage records. The month calendar (`/calendar`) combines leave, blackouts and scheduled-shift conflicts.

## Notifications

`notifications` is a normal PocketBase collection. Each record belongs to one `user`; list/view/update rules only expose the owner's records. `users.notification_prefs` stores `{ in_app: boolean, email: boolean }`. In-app delivery is always written for eligible events; email is opt-in and uses PocketBase mail settings.
