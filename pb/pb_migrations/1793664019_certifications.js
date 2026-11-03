/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const companies = app.findCollectionByNameOrId('companies')
  const employees = app.findCollectionByNameOrId('employees')
  const certifications = new Collection({
    type: 'base',
    name: 'certifications',
    listRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    viewRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    createRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    updateRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    deleteRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    fields: [
      { name: 'company', type: 'relation', required: true, collectionId: companies.id, maxSelect: 1, cascadeDelete: false },
      { name: 'name', type: 'text', required: true, max: 160 },
      { name: 'description', type: 'text', max: 1000 },
      { name: 'active', type: 'bool' },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_certifications_company_name ON certifications (company, name)'],
  })
  app.save(certifications)

  const employeeCerts = new Collection({
    type: 'base',
    name: 'employee_certifications',
    listRule: '@request.auth.role = "admin" || @request.auth.role = "manager" || employee.user = @request.auth.id',
    viewRule: '@request.auth.role = "admin" || @request.auth.role = "manager" || employee.user = @request.auth.id',
    createRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    updateRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    deleteRule: '@request.auth.role = "admin" || @request.auth.role = "manager"',
    fields: [
      { name: 'company', type: 'relation', required: true, collectionId: companies.id, maxSelect: 1, cascadeDelete: false },
      { name: 'employee', type: 'relation', required: true, collectionId: employees.id, maxSelect: 1, cascadeDelete: false },
      { name: 'certification', type: 'relation', required: true, collectionId: certifications.id, maxSelect: 1, cascadeDelete: false },
      { name: 'issued_at', type: 'date' },
      { name: 'expires_at', type: 'date' },
      { name: 'note', type: 'text', max: 1000 },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: ['CREATE INDEX idx_employee_certs_employee ON employee_certifications (employee, certification)'],
  })
  app.save(employeeCerts)

  const positions = app.findCollectionByNameOrId('positions')
  if (!positions.fields.getByName('required_certifications')) {
    positions.fields.add(new RelationField({
      name: 'required_certifications',
      collectionId: certifications.id,
      maxSelect: 20,
      cascadeDelete: false,
    }))
  }
  app.save(positions)
}, (app) => {
  const positions = app.findCollectionByNameOrId('positions')
  if (positions.fields.getByName('required_certifications')) positions.fields.removeByName('required_certifications')
  app.save(positions)
  try { app.delete(app.findCollectionByNameOrId('employee_certifications')) } catch {}
  try { app.delete(app.findCollectionByNameOrId('certifications')) } catch {}
})
