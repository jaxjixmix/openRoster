/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const shifts = app.findCollectionByNameOrId('shifts')
  const rule = '@request.auth.role = "admin" || @request.auth.role = "manager" || employee.user = @request.auth.id || (employee = "" && status = "published")'
  shifts.listRule = rule
  shifts.viewRule = rule
  app.save(shifts)
}, (app) => {
  const shifts = app.findCollectionByNameOrId('shifts')
  const rule = '@request.auth.role = "admin" || @request.auth.role = "manager" || employee.user = @request.auth.id'
  shifts.listRule = rule
  shifts.viewRule = rule
  app.save(shifts)
})
