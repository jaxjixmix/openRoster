/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const companies = app.findCollectionByNameOrId('companies')
  if (!companies.fields.getByName('weekly_labor_budget')) {
    companies.fields.add(new NumberField({ name: 'weekly_labor_budget', min: 0, max: 100000000 }))
  }
  app.save(companies)
}, (app) => {
  const companies = app.findCollectionByNameOrId('companies')
  if (companies.fields.getByName('weekly_labor_budget')) companies.fields.removeByName('weekly_labor_budget')
  app.save(companies)
})
