/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const payRuns = app.findCollectionByNameOrId('pay_runs')

  if (!payRuns.fields.getByName('voided_at')) {
    payRuns.fields.add(new DateField({ name: 'voided_at' }))
  }
  if (!payRuns.fields.getByName('void_reason')) {
    payRuns.fields.add(new TextField({ name: 'void_reason', max: 1000 }))
  }
  const status = payRuns.fields.getByName('status')
  if (status && !status.values.includes('voided')) {
    status.values = status.values.concat(['voided'])
  }

  // A voided run must never block a corrected replacement for the same period.
  payRuns.indexes = payRuns.indexes.filter((index) => !index.includes('idx_payruns_company_period'))
  payRuns.indexes.push(
    "CREATE UNIQUE INDEX idx_payruns_company_period_active ON pay_runs (company, period_start) WHERE status != 'voided'",
  )
  app.save(payRuns)
}, (app) => {
  const payRuns = app.findCollectionByNameOrId('pay_runs')
  const status = payRuns.fields.getByName('status')
  if (status) status.values = status.values.filter((value) => value !== 'voided')
  if (payRuns.fields.getByName('voided_at')) payRuns.fields.removeByName('voided_at')
  if (payRuns.fields.getByName('void_reason')) payRuns.fields.removeByName('void_reason')
  payRuns.indexes = payRuns.indexes.filter((index) => !index.includes('idx_payruns_company_period_active'))
  payRuns.indexes.push('CREATE UNIQUE INDEX idx_payruns_company_period ON pay_runs (company, period_start)')
  app.save(payRuns)
})
