/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const companies = app.findCollectionByNameOrId('companies')
  if (!companies.fields.getByName('pto_accrual_hours_per_period')) {
    companies.fields.add(new NumberField({ name: 'pto_accrual_hours_per_period', min: 0, max: 1000 }))
  }
  if (!companies.fields.getByName('pto_accrual_hours_per_hour')) {
    companies.fields.add(new NumberField({ name: 'pto_accrual_hours_per_hour', min: 0, max: 10 }))
  }
  app.save(companies)

  const employees = app.findCollectionByNameOrId('employees')
  const timeOff = app.findCollectionByNameOrId('time_off_requests')
  const users = app.findCollectionByNameOrId('users')
  const ledger = new Collection({
    type: 'base',
    name: 'pto_entries',
    listRule: '@request.auth.role = "admin" || @request.auth.role = "manager" || employee.user = @request.auth.id',
    viewRule: '@request.auth.role = "admin" || @request.auth.role = "manager" || employee.user = @request.auth.id',
    createRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    updateRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    deleteRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    fields: [
      { name: 'company', type: 'relation', required: true, collectionId: companies.id, maxSelect: 1, cascadeDelete: false },
      { name: 'employee', type: 'relation', required: true, collectionId: employees.id, maxSelect: 1, cascadeDelete: false },
      { name: 'date', type: 'date', required: true },
      { name: 'type', type: 'select', required: true, values: ['accrual', 'usage', 'adjustment', 'carryover'], maxSelect: 1 },
      { name: 'hours', type: 'number', required: true, min: -10000, max: 10000 },
      { name: 'note', type: 'text', max: 500 },
      { name: 'time_off_request', type: 'relation', collectionId: timeOff.id, maxSelect: 1, cascadeDelete: false },
      { name: 'period_start', type: 'date' },
      { name: 'created_by', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE INDEX idx_pto_entries_employee_date ON pto_entries (employee, date)',
      "CREATE UNIQUE INDEX idx_pto_entries_request ON pto_entries (time_off_request) WHERE time_off_request != ''",
      "CREATE UNIQUE INDEX idx_pto_accrual_period ON pto_entries (employee, period_start) WHERE type = 'accrual' AND period_start != ''",
    ],
  })
  app.save(ledger)

  // Backfill existing installs: opening balance + usage for already-approved leave.
  const allEmployees = app.findRecordsByFilter('employees', '1 = 1', '', 10000, 0)
  allEmployees.forEach((employee) => {
    const existing = app.findRecordsByFilter('pto_entries', 'employee = {:employee}', '', 1, 0, { employee: employee.id })
    if (existing.length) return
    const balance = employee.getFloat('pto_balance_hours') || 0
    if (balance !== 0) {
      const entry = new Record(ledger)
      entry.set('company', employee.getString('company'))
      entry.set('employee', employee.id)
      entry.set('date', new Date().toISOString())
      entry.set('type', 'carryover')
      entry.set('hours', balance)
      entry.set('note', 'Opening balance')
      app.save(entry)
    }
  })

  const approved = app.findRecordsByFilter('time_off_requests', "status = 'approved'", '', 10000, 0)
  approved.forEach((request) => {
    let employee
    try { employee = app.findRecordById('employees', request.getString('employee')) } catch { return }
    let existing = []
    try { existing = app.findRecordsByFilter('pto_entries', 'time_off_request = {:request}', '', 1, 0, { request: request.id }) } catch {}
    if (existing.length) return
    const entry = new Record(ledger)
    entry.set('company', employee.getString('company'))
    entry.set('employee', employee.id)
    entry.set('date', request.getString('start_date'))
    entry.set('type', 'usage')
    entry.set('hours', -Math.abs(request.getFloat('hours') || 0))
    entry.set('note', 'Approved time off')
    entry.set('time_off_request', request.id)
    entry.set('created_by', request.getString('approved_by'))
    app.save(entry)
  })

  // Recalculate cached balances from the ledger.
  allEmployees.forEach((employee) => {
    const entries = app.findRecordsByFilter('pto_entries', 'employee = {:employee}', '', 10000, 0, { employee: employee.id })
    const balance = Math.round(entries.reduce((sum, entry) => sum + entry.getFloat('hours'), 0) * 100) / 100
    employee.set('pto_balance_hours', balance)
    app.save(employee)
  })
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId('pto_entries')) } catch {}
  const companies = app.findCollectionByNameOrId('companies')
  if (companies.fields.getByName('pto_accrual_hours_per_period')) companies.fields.removeByName('pto_accrual_hours_per_period')
  if (companies.fields.getByName('pto_accrual_hours_per_hour')) companies.fields.removeByName('pto_accrual_hours_per_hour')
  app.save(companies)
})
