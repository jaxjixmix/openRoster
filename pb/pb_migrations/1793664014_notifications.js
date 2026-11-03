/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId('users')
  if (!users.fields.getByName('notification_prefs')) {
    users.fields.add(new JSONField({ name: 'notification_prefs', maxSize: 2000 }))
    app.save(users)
  }
  const collection = new Collection({
    type: 'base',
    name: 'notifications',
    listRule: 'user = @request.auth.id',
    viewRule: 'user = @request.auth.id',
    createRule: null,
    updateRule: 'user = @request.auth.id',
    deleteRule: null,
    fields: [
      { name: 'user', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'type', type: 'select', required: true, values: ['schedule', 'timeoff', 'payroll', 'claim', 'system'], maxSelect: 1 },
      { name: 'title', type: 'text', required: true, max: 160 },
      { name: 'body', type: 'text', max: 1000 },
      { name: 'link', type: 'text', max: 300 },
      { name: 'read', type: 'bool' },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: ['CREATE INDEX idx_notifications_user_read ON notifications (user, read, created)'],
  })
  app.save(collection)
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId('notifications')) } catch {}
  const users = app.findCollectionByNameOrId('users')
  if (users.fields.getByName('notification_prefs')) users.fields.removeByName('notification_prefs')
  app.save(users)
})
