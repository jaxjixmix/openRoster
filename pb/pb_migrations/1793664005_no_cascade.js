/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // PocketBase's JS field wrapper does not reliably persist cascadeDelete on
  // relation fields, so enforce it on the collection schema JSON directly.
  app.db().newQuery(`
    UPDATE _collections
    SET fields = (
      SELECT json_group_array(
        CASE
          WHEN json_extract(value, '$.type') = 'relation'
            THEN json_set(value, '$.cascadeDelete', json('false'))
          ELSE value
        END
      )
      FROM json_each(_collections.fields)
    )
    WHERE name IN (
      'locations','departments','positions','employees','availability',
      'time_off_requests','shifts','punches','timesheets','timesheet_entries',
      'pay_runs','pay_stubs','pay_rules','holidays','documents','audit_log'
    ) AND json_valid(fields)
  `).execute()
}, (app) => {})
