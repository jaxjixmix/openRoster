/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collections = [
    'companies', 'locations', 'departments', 'positions', 'employees',
    'availability', 'time_off_requests', 'shifts', 'punches', 'timesheets',
    'timesheet_entries', 'pay_runs', 'pay_stubs', 'pay_rules', 'holidays',
    'documents', 'audit_log',
  ]
  for (const name of collections) {
    const collection = app.findCollectionByNameOrId(name)
    let changed = false
    if (!collection.fields.getByName('created')) {
      collection.fields.add(new AutodateField({ name: 'created', onCreate: true }))
      changed = true
    }
    if (!collection.fields.getByName('updated')) {
      collection.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
      changed = true
    }
    if (changed) app.save(collection)
  }
}, (app) => {
  const collections = [
    'companies', 'locations', 'departments', 'positions', 'employees',
    'availability', 'time_off_requests', 'shifts', 'punches', 'timesheets',
    'timesheet_entries', 'pay_runs', 'pay_stubs', 'pay_rules', 'holidays',
    'documents', 'audit_log',
  ]
  for (const name of collections) {
    const collection = app.findCollectionByNameOrId(name)
    collection.fields.removeByName('created')
    collection.fields.removeByName('updated')
    app.save(collection)
  }
})
