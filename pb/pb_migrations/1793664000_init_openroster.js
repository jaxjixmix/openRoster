/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const AUTH = '@request.auth.id != ""'
  const MGR = '@request.auth.role = "admin" || @request.auth.role = "manager"'
  const SELF = 'employee.user = @request.auth.id'
  const ADMIN = '@request.auth.role = "admin"'

  // ---------------------------------------------------------------- users
  let users = null
  try {
    users = app.findCollectionByNameOrId('users')
  } catch {}

  if (!users) {
    users = new Collection({
      type: 'auth',
      name: 'users',
      listRule: `id = @request.auth.id || ${MGR}`,
      viewRule: `id = @request.auth.id || ${MGR}`,
      createRule: ADMIN,
      updateRule: `id = @request.auth.id || ${ADMIN}`,
      deleteRule: ADMIN,
      passwordAuth: { enabled: true, identityFields: ['email'] },
      fields: [
        { name: 'name', type: 'text', max: 120 },
        { name: 'role', type: 'select', values: ['admin', 'manager', 'employee'], maxSelect: 1 },
        { name: 'phone', type: 'text', max: 40 },
      ],
    })
    app.save(users)
  } else {
    let changed = false
    if (!users.fields.getByName('role')) {
      users.fields.add(new SelectField({ name: 'role', values: ['admin', 'manager', 'employee'], maxSelect: 1 }))
      changed = true
    }
    if (!users.fields.getByName('phone')) {
      users.fields.add(new TextField({ name: 'phone', max: 40 }))
      changed = true
    }
    users.listRule = `id = @request.auth.id || ${MGR}`
    users.viewRule = `id = @request.auth.id || ${MGR}`
    users.createRule = ADMIN
    users.updateRule = `id = @request.auth.id || ${ADMIN}`
    users.deleteRule = ADMIN
    app.save(users)
    if (!changed) { /* rules still saved above */ }
  }

  // ---------------------------------------------------------------- company
  const companies = new Collection({
    type: 'base',
    name: 'companies',
    listRule: AUTH,
    viewRule: AUTH,
    createRule: ADMIN,
    updateRule: ADMIN,
    deleteRule: ADMIN,
    fields: [
      { name: 'name', type: 'text', required: true, max: 120 },
      { name: 'legal_name', type: 'text', max: 200 },
      { name: 'timezone', type: 'text', max: 60 },
      { name: 'currency', type: 'text', max: 8 },
      { name: 'week_start', type: 'select', values: ['0', '1', '2', '3', '4', '5', '6'], maxSelect: 1 },
      { name: 'pay_frequency', type: 'select', values: ['weekly', 'biweekly', 'semimonthly', 'monthly'], maxSelect: 1 },
      { name: 'overtime_weekly_hours', type: 'number', min: 0, max: 168 },
      { name: 'overtime_daily_hours', type: 'number', min: 0, max: 24 },
      { name: 'overtime_multiplier', type: 'number', min: 1, max: 5 },
      { name: 'address', type: 'text', max: 500 },
      { name: 'phone', type: 'text', max: 40 },
      { name: 'logo', type: 'file', maxSelect: 1, maxSize: 5242880, mimeTypes: ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'] },
      { name: 'setup_complete', type: 'bool' },
    ],
  })
  app.save(companies)

  const locations = new Collection({
    type: 'base',
    name: 'locations',
    listRule: AUTH,
    viewRule: AUTH,
    createRule: MGR,
    updateRule: MGR,
    deleteRule: ADMIN,
    fields: [
      { name: 'company', type: 'relation', required: true, collectionId: companies.id, maxSelect: 1, cascadeDelete: true },
      { name: 'name', type: 'text', required: true, max: 120 },
      { name: 'address', type: 'text', max: 500 },
      { name: 'timezone', type: 'text', max: 60 },
      { name: 'lat', type: 'number', min: -90, max: 90 },
      { name: 'lng', type: 'number', min: -180, max: 180 },
      { name: 'geofence_meters', type: 'number', min: 0, max: 100000 },
      { name: 'active', type: 'bool' },
    ],
  })
  app.save(locations)

  const departments = new Collection({
    type: 'base',
    name: 'departments',
    listRule: AUTH,
    viewRule: AUTH,
    createRule: MGR,
    updateRule: MGR,
    deleteRule: ADMIN,
    fields: [
      { name: 'company', type: 'relation', required: true, collectionId: companies.id, maxSelect: 1, cascadeDelete: true },
      { name: 'name', type: 'text', required: true, max: 120 },
      { name: 'color', type: 'text', max: 24 },
    ],
  })
  app.save(departments)

  const positions = new Collection({
    type: 'base',
    name: 'positions',
    listRule: AUTH,
    viewRule: AUTH,
    createRule: MGR,
    updateRule: MGR,
    deleteRule: ADMIN,
    fields: [
      { name: 'company', type: 'relation', required: true, collectionId: companies.id, maxSelect: 1, cascadeDelete: true },
      { name: 'department', type: 'relation', collectionId: departments.id, maxSelect: 1, cascadeDelete: false },
      { name: 'name', type: 'text', required: true, max: 120 },
      { name: 'default_rate', type: 'number', min: 0, max: 100000 },
      { name: 'active', type: 'bool' },
    ],
  })
  app.save(positions)

  const employees = new Collection({
    type: 'base',
    name: 'employees',
    listRule: `${MGR} || user = @request.auth.id`,
    viewRule: `${MGR} || user = @request.auth.id`,
    createRule: MGR,
    updateRule: MGR,
    deleteRule: ADMIN,
    fields: [
      { name: 'user', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'company', type: 'relation', required: true, collectionId: companies.id, maxSelect: 1, cascadeDelete: true },
      { name: 'location', type: 'relation', collectionId: locations.id, maxSelect: 1, cascadeDelete: false },
      { name: 'department', type: 'relation', collectionId: departments.id, maxSelect: 1, cascadeDelete: false },
      { name: 'position', type: 'relation', collectionId: positions.id, maxSelect: 1, cascadeDelete: false },
      { name: 'employee_number', type: 'text', max: 40 },
      { name: 'first_name', type: 'text', required: true, max: 80 },
      { name: 'last_name', type: 'text', required: true, max: 80 },
      { name: 'email', type: 'email' },
      { name: 'phone', type: 'text', max: 40 },
      { name: 'hire_date', type: 'date' },
      { name: 'termination_date', type: 'date' },
      { name: 'employment_type', type: 'select', values: ['full_time', 'part_time', 'contractor'], maxSelect: 1 },
      { name: 'pay_type', type: 'select', values: ['hourly', 'salary'], maxSelect: 1 },
      { name: 'pay_rate', type: 'number', min: 0, max: 10000000 },
      { name: 'overtime_exempt', type: 'bool' },
      { name: 'max_weekly_hours', type: 'number', min: 0, max: 168 },
      { name: 'pto_balance_hours', type: 'number', min: 0, max: 10000 },
      { name: 'status', type: 'select', values: ['active', 'inactive'], maxSelect: 1 },
      { name: 'notes', type: 'text', max: 5000 },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_employees_user ON employees (user)',
      'CREATE INDEX idx_employees_company_status ON employees (company, status)',
      'CREATE INDEX idx_employees_location ON employees (location)',
    ],
  })
  app.save(employees)
  employees.fields.add(new RelationField({ name: 'manager', collectionId: employees.id, maxSelect: 1, cascadeDelete: false }))
  app.save(employees)

  const availability = new Collection({
    type: 'base',
    name: 'availability',
    listRule: `${MGR} || ${SELF}`,
    viewRule: `${MGR} || ${SELF}`,
    createRule: `${MGR} || ${SELF}`,
    updateRule: `${MGR} || ${SELF}`,
    deleteRule: `${MGR} || ${SELF}`,
    fields: [
      { name: 'employee', type: 'relation', required: true, collectionId: employees.id, maxSelect: 1, cascadeDelete: true },
      { name: 'weekday', type: 'select', required: true, values: ['0', '1', '2', '3', '4', '5', '6'], maxSelect: 1 },
      { name: 'start_time', type: 'text', required: true, max: 5 },
      { name: 'end_time', type: 'text', required: true, max: 5 },
      { name: 'effective_from', type: 'date' },
      { name: 'effective_to', type: 'date' },
      { name: 'notes', type: 'text', max: 500 },
    ],
    indexes: ['CREATE INDEX idx_availability_employee ON availability (employee, weekday)'],
  })
  app.save(availability)

  const timeOff = new Collection({
    type: 'base',
    name: 'time_off_requests',
    listRule: `${MGR} || ${SELF}`,
    viewRule: `${MGR} || ${SELF}`,
    createRule: `${MGR} || ${SELF}`,
    updateRule: MGR,
    deleteRule: MGR,
    fields: [
      { name: 'employee', type: 'relation', required: true, collectionId: employees.id, maxSelect: 1, cascadeDelete: true },
      { name: 'type', type: 'select', required: true, values: ['vacation', 'sick', 'unpaid', 'other'], maxSelect: 1 },
      { name: 'start_date', type: 'date', required: true },
      { name: 'end_date', type: 'date', required: true },
      { name: 'hours', type: 'number', min: 0, max: 10000 },
      { name: 'status', type: 'select', values: ['pending', 'approved', 'denied'], maxSelect: 1 },
      { name: 'approved_by', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'note', type: 'text', max: 2000 },
    ],
    indexes: ['CREATE INDEX idx_timeoff_employee_dates ON time_off_requests (employee, start_date, end_date)'],
  })
  app.save(timeOff)

  const shifts = new Collection({
    type: 'base',
    name: 'shifts',
    listRule: `${MGR} || employee.user = @request.auth.id`,
    viewRule: `${MGR} || employee.user = @request.auth.id`,
    createRule: MGR,
    updateRule: MGR,
    deleteRule: MGR,
    fields: [
      { name: 'company', type: 'relation', required: true, collectionId: companies.id, maxSelect: 1, cascadeDelete: true },
      { name: 'location', type: 'relation', collectionId: locations.id, maxSelect: 1, cascadeDelete: false },
      { name: 'department', type: 'relation', collectionId: departments.id, maxSelect: 1, cascadeDelete: false },
      { name: 'position', type: 'relation', collectionId: positions.id, maxSelect: 1, cascadeDelete: false },
      { name: 'employee', type: 'relation', collectionId: employees.id, maxSelect: 1, cascadeDelete: false },
      { name: 'starts_at', type: 'date', required: true },
      { name: 'ends_at', type: 'date', required: true },
      { name: 'break_minutes', type: 'number', min: 0, max: 1440 },
      { name: 'status', type: 'select', values: ['draft', 'published'], maxSelect: 1 },
      { name: 'source', type: 'select', values: ['manual', 'auto', 'swap'], maxSelect: 1 },
      { name: 'notes', type: 'text', max: 2000 },
      { name: 'created_by', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
    ],
    indexes: [
      'CREATE INDEX idx_shifts_company_start ON shifts (company, starts_at)',
      'CREATE INDEX idx_shifts_employee_start ON shifts (employee, starts_at)',
      'CREATE INDEX idx_shifts_location_start ON shifts (location, starts_at)',
    ],
  })
  app.save(shifts)

  const punches = new Collection({
    type: 'base',
    name: 'punches',
    listRule: `${MGR} || ${SELF}`,
    viewRule: `${MGR} || ${SELF}`,
    createRule: `${MGR} || ${SELF}`,
    updateRule: MGR,
    deleteRule: MGR,
    fields: [
      { name: 'employee', type: 'relation', required: true, collectionId: employees.id, maxSelect: 1, cascadeDelete: true },
      { name: 'location', type: 'relation', collectionId: locations.id, maxSelect: 1, cascadeDelete: false },
      { name: 'type', type: 'select', required: true, values: ['in', 'out'], maxSelect: 1 },
      { name: 'punched_at', type: 'date', required: true },
      { name: 'source', type: 'select', values: ['web', 'kiosk', 'mobile', 'admin'], maxSelect: 1 },
      { name: 'lat', type: 'number', min: -90, max: 90 },
      { name: 'lng', type: 'number', min: -180, max: 180 },
      { name: 'note', type: 'text', max: 500 },
      { name: 'created_by', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
    ],
    indexes: ['CREATE INDEX idx_punches_employee_time ON punches (employee, punched_at)'],
  })
  app.save(punches)

  const timesheets = new Collection({
    type: 'base',
    name: 'timesheets',
    listRule: `${MGR} || ${SELF}`,
    viewRule: `${MGR} || ${SELF}`,
    createRule: MGR,
    updateRule: MGR,
    deleteRule: MGR,
    fields: [
      { name: 'employee', type: 'relation', required: true, collectionId: employees.id, maxSelect: 1, cascadeDelete: true },
      { name: 'period_start', type: 'date', required: true },
      { name: 'period_end', type: 'date', required: true },
      { name: 'regular_hours', type: 'number', min: 0, max: 10000 },
      { name: 'overtime_hours', type: 'number', min: 0, max: 10000 },
      { name: 'pto_hours', type: 'number', min: 0, max: 10000 },
      { name: 'total_hours', type: 'number', min: 0, max: 20000 },
      { name: 'status', type: 'select', values: ['open', 'submitted', 'approved', 'paid'], maxSelect: 1 },
      { name: 'approved_by', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'approved_at', type: 'date' },
      { name: 'notes', type: 'text', max: 2000 },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_timesheets_employee_period ON timesheets (employee, period_start)'],
  })
  app.save(timesheets)

  const timesheetEntries = new Collection({
    type: 'base',
    name: 'timesheet_entries',
    listRule: `${MGR} || employee.user = @request.auth.id`,
    viewRule: `${MGR} || employee.user = @request.auth.id`,
    createRule: MGR,
    updateRule: MGR,
    deleteRule: MGR,
    fields: [
      { name: 'timesheet', type: 'relation', required: true, collectionId: timesheets.id, maxSelect: 1, cascadeDelete: true },
      { name: 'employee', type: 'relation', required: true, collectionId: employees.id, maxSelect: 1, cascadeDelete: true },
      { name: 'date', type: 'date', required: true },
      { name: 'shift', type: 'relation', collectionId: shifts.id, maxSelect: 1, cascadeDelete: false },
      { name: 'regular_hours', type: 'number', min: 0, max: 24 },
      { name: 'overtime_hours', type: 'number', min: 0, max: 24 },
      { name: 'pto_hours', type: 'number', min: 0, max: 24 },
      { name: 'note', type: 'text', max: 500 },
    ],
    indexes: ['CREATE INDEX idx_ts_entries_timesheet ON timesheet_entries (timesheet, date)'],
  })
  app.save(timesheetEntries)

  const payRuns = new Collection({
    type: 'base',
    name: 'pay_runs',
    listRule: MGR,
    viewRule: MGR,
    createRule: MGR,
    updateRule: MGR,
    deleteRule: ADMIN,
    fields: [
      { name: 'company', type: 'relation', required: true, collectionId: companies.id, maxSelect: 1, cascadeDelete: true },
      { name: 'period_start', type: 'date', required: true },
      { name: 'period_end', type: 'date', required: true },
      { name: 'pay_date', type: 'date' },
      { name: 'status', type: 'select', values: ['draft', 'approved', 'paid'], maxSelect: 1 },
      { name: 'total_gross', type: 'number', min: 0 },
      { name: 'total_tax', type: 'number', min: 0 },
      { name: 'total_deductions', type: 'number', min: 0 },
      { name: 'total_net', type: 'number', min: 0 },
      { name: 'notes', type: 'text', max: 2000 },
      { name: 'created_by', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_payruns_company_period ON pay_runs (company, period_start)'],
  })
  app.save(payRuns)

  const payStubs = new Collection({
    type: 'base',
    name: 'pay_stubs',
    listRule: `${MGR} || employee.user = @request.auth.id`,
    viewRule: `${MGR} || employee.user = @request.auth.id`,
    createRule: MGR,
    updateRule: MGR,
    deleteRule: MGR,
    fields: [
      { name: 'pay_run', type: 'relation', required: true, collectionId: payRuns.id, maxSelect: 1, cascadeDelete: true },
      { name: 'employee', type: 'relation', required: true, collectionId: employees.id, maxSelect: 1, cascadeDelete: true },
      { name: 'regular_hours', type: 'number', min: 0 },
      { name: 'overtime_hours', type: 'number', min: 0 },
      { name: 'pto_hours', type: 'number', min: 0 },
      { name: 'regular_pay', type: 'number', min: 0 },
      { name: 'overtime_pay', type: 'number', min: 0 },
      { name: 'pto_pay', type: 'number', min: 0 },
      { name: 'gross_pay', type: 'number', min: 0 },
      { name: 'employee_taxes', type: 'number', min: 0 },
      { name: 'employee_deductions', type: 'number', min: 0 },
      { name: 'employer_taxes', type: 'number', min: 0 },
      { name: 'net_pay', type: 'number', min: 0 },
      { name: 'breakdown', type: 'json', maxSize: 200000 },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_paystubs_run_employee ON pay_stubs (pay_run, employee)'],
  })
  app.save(payStubs)

  const payRules = new Collection({
    type: 'base',
    name: 'pay_rules',
    listRule: MGR,
    viewRule: MGR,
    createRule: ADMIN,
    updateRule: ADMIN,
    deleteRule: ADMIN,
    fields: [
      { name: 'company', type: 'relation', required: true, collectionId: companies.id, maxSelect: 1, cascadeDelete: true },
      { name: 'name', type: 'text', required: true, max: 120 },
      { name: 'type', type: 'select', required: true, values: ['federal_tax', 'state_tax', 'social_security', 'medicare', 'health', 'retirement', 'garnishment', 'other'], maxSelect: 1 },
      { name: 'calc', type: 'select', required: true, values: ['percent', 'fixed_per_hour', 'fixed_per_period'], maxSelect: 1 },
      { name: 'rate', type: 'number', min: 0, max: 100000 },
      { name: 'applies_to', type: 'select', values: ['gross', 'regular', 'total_hours'], maxSelect: 1 },
      { name: 'employer', type: 'bool' },
      { name: 'active', type: 'bool' },
    ],
  })
  app.save(payRules)

  const holidays = new Collection({
    type: 'base',
    name: 'holidays',
    listRule: AUTH,
    viewRule: AUTH,
    createRule: MGR,
    updateRule: MGR,
    deleteRule: MGR,
    fields: [
      { name: 'company', type: 'relation', required: true, collectionId: companies.id, maxSelect: 1, cascadeDelete: true },
      { name: 'name', type: 'text', required: true, max: 120 },
      { name: 'date', type: 'date', required: true },
      { name: 'paid', type: 'bool' },
    ],
    indexes: ['CREATE INDEX idx_holidays_company_date ON holidays (company, date)'],
  })
  app.save(holidays)

  const documents = new Collection({
    type: 'base',
    name: 'documents',
    listRule: `${MGR} || ${SELF}`,
    viewRule: `${MGR} || ${SELF}`,
    createRule: MGR,
    updateRule: MGR,
    deleteRule: MGR,
    fields: [
      { name: 'employee', type: 'relation', required: true, collectionId: employees.id, maxSelect: 1, cascadeDelete: true },
      { name: 'name', type: 'text', required: true, max: 200 },
      { name: 'type', type: 'select', values: ['contract', 'id', 'w9', 'certification', 'other'], maxSelect: 1 },
      { name: 'file', type: 'file', maxSelect: 1, maxSize: 10485760, protected: true },
      { name: 'expires_at', type: 'date' },
      { name: 'notes', type: 'text', max: 2000 },
    ],
  })
  app.save(documents)

  const auditLog = new Collection({
    type: 'base',
    name: 'audit_log',
    listRule: '@request.auth.role = "admin"',
    viewRule: '@request.auth.role = "admin"',
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: 'actor', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'action', type: 'select', values: ['create', 'update', 'delete', 'clock', 'payroll', 'schedule'], maxSelect: 1 },
      { name: 'collection', type: 'text', max: 60 },
      { name: 'record_id', type: 'text', max: 40 },
      { name: 'summary', type: 'text', max: 500 },
      { name: 'before', type: 'json', maxSize: 50000 },
      { name: 'after', type: 'json', maxSize: 50000 },
      { name: 'at', type: 'date' },
    ],
    indexes: ['CREATE INDEX idx_audit_at ON audit_log (at)'],
  })
  app.save(auditLog)
}, (app) => {
  for (const name of ['audit_log', 'documents', 'holidays', 'pay_rules', 'pay_stubs', 'pay_runs', 'timesheet_entries', 'timesheets', 'punches', 'shifts', 'time_off_requests', 'availability', 'employees', 'positions', 'departments', 'locations', 'companies']) {
    try { app.delete(app.findCollectionByNameOrId(name)) } catch {}
  }
  try {
    const users = app.findCollectionByNameOrId('users')
    users.fields.removeByName('role')
    users.fields.removeByName('phone')
    app.save(users)
  } catch {}
})
