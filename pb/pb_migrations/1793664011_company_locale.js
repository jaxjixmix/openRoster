/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const companies = app.findCollectionByNameOrId('companies')
  if (!companies.fields.getByName('locale')) {
    companies.fields.add(new TextField({ name: 'locale', max: 12 }))
  }
  app.save(companies)
  app.db().newQuery("UPDATE companies SET locale = 'en-US' WHERE locale = ''").execute()
}, (app) => {
  const companies = app.findCollectionByNameOrId('companies')
  if (companies.fields.getByName('locale')) companies.fields.removeByName('locale')
  app.save(companies)
})
