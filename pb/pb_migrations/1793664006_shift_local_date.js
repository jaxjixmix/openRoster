/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const shifts = app.findCollectionByNameOrId('shifts')
  if (!shifts.fields.getByName('local_date')) {
    shifts.fields.add(new DateField({ name: 'local_date' }))
  }
  if (!shifts.indexes.some((index) => index.includes('idx_shifts_local_date'))) {
    shifts.indexes.push('CREATE INDEX idx_shifts_local_date ON shifts (local_date)')
  }
  app.save(shifts)
}, (app) => {
  const shifts = app.findCollectionByNameOrId('shifts')
  if (shifts.fields.getByName('local_date')) shifts.fields.removeByName('local_date')
  shifts.indexes = shifts.indexes.filter((index) => !index.includes('idx_shifts_local_date'))
  app.save(shifts)
})
