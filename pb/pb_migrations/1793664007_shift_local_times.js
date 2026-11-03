/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const shifts = app.findCollectionByNameOrId('shifts')
  if (!shifts.fields.getByName('local_start')) {
    shifts.fields.add(new TextField({ name: 'local_start', max: 5 }))
  }
  if (!shifts.fields.getByName('local_end')) {
    shifts.fields.add(new TextField({ name: 'local_end', max: 5 }))
  }
  app.save(shifts)
}, (app) => {
  const shifts = app.findCollectionByNameOrId('shifts')
  if (shifts.fields.getByName('local_start')) shifts.fields.removeByName('local_start')
  if (shifts.fields.getByName('local_end')) shifts.fields.removeByName('local_end')
  app.save(shifts)
})
