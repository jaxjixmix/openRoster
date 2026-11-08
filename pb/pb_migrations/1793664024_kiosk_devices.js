/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const companies = app.findCollectionByNameOrId('companies')
  const locations = app.findCollectionByNameOrId('locations')
  const users = app.findCollectionByNameOrId('users')

  const employees = app.findCollectionByNameOrId('employees')
  if (!employees.fields.getByName('kiosk_pin_hash')) {
    employees.fields.add(new TextField({ name: 'kiosk_pin_hash', max: 128 }))
  }
  app.save(employees)

  const kioskDevices = new Collection({
    type: 'base',
    name: 'kiosk_devices',
    listRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    viewRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    createRule: null,
    updateRule: null,
    deleteRule: '@request.auth.role = "admin"',
    fields: [
      { name: 'company', type: 'relation', required: true, collectionId: companies.id, maxSelect: 1, cascadeDelete: true },
      { name: 'location', type: 'relation', required: true, collectionId: locations.id, maxSelect: 1, cascadeDelete: true },
      { name: 'name', type: 'text', required: true, max: 120 },
      { name: 'token_hash', type: 'text', max: 128 },
      { name: 'pair_code_hash', type: 'text', max: 128 },
      { name: 'pair_expires_at', type: 'date' },
      { name: 'active', type: 'bool' },
      { name: 'last_seen', type: 'date' },
      { name: 'paired_by', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_kiosk_token_hash ON kiosk_devices (token_hash) WHERE token_hash != ''",
      "CREATE UNIQUE INDEX idx_kiosk_pair_hash ON kiosk_devices (pair_code_hash) WHERE pair_code_hash != ''",
    ],
  })
  app.save(kioskDevices)

  const punches = app.findCollectionByNameOrId('punches')
  if (!punches.fields.getByName('kiosk_device')) {
    punches.fields.add(new RelationField({ name: 'kiosk_device', collectionId: kioskDevices.id, maxSelect: 1, cascadeDelete: false }))
  }
  app.save(punches)
}, (app) => {
  const punches = app.findCollectionByNameOrId('punches')
  if (punches.fields.getByName('kiosk_device')) {
    punches.fields.removeByName('kiosk_device')
    app.save(punches)
  }
  try { app.delete(app.findCollectionByNameOrId('kiosk_devices')) } catch {}
  const employees = app.findCollectionByNameOrId('employees')
  if (employees.fields.getByName('kiosk_pin_hash')) {
    employees.fields.removeByName('kiosk_pin_hash')
    app.save(employees)
  }
})
