/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const companies = app.findCollectionByNameOrId('companies')
  const locations = app.findCollectionByNameOrId('locations')
  const collection = new Collection({
    type: 'base',
    name: 'demand_forecasts',
    listRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    viewRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    createRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    updateRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    deleteRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    fields: [
      { name: 'company', type: 'relation', required: true, collectionId: companies.id, maxSelect: 1, cascadeDelete: true },
      { name: 'location', type: 'relation', collectionId: locations.id, maxSelect: 1, cascadeDelete: true },
      { name: 'week_start', type: 'text', required: true, max: 10 },
      { name: 'days', type: 'json', required: true, maxSize: 100000 },
      { name: 'productivity', type: 'number', required: true, min: 0.1, max: 100 },
      { name: 'break_minutes', type: 'number', min: 0, max: 240 },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_demand_company_week_loc ON demand_forecasts (company, week_start, location) WHERE location != ""',
      'CREATE UNIQUE INDEX idx_demand_company_week_noloc ON demand_forecasts (company, week_start) WHERE location = ""',
    ],
  })
  app.save(collection)
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId('demand_forecasts')) } catch {}
})
