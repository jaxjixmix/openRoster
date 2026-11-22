/// <reference path="../pb_data/types.d.ts" />
// Kiosk PIN hardening: a per-company PIN fingerprint so two employees cannot share a PIN,
// a record of when a PIN was set, and an attempt trail that the lockout is derived from.
migrate((app) => {
  const companies = app.findCollectionByNameOrId('companies')
  const employees = app.findCollectionByNameOrId('employees')
  const devices = app.findCollectionByNameOrId('kiosk_devices')

  if (!employees.fields.getByName('kiosk_pin_key')) {
    employees.fields.add(new TextField({ name: 'kiosk_pin_key', max: 64 }))
  }
  if (!employees.fields.getByName('kiosk_pin_set_at')) {
    employees.fields.add(new DateField({ name: 'kiosk_pin_set_at' }))
  }
  app.save(employees)

  const events = new Collection({
    type: 'base',
    name: 'kiosk_auth_events',
    listRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    viewRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: 'kind', type: 'select', required: true, values: ['fail', 'reset'], maxSelect: 1 },
      { name: 'employee', type: 'relation', collectionId: employees.id, maxSelect: 1, cascadeDelete: false },
      { name: 'device', type: 'relation', collectionId: devices.id, maxSelect: 1, cascadeDelete: false },
      { name: 'ip_hash', type: 'text', max: 64 },
      { name: 'note', type: 'text', max: 200 },
      { name: 'at', type: 'date', required: true },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE INDEX idx_kiosk_events_kind_at ON kiosk_auth_events (kind, at)',
      'CREATE INDEX idx_kiosk_events_employee_at ON kiosk_auth_events (employee, at)',
      'CREATE INDEX idx_kiosk_events_device_at ON kiosk_auth_events (device, at)',
      'CREATE INDEX idx_kiosk_events_ip_at ON kiosk_auth_events (ip_hash, at)',
    ],
  })
  app.save(events)

  // One PIN per company: the fingerprint is peppered, so this index leaks nothing usable.
  if (!employees.indexes.find((index) => index.indexOf('idx_employees_kiosk_pin_key') !== -1)) {
    employees.indexes.push("CREATE UNIQUE INDEX idx_employees_kiosk_pin_key ON employees (company, kiosk_pin_key) WHERE kiosk_pin_key != ''")
  }
  app.save(employees)
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId('kiosk_auth_events')) } catch {}
  const employees = app.findCollectionByNameOrId('employees')
  if (employees.fields.getByName('kiosk_pin_key')) employees.fields.removeByName('kiosk_pin_key')
  if (employees.fields.getByName('kiosk_pin_set_at')) employees.fields.removeByName('kiosk_pin_set_at')
  app.save(employees)
})
