/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const companies = app.findCollectionByNameOrId('companies')
  const locations = app.findCollectionByNameOrId('locations')
  const departments = app.findCollectionByNameOrId('departments')
  const positions = app.findCollectionByNameOrId('positions')
  const employees = app.findCollectionByNameOrId('employees')

  const templates = new Collection({
    type: 'base',
    name: 'shift_templates',
    listRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    viewRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    createRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    updateRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    deleteRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    fields: [
      { name: 'company', type: 'relation', required: true, collectionId: companies.id, maxSelect: 1, cascadeDelete: false },
      { name: 'location', type: 'relation', collectionId: locations.id, maxSelect: 1, cascadeDelete: false },
      { name: 'department', type: 'relation', collectionId: departments.id, maxSelect: 1, cascadeDelete: false },
      { name: 'position', type: 'relation', collectionId: positions.id, maxSelect: 1, cascadeDelete: false },
      { name: 'employee', type: 'relation', collectionId: employees.id, maxSelect: 1, cascadeDelete: false },
      { name: 'weekday', type: 'select', required: true, values: ['0', '1', '2', '3', '4', '5', '6'], maxSelect: 1 },
      { name: 'start_time', type: 'text', required: true, max: 5 },
      { name: 'end_time', type: 'text', required: true, max: 5 },
      { name: 'break_minutes', type: 'number', min: 0, max: 1440 },
      { name: 'active', type: 'bool' },
      { name: 'notes', type: 'text', max: 1000 },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: ['CREATE INDEX idx_shift_templates_company_weekday ON shift_templates (company, weekday)'],
  })
  app.save(templates)

  const shifts = app.findCollectionByNameOrId('shifts')
  if (!shifts.fields.getByName('template')) {
    shifts.fields.add(new RelationField({
      name: 'template',
      collectionId: templates.id,
      maxSelect: 1,
      cascadeDelete: false,
    }))
  }
  if (!shifts.indexes.some((index) => index.includes('idx_shifts_template_date'))) {
    shifts.indexes.push("CREATE UNIQUE INDEX idx_shifts_template_date ON shifts (template, local_date) WHERE template != ''")
  }
  app.save(shifts)
}, (app) => {
  const shifts = app.findCollectionByNameOrId('shifts')
  if (shifts.fields.getByName('template')) shifts.fields.removeByName('template')
  shifts.indexes = shifts.indexes.filter((index) => !index.includes('idx_shifts_template_date'))
  app.save(shifts)
  try { app.delete(app.findCollectionByNameOrId('shift_templates')) } catch {}
})
