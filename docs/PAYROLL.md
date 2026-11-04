# Payroll model

OpenRoster is a scheduling and time-and-attendance tool with a **payroll preview**, not a payroll provider.

## What it does

- Generates `pay_periods` from the company's `pay_frequency` (weekly, biweekly, semimonthly, monthly).
- Uses the selected period for preview and draft runs.
- Calculates hourly regular, overtime and PTO pay; salaried pay is prorated by calendar days in the period.
- Applies configurable `pay_rules` (percent of gross, fixed per hour, fixed per period).
- Locks pay runs after approval: `draft → approved → paid → voided`.
- Marks the matching `pay_periods` row `closed` when paid and reopens it when a paid run is voided.
- Keeps stubs and timesheets when a run is voided.
- Exports preview/pay data to CSV. Printable/PDF stubs are not included yet.

## Tax and payment strategy

**Do not build withholding tables in-house.** OpenRoster deliberately stays export-only:

1. Configure representative flat rates for internal costing.
2. Export approved hours and gross pay to CSV.
3. Hand the export to a payroll provider or accountant.
4. If a provider API is added later (Gusto/Check/Square), it should replace the flat-rule calculation, not sit on top of it.

Tax filing, W-2/1099, direct deposit, garnishments, tips, local taxes and multi-jurisdiction rules are **not implemented**.

## Time rounding

Companies can set `punch_rounding_minutes` (0 disables it). Daily worked minutes are rounded after breaks are subtracted, before overtime is calculated. Break punches (`break_start`/`break_end`) are stored in `punches` and shown on the time clock.

## PTO ledger

`pto_entries` is the source of truth:

- `carryover` — opening balance
- `accrual` — added by a pay run (`pto_accrual_hours_per_period` + `pto_accrual_hours_per_hour`)
- `usage` — created when time off is approved, reversed when it is denied/cancelled
- `adjustment` — manual manager correction

`employees.pto_balance_hours` is a cached sum updated after every ledger change. People detail shows the history.

## Known gaps

- PDF pay stubs
- pay-run reversal that also reverses PTO accrual
- accrual caps, waiting periods, carryover expiry and jurisdiction-specific PTO
- tax tables, filings, direct deposit
- full pay-period calendar UI (generation and selection are implemented; editing/closure is automatic)
- translated UI copy (locale only changes currency/date formatting)


## Export contract (#6)

OpenRoster is intentionally export-only: it calculates gross pay from configurable rules and hands a stable file to an accountant or payroll provider. It does not file taxes, move money, or maintain withholding tables. `Export CSV` / `Export JSON` on a pay run detail are the contract.

### CSV columns (v1, stable order)

`run_id, run_status, employee_ref, employee_name, period_start, period_end, pay_date, currency, regular_hours, overtime_hours, pto_hours, gross_pay, employee_taxes, employee_deductions, employer_taxes, net_pay`

One row per employee per run. `employee_ref` is the OpenRoster employee record id; map it once in your provider/accounting import and keep the mapping.

### JSON shape (contract_version 1)

```json
{
  "contract_version": 1,
  "generated_at": "ISO-8601",
  "run": { "id": "…", "status": "approved", "period_start": "…", "period_end": "…", "pay_date": "…", "void_reason": "" },
  "currency": "USD",
  "totals": { "gross": 0, "employee_taxes": 0, "employee_deductions": 0, "net": 0 },
  "payments": [{
    "employee_ref": "…",
    "employee_name": "…",
    "hours": { "regular": 0, "overtime": 0, "pto": 0 },
    "pay": { "regular": 0, "overtime": 0, "pto": 0, "gross": 0, "employee_taxes": 0, "employee_deductions": 0, "employer_taxes": 0, "net": 0 },
    "lines": [ { "name": "…", "type": "federal_tax", "calc": "percent", "rate": 0, "amount": 0, "employer": false } ]
  }]
}
```

- Missing/null numeric fields are always present as `0`.
- `run.status` is `draft | approved | paid | voided`. Treat `voided` as "do not pay this"; period totals in a later run supersede it.
- View the columns as append-only: new fields may be added to the JSON, existing field semantics do not change.

### Void / reversal

Voiding a draft/approved run frees the period for a clean re-run. Voiding a `paid` run additionally reverts that period's paid timesheets back to `approved` and deletes the PTO accrual entries the run booked (balances are recalculated from the ledger). Pay stubs and the pay-run record are kept for the audit trail. There is no in-app Cancellation-of-submission: if a provider already received the file, issue their correction/supplement outside OpenRoster.

### Provider sandbox

No provider integration ships. When one is added, it should consume this JSON as upsert with `run.id` as the provider idempotency key and reconcile webhooks against `run.status`.
