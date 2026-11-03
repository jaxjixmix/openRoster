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
