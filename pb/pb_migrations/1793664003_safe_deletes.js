/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // 1. Cascade deletes are removed by 1793664005_no_cascade.js.

  // 2. Archive people instead of deleting them.
  const employees = app.findCollectionByNameOrId('employees')
  if (!employees.fields.getByName('archived_at')) {
    employees.fields.add(new DateField({ name: 'archived_at' }))
  }
  const status = employees.fields.getByName('status')
  if (status && !status.values.includes('archived')) {
    status.values = status.values.concat(['archived'])
  }
  app.save(employees)

  // 3. Destructive deletes are superuser-only. Managers archive instead.
  const deleteRules = {
    companies: null,
    employees: null,
    punches: null,
    timesheets: null,
    timesheet_entries: null,
    pay_runs: null,
    pay_stubs: null,
  }
  for (const [name, rule] of Object.entries(deleteRules)) {
    const collection = app.findCollectionByNameOrId(name)
    collection.deleteRule = rule
    app.save(collection)
  }
}, (app) => {
  const employees = app.findCollectionByNameOrId('employees')
  const status = employees.fields.getByName('status')
  if (status) status.values = status.values.filter((value) => value !== 'archived')
  if (employees.fields.getByName('archived_at')) employees.fields.removeByName('archived_at')
  app.save(employees)

  const restoreRules = {
    companies: '@request.auth.role = "admin"',
    employees: '@request.auth.role = "admin"',
    punches: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    timesheets: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    timesheet_entries: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    pay_runs: '@request.auth.role = "admin"',
    pay_stubs: '@request.auth.role = "admin" || @request.auth.role = "manager"',
  }
  for (const [name, rule] of Object.entries(restoreRules)) {
    const collection = app.findCollectionByNameOrId(name)
    collection.deleteRule = rule
    app.save(collection)
  }
})
