/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const punches = app.findCollectionByNameOrId('punches')
  const type = punches.fields.getByName('type')
  if (type) {
    type.values = ['in', 'out', 'break_start', 'break_end']
    app.save(punches)
  }
  const companies = app.findCollectionByNameOrId('companies')
  if (!companies.fields.getByName('punch_rounding_minutes')) {
    companies.fields.add(new NumberField({ name: 'punch_rounding_minutes', min: 0, max: 60 }))
  }
  app.save(companies)
}, (app) => {
  const punches = app.findCollectionByNameOrId('punches')
  const type = punches.fields.getByName('type')
  if (type) {
    type.values = ['in', 'out']
    app.save(punches)
  }
  const companies = app.findCollectionByNameOrId('companies')
  if (companies.fields.getByName('punch_rounding_minutes')) {
    companies.fields.removeByName('punch_rounding_minutes')
  }
  app.save(companies)
})
