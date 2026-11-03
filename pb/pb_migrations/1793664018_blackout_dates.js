/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const companies = app.findCollectionByNameOrId('companies')
  const collection = new Collection({
    type: 'base',
    name: 'blackout_dates',
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    updateRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    deleteRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    fields: [
      { name: 'company', type: 'relation', required: true, collectionId: companies.id, maxSelect: 1, cascadeDelete: false },
      { name: 'name', type: 'text', required: true, max: 160 },
      { name: 'start_date', type: 'date', required: true },
      { name: 'end_date', type: 'date', required: true },
      { name: 'note', type: 'text', max: 1000 },
      { name: 'active', type: 'bool' },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: ['CREATE INDEX idx_blackouts_company_dates ON blackout_dates (company, start_date, end_date)'],
  })
  app.save(collection)
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId('blackout_dates')) } catch {}
})
