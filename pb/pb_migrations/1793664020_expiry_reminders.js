/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const companies = app.findCollectionByNameOrId('companies')
  if (!companies.fields.getByName('expiry_reminder_days')) {
    companies.fields.add(new NumberField({ name: 'expiry_reminder_days', min: 0, max: 365 }))
  }
  app.save(companies)
  app.db().newQuery("UPDATE companies SET expiry_reminder_days = 30 WHERE expiry_reminder_days = 0").execute()
}, (app) => {
  const companies = app.findCollectionByNameOrId('companies')
  if (companies.fields.getByName('expiry_reminder_days')) companies.fields.removeByName('expiry_reminder_days')
  app.save(companies)
})
