/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const companies = app.findCollectionByNameOrId('companies')
  if (!companies.fields.getByName('ui_language')) {
    companies.fields.add(new SelectField({ name: 'ui_language', values: ['auto', 'en', 'es'], maxSelect: 1 }))
    app.save(companies)
  }
}, (app) => {
  const companies = app.findCollectionByNameOrId('companies')
  if (companies.fields.getByName('ui_language')) {
    companies.fields.removeByName('ui_language')
    app.save(companies)
  }
})
