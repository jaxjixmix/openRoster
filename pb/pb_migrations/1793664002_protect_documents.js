/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId('documents')
  const file = collection.fields.getByName('file')
  if (file) {
    file.protected = true
    app.save(collection)
  }
}, (app) => {
  const collection = app.findCollectionByNameOrId('documents')
  const file = collection.fields.getByName('file')
  if (file) {
    file.protected = false
    app.save(collection)
  }
})
