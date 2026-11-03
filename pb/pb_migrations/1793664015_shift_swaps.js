/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const shifts = app.findCollectionByNameOrId('shifts')
  const employees = app.findCollectionByNameOrId('employees')
  const users = app.findCollectionByNameOrId('users')
  const collection = new Collection({
    type: 'base',
    name: 'shift_swaps',
    listRule: '@request.auth.role = "admin" || @request.auth.role = "manager" || offered_by.user = @request.auth.id || accepted_by.user = @request.auth.id',
    viewRule: '@request.auth.role = "admin" || @request.auth.role = "manager" || offered_by.user = @request.auth.id || accepted_by.user = @request.auth.id',
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: 'shift', type: 'relation', required: true, collectionId: shifts.id, maxSelect: 1, cascadeDelete: false },
      { name: 'offered_by', type: 'relation', required: true, collectionId: employees.id, maxSelect: 1, cascadeDelete: false },
      { name: 'accepted_by', type: 'relation', collectionId: employees.id, maxSelect: 1, cascadeDelete: false },
      { name: 'status', type: 'select', values: ['open', 'accepted', 'approved', 'denied', 'cancelled'], maxSelect: 1 },
      { name: 'note', type: 'text', max: 1000 },
      { name: 'created_by', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE INDEX idx_shift_swaps_shift ON shift_swaps (shift, status)',
      'CREATE INDEX idx_shift_swaps_offered ON shift_swaps (offered_by, status)',
    ],
  })
  app.save(collection)
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId('shift_swaps')) } catch {}
})
