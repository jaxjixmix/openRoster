# Data retention

OpenRoster keeps payroll and attendance history on purpose. Do not use this policy to delete `pay_runs`, `pay_stubs`, `timesheets`, `timesheet_entries` or `punches` — those records support wages, disputes and audits.

## Defaults

| Data | Default | Behaviour |
|---|---|---|
| Notifications | 180 days | Deleted after the window |
| Audit log | 365 days | Deleted after the window |
| Documents for archived employees | 365 days | Deleted after the window |

Employee and certification records are not deleted; archive a person instead of removing them.

## Running

```bash
# Dry run (default)
PB_SUPERUSER_PASSWORD='...' node scripts/retention.mjs

# Apply
PB_SUPERUSER_PASSWORD='...' node scripts/retention.mjs --apply
```

`make retention` and `make retention-apply` are shortcuts. Override windows with:

```bash
RETENTION_NOTIFICATION_DAYS=90 \
RETENTION_AUDIT_DAYS=730 \
RETENTION_EMPLOYEE_DATA_DAYS=365 \
PB_SUPERUSER_PASSWORD='...' node scripts/retention.mjs
```

## Before applying

1. Create a `make backup`.
2. Run the dry run and review counts.
3. Check local/state retention laws: payroll and attendance minimums vary by jurisdiction.
4. Never purge data that is under legal hold or an open dispute.
