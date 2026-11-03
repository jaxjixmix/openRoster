// Shared helpers for OpenRoster hooks. Required inside each handler because
// PocketBase executes callbacks in isolated JSVMs.
const MANAGER_ROLES = ["admin", "manager"]
const MS_DAY = 86400000

function isManager(auth) {
  return !!auth && (auth.isSuperuser() || MANAGER_ROLES.indexOf(auth.getString("role")) !== -1)
}

function isAdmin(auth) {
  return !!auth && (auth.isSuperuser() || auth.getString("role") === "admin")
}

function bad(e, message, status) {
  return e.json(status || 400, { message: message })
}

function toMs(value) {
  if (!value) return NaN
  return new Date(String(value).replace(" ", "T")).getTime()
}

function isoDate(value) {
  return String(value).slice(0, 10)
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00Z")
  return new Date(d.getTime() + n * MS_DAY).toISOString().slice(0, 10)
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

function minutesOfDay(hhmm) {
  const parts = String(hhmm || "00:00").split(":")
  return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0)
}

function employeeForUser(app, userId) {
  try {
    return app.findFirstRecordByFilter("employees", "user = {:user}", { user: userId })
  } catch (err) {
    return null
  }
}

function companyOf(app, auth) {
  if (!auth) return null
  const employee = employeeForUser(app, auth.id)
  if (employee) return app.findRecordById("companies", employee.getString("company"))
  const companies = app.findRecordsByFilter("companies", "1 = 1", "-created", 1, 0)
  return companies.length ? companies[0] : null
}

function approvedTimeOff(app, employeeId, startDate, endDate) {
  return app.findRecordsByFilter(
    "time_off_requests",
    "employee = {:employee} && status = 'approved' && start_date <= {:end} && end_date >= {:start}",
    "start_date",
    200,
    0,
    { employee: employeeId, start: startDate + " 00:00:00.000Z", end: endDate + " 23:59:59.999Z" }
  )
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB
}

function weekKey(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z")
  const day = d.getUTCDay()
  const diff = (day + 6) % 7
  return new Date(d.getTime() - diff * MS_DAY).toISOString().slice(0, 10)
}

function workedMinutesByDay(app, employeeId, startDate, endDate) {
  const punches = app.findRecordsByFilter(
    "punches",
    "employee = {:employee} && punched_at >= {:start} && punched_at < {:end}",
    "punched_at",
    2000,
    0,
    {
      employee: employeeId,
      start: startDate + " 00:00:00.000Z",
      end: addDays(endDate, 1) + " 00:00:00.000Z",
    }
  )
  const byDay = {}
  let openAt = null
  punches.forEach((p) => {
    const ts = toMs(p.getString("punched_at"))
    if (p.getString("type") === "in") openAt = ts
    else if (openAt !== null) {
      const key = new Date(openAt).toISOString().slice(0, 10)
      byDay[key] = (byDay[key] || 0) + Math.max(0, ts - openAt) / 60000
      openAt = null
    }
  })
  return byDay
}

function buildStub(company, employee, hours, rules, periodDays) {
  const rate = employee.getFloat("pay_rate") || 0
  const hourly = employee.getString("pay_type") !== "salary"
  const multiplier = company.getFloat("overtime_multiplier") || 1.5
  const regularHours = hours.regular || 0
  const overtimeHours = hours.overtime || 0
  const ptoHours = hours.pto || 0
  const totalHours = round2(regularHours + overtimeHours + ptoHours)

  let regularPay, overtimePay, ptoPay
  if (hourly) {
    regularPay = round2(regularHours * rate)
    overtimePay = round2(overtimeHours * rate * multiplier)
    ptoPay = round2(ptoHours * rate)
  } else {
    // shortcut: salary prorated by calendar days; move to a pay calendar for exact period splits
    regularPay = round2((rate / 365) * (periodDays || 1))
    overtimePay = 0
    ptoPay = 0
  }
  const gross = round2(regularPay + overtimePay + ptoPay)

  let taxes = 0
  let deductions = 0
  let employerTaxes = 0
  const breakdown = []
  rules.forEach((rule) => {
    const calc = rule.getString("calc")
    const ruleRate = rule.getFloat("rate") || 0
    let amount = 0
    const appliesTo = rule.getString("applies_to") || "gross"
    if (calc === "percent") {
      const base = appliesTo === "regular" ? regularPay : appliesTo === "total_hours" ? totalHours : gross
      amount = base * (ruleRate / 100)
    } else if (calc === "fixed_per_hour") {
      amount = totalHours * ruleRate
    } else {
      amount = ruleRate
    }
    amount = round2(amount)
    if (!amount) return
    const isEmployer = rule.getBool("employer")
    const type = rule.getString("type")
    if (isEmployer) employerTaxes = round2(employerTaxes + amount)
    else if (type === "federal_tax" || type === "state_tax" || type === "social_security" || type === "medicare") taxes = round2(taxes + amount)
    else deductions = round2(deductions + amount)
    breakdown.push({
      name: rule.getString("name"),
      type: type,
      calc: calc,
      rate: ruleRate,
      amount: amount,
      employer: isEmployer,
    })
  })

  const net = round2(Math.max(0, gross - taxes - deductions))
  return {
    employee: employee.id,
    regular_hours: round2(regularHours),
    overtime_hours: round2(overtimeHours),
    pto_hours: round2(ptoHours),
    regular_pay: regularPay,
    overtime_pay: overtimePay,
    pto_pay: ptoPay,
    gross_pay: gross,
    employee_taxes: taxes,
    employee_deductions: deductions,
    employer_taxes: employerTaxes,
    net_pay: net,
    breakdown: breakdown,
  }
}

function payrollPayload(app, auth, body, commit) {
  const startDate = body.period_start
  const endDate = body.period_end
  if (!startDate || !endDate) return { error: "period_start and period_end are required." }
  const company = companyOf(app, auth)
  if (!company) return { error: "Company not configured." }

  const sheets = app.findRecordsByFilter(
    "timesheets",
    "employee.company = {:company} && period_start >= {:start} && period_end <= {:end}",
    "employee",
    1000,
    0,
    {
      company: company.id,
      start: startDate + " 00:00:00.000Z",
      end: endDate + " 23:59:59.999Z",
    }
  )
  const rules = app.findRecordsByFilter("pay_rules", "company = {:company} && active = true", "name", 200, 0, { company: company.id })

  const periodDays = Math.max(1, Math.round((new Date(endDate + "T00:00:00Z") - new Date(startDate + "T00:00:00Z")) / 86400000) + 1)

  const stubs = []
  let totalGross = 0
  let totalTax = 0
  let totalDeductions = 0
  let totalNet = 0

  const sheetByEmployee = {}
  sheets.forEach((sheet) => {
    if (sheet.getString("status") !== "approved") return
    sheetByEmployee[sheet.getString("employee")] = sheet
  })

  const employees = app.findRecordsByFilter(
    "employees",
    "company = {:company} && status = 'active'",
    "first_name",
    500,
    0,
    { company: company.id }
  )
  employees.forEach((employee) => {
    const sheet = sheetByEmployee[employee.id]
    const salaried = employee.getString("pay_type") === "salary"
    if (!sheet && !salaried) return
    const stub = buildStub(company, employee, {
      regular: sheet ? sheet.getFloat("regular_hours") : 0,
      overtime: sheet ? sheet.getFloat("overtime_hours") : 0,
      pto: sheet ? sheet.getFloat("pto_hours") : 0,
    }, rules, periodDays)
    stubs.push(stub)
    totalGross = round2(totalGross + stub.gross_pay)
    totalTax = round2(totalTax + stub.employee_taxes)
    totalDeductions = round2(totalDeductions + stub.employee_deductions)
    totalNet = round2(totalNet + stub.net_pay)
  })

  let run = null
  if (commit) {
    try {
      run = app.findFirstRecordByFilter(
        "pay_runs",
        "company = {:company} && period_start = {:start}",
        { company: company.id, start: startDate + " 00:00:00.000Z" }
      )
      if (run.getString("status") !== "draft") return { error: "This period is already " + run.getString("status") + "." }
    } catch (err) {
      run = new Record(app.findCollectionByNameOrId("pay_runs"))
      run.set("company", company.id)
      run.set("period_start", startDate + " 00:00:00.000Z")
      run.set("period_end", endDate + " 00:00:00.000Z")
      run.set("status", "draft")
    }
    if (body.pay_date) run.set("pay_date", body.pay_date + " 00:00:00.000Z")
    if (body.notes) run.set("notes", body.notes)
    run.set("total_gross", totalGross)
    run.set("total_tax", totalTax)
    run.set("total_deductions", totalDeductions)
    run.set("total_net", totalNet)
    run.set("created_by", auth.id)
    app.save(run)

    const oldStubs = app.findRecordsByFilter("pay_stubs", "pay_run = {:run}", "", 1000, 0, { run: run.id })
    oldStubs.forEach((stub) => app.delete(stub))

    stubs.forEach((data) => {
      const stub = new Record(app.findCollectionByNameOrId("pay_stubs"))
      stub.set("pay_run", run.id)
      Object.keys(data).forEach((key) => stub.set(key, data[key]))
      app.save(stub)
    })
  }

  return {
    run: run,
    stubs: stubs,
    totals: {
      employees: stubs.length,
      gross: totalGross,
      taxes: totalTax,
      deductions: totalDeductions,
      net: totalNet,
    },
  }
}

function audit(app, auth, collection, recordId, action, summary) {
  if (!auth) return
  try {
    if (collection === "audit_log") return
    if (auth.collection().name !== "users") return
    const log = new Record(app.findCollectionByNameOrId("audit_log"))
    log.set("actor", auth.id)
    log.set("action", action)
    log.set("collection", collection)
    log.set("record_id", recordId || "")
    log.set("summary", summary || (action + " " + collection))
    log.set("at", new Date().toISOString())
    app.save(log)
  } catch (err) {
    console.log("audit failed: " + err)
  }
}

module.exports = {
  isManager: isManager,
  isAdmin: isAdmin,
  bad: bad,
  toMs: toMs,
  isoDate: isoDate,
  addDays: addDays,
  round2: round2,
  minutesOfDay: minutesOfDay,
  employeeForUser: employeeForUser,
  companyOf: companyOf,
  approvedTimeOff: approvedTimeOff,
  overlaps: overlaps,
  weekKey: weekKey,
  workedMinutesByDay: workedMinutesByDay,
  buildStub: buildStub,
  payrollPayload: payrollPayload,
  audit: audit,
}
