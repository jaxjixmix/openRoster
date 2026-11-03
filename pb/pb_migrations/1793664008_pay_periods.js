/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const companies = app.findCollectionByNameOrId('companies')
  const users = app.findCollectionByNameOrId('users')
  const collection = new Collection({
    type: 'base',
    name: 'pay_periods',
    listRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    viewRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    createRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    updateRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    deleteRule: null,
    fields: [
      { name: 'company', type: 'relation', required: true, collectionId: companies.id, maxSelect: 1, cascadeDelete: false },
      { name: 'period_start', type: 'date', required: true },
      { name: 'period_end', type: 'date', required: true },
      { name: 'pay_date', type: 'date' },
      { name: 'status', type: 'select', values: ['open', 'closed'], maxSelect: 1 },
      { name: 'locked_at', type: 'date' },
      { name: 'created_by', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_payperiods_company_start ON pay_periods (company, period_start)'],
  })
  app.save(collection)
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId('pay_periods')) } catch {}
})
