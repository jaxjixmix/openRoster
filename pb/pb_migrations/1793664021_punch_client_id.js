/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const punches = app.findCollectionByNameOrId('punches')
  if (!punches.fields.getByName('client_id')) {
    punches.fields.add(new TextField({ name: 'client_id', max: 64 }))
  }
  const source = punches.fields.getByName('source')
  if (source && !(source.values || []).includes('offline')) {
    source.values = [...(source.values || []), 'offline']
  }
  punches.indexes = punches.indexes || []
  if (!punches.indexes.some((index) => index.includes('idx_punches_client_id'))) {
    punches.indexes.push("CREATE UNIQUE INDEX idx_punches_client_id ON punches (client_id) WHERE client_id != ''")
  }
  app.save(punches)
}, (app) => {
  const punches = app.findCollectionByNameOrId('punches')
  punches.indexes = (punches.indexes || []).filter((index) => !index.includes('idx_punches_client_id'))
  const source = punches.fields.getByName('source')
  if (source) source.values = (source.values || []).filter((value) => value !== 'offline')
  if (punches.fields.getByName('client_id')) punches.fields.removeByName('client_id')
  app.save(punches)
})
