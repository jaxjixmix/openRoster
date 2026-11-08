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

function kioskTokenFromRequest(e) {
  const info = e.requestInfo()
  const headers = (info && info.headers) || {}
  return String(headers["x_kiosk_token"] || headers["x-kiosk-token"] || headers["X-Kiosk-Token"] || "")
}

function kioskDeviceForToken(app, token) {
  if (!token) return null
  try {
    return app.findFirstRecordByFilter(
      "kiosk_devices",
      "token_hash = {:hash} && active = true",
      { hash: $security.sha256(String(token)) }
    )
  } catch (err) {
    return null
  }
}

function kioskDeviceView(device, location) {
  return {
    id: device.id,
    name: device.getString("name"),
    location: device.getString("location"),
    location_name: location ? location.getString("name") : "",
    active: device.getBool("active"),
    last_seen: device.getString("last_seen"),
  }
}

function kioskContext(e) {
  const token = kioskTokenFromRequest(e)
  const device = kioskDeviceForToken(e.app, token)
  if (!device) return { error: bad(e, "Kiosk is not paired. Ask a manager for a new code.", 401) }
  let company = null
  let location = null
  try { company = e.app.findRecordById("companies", device.getString("company")) } catch (err) {}
  try { location = e.app.findRecordById("locations", device.getString("location")) } catch (err) {}
  if (!company || !location) return { error: bad(e, "Kiosk configuration is incomplete.", 409) }
  device.set("last_seen", new Date().toISOString())
  e.app.save(device)
  return { device: device, company: company, location: location }
}

function kioskPinMatches(employee, pin) {
  const hash = employee.getString("kiosk_pin_hash")
  if (!hash) return false
  return hash === $security.sha256(String(pin || ""))
}

function shiftDate(record) {
  const local = record.getString("local_date")
  return local ? String(local).slice(0, 10) : String(record.getString("starts_at")).slice(0, 10)
}

function weekStartDate(dateStr, weekStartsOn) {
  const d = new Date(dateStr + "T00:00:00Z")
  const day = d.getUTCDay()
  const diff = (day - (weekStartsOn || 0) + 7) % 7
  return new Date(d.getTime() - diff * MS_DAY).toISOString().slice(0, 10)
}

function weekKey(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z")
  const day = d.getUTCDay()
  const diff = (day + 6) % 7
  return new Date(d.getTime() - diff * MS_DAY).toISOString().slice(0, 10)
}

function computeTimesheetHours(byDayMinutes, dailyLimit, weeklyLimit) {
  const daily = {}
  Object.keys(byDayMinutes).sort().forEach((day) => {
    const hours = round2(byDayMinutes[day] / 60)
    const overtime = dailyLimit > 0 ? round2(Math.max(0, hours - dailyLimit)) : 0
    daily[day] = { regular: round2(hours - overtime), overtime: overtime }
  })

  const weekTotals = {}
  Object.keys(daily).forEach((day) => {
    const week = weekKey(day)
    weekTotals[week] = round2((weekTotals[week] || 0) + daily[day].regular)
  })
  Object.keys(daily).forEach((day) => {
    const week = weekKey(day)
    if (weekTotals[week] > weeklyLimit) {
      const excess = round2(weekTotals[week] - weeklyLimit)
      const take = Math.min(excess, daily[day].regular)
      daily[day].regular = round2(daily[day].regular - take)
      daily[day].overtime = round2(daily[day].overtime + take)
      weekTotals[week] = round2(weekTotals[week] - take)
    }
  })

  let regular = 0
  let overtime = 0
  Object.keys(daily).forEach((day) => {
    regular += daily[day].regular
    overtime += daily[day].overtime
  })
  return { daily: daily, regular: round2(regular), overtime: round2(overtime) }
}

function roundMinutes(minutes, step) {
  const rounding = Number(step) || 0
  if (rounding <= 0) return minutes
  return Math.round(minutes / rounding) * rounding
}

function workedMinutesByDay(app, employeeId, startDate, endDate, roundingMinutes) {
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
  let breakAt = null
  let breakMinutes = 0
  punches.forEach((p) => {
    const ts = toMs(p.getString("punched_at"))
    const type = p.getString("type")
    if (type === "in") {
      openAt = ts
      breakAt = null
      breakMinutes = 0
    } else if (type === "break_start") {
      breakAt = ts
    } else if (type === "break_end") {
      if (breakAt !== null) {
        breakMinutes += Math.max(0, (ts - breakAt) / 60000)
        breakAt = null
      }
    } else if (type === "out" && openAt !== null) {
      const key = new Date(openAt).toISOString().slice(0, 10)
      const worked = Math.max(0, (ts - openAt) / 60000 - breakMinutes)
      byDay[key] = (byDay[key] || 0) + worked
      openAt = null
      breakAt = null
      breakMinutes = 0
    }
  })
  Object.keys(byDay).forEach((day) => {
    byDay[day] = roundMinutes(byDay[day], roundingMinutes)
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

function certificationError(app, employeeId, positionId) {
  if (!positionId) return null
  let position = null
  try { position = app.findRecordById("positions", positionId) } catch (err) { return null }
  let required = []
  try {
    const value = position.get("required_certifications")
    required = Array.isArray(value) ? value : []
  } catch (err) {}
  if (!required.length) return null
  const today = new Date().toISOString().slice(0, 10)

  for (const certificationId of required) {
    const rows = app.findRecordsByFilter(
      "employee_certifications",
      "employee = {:employee} && certification = {:certification}",
      "-expires_at",
      10,
      0,
      { employee: employeeId, certification: certificationId }
    )
    const valid = rows.some((row) => {
      const expires = row.getString("expires_at")
      return !expires || expires.slice(0, 10) >= today
    })
    if (!valid) {
      let name = "certification"
      try { name = app.findRecordById("certifications", certificationId).getString("name") } catch (err) {}
      return "Missing or expired certification: " + name + "."
    }
  }
  return null
}

function shiftAssignmentError(app, record, employeeId, ignoreId) {
  const employee = app.findRecordById("employees", employeeId)
  const company = app.findRecordById("companies", employee.getString("company"))
  const date = shiftDate(record)
  const certError = certificationError(app, employeeId, record.getString("position"))
  if (certError) return certError

  const leave = approvedTimeOff(app, employeeId, date, date)
  if (leave.length > 0) return "This employee has approved time off on that day."

  const localStart = record.getString("local_start")
  const localEnd = record.getString("local_end")
  if (localStart && localEnd) {
    const weekday = String(new Date(date + "T00:00:00Z").getUTCDay())
    const allWindows = app.findRecordsByFilter(
      "availability",
      "employee = {:employee}",
      "weekday",
      200,
      0,
      { employee: employeeId }
    )
    if (allWindows.length > 0) {
      const dayWindows = allWindows.filter((window) => String(window.getString("weekday")) === weekday)
      const covered = dayWindows.some((window) => {
        return minutesOfDay(window.getString("start_time")) <= minutesOfDay(localStart) &&
          minutesOfDay(window.getString("end_time")) >= minutesOfDay(localEnd)
      })
      if (!covered) return "The employee is not available for this shift window."
    }
  }

  const weekStartsOn = parseInt(company.getString("week_start") || "1", 10)
  const start = weekStartDate(date, weekStartsOn)
  const end = addDays(start, 6)
  const rows = app.findRecordsByFilter(
    "shifts",
    "employee = {:employee} && id != {:id} && local_date >= {:start} && local_date <= {:end}",
    "starts_at",
    500,
    0,
    { employee: employeeId, id: ignoreId || "", start: start + " 00:00:00.000Z", end: end + " 00:00:00.000Z" }
  )
  let scheduled = 0
  rows.forEach((row) => {
    scheduled += Math.max(0, (toMs(row.getString("ends_at")) - toMs(row.getString("starts_at"))) / 3600000 - (row.getFloat("break_minutes") || 0) / 60)
  })
  const shiftHours = Math.max(0, (toMs(record.getString("ends_at")) - toMs(record.getString("starts_at"))) / 3600000 - (record.getFloat("break_minutes") || 0) / 60)
  const maxHours = employee.getFloat("max_weekly_hours") || 40
  if (scheduled + shiftHours > maxHours) return "This shift would exceed the employee's weekly hour cap (" + maxHours + "h)."

  return null
}

function lastDayOfMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

function generatePayPeriods(frequency, from, to, weekStartsOn, payOffset) {
  const periods = []
  const offset = payOffset === undefined ? 5 : payOffset
  const addPeriod = (start, end) => {
    if (end < from || start > to) return
    periods.push({ start: start, end: end, pay_date: addDays(end, offset) })
  }

  if (frequency === "monthly" || frequency === "semimonthly") {
    let cursor = new Date(from + "T00:00:00Z")
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1))
    const limit = new Date(to + "T00:00:00Z")
    while (cursor <= limit) {
      const year = cursor.getUTCFullYear()
      const month = cursor.getUTCMonth()
      const first = year + "-" + String(month + 1).padStart(2, "0") + "-01"
      const last = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(lastDayOfMonth(year, month)).padStart(2, "0")
      if (frequency === "monthly") {
        addPeriod(first, last)
      } else {
        addPeriod(first, year + "-" + String(month + 1).padStart(2, "0") + "-15")
        addPeriod(year + "-" + String(month + 1).padStart(2, "0") + "-16", last)
      }
      cursor = new Date(Date.UTC(year, month + 1, 1))
    }
    return periods
  }

  const step = frequency === "weekly" ? 7 : 14
  let start = weekStartDate(from, weekStartsOn)
  while (start <= to) {
    const end = addDays(start, step - 1)
    if (end >= from) addPeriod(start, end)
    start = addDays(start, step)
  }
  return periods
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
    let existing = null
    try {
      existing = app.findFirstRecordByFilter(
        "pay_runs",
        "company = {:company} && period_start = {:start} && status != 'voided'",
        { company: company.id, start: startDate + " 00:00:00.000Z" }
      )
      if (existing.getString("status") !== "draft") {
        return { error: "This period is already " + existing.getString("status") + "." }
      }
    } catch (err) {
      existing = null
    }

    app.runInTransaction((txApp) => {
      let runRecord
      if (existing) {
        runRecord = txApp.findRecordById("pay_runs", existing.id)
      } else {
        runRecord = new Record(txApp.findCollectionByNameOrId("pay_runs"))
        runRecord.set("company", company.id)
        runRecord.set("period_start", startDate + " 00:00:00.000Z")
        runRecord.set("period_end", endDate + " 00:00:00.000Z")
        runRecord.set("status", "draft")
      }
      if (body.pay_date) runRecord.set("pay_date", body.pay_date + " 00:00:00.000Z")
      if (body.notes) runRecord.set("notes", body.notes)
      runRecord.set("total_gross", totalGross)
      runRecord.set("total_tax", totalTax)
      runRecord.set("total_deductions", totalDeductions)
      runRecord.set("total_net", totalNet)
      runRecord.set("created_by", auth.id)
      txApp.save(runRecord)

      const oldStubs = txApp.findRecordsByFilter("pay_stubs", "pay_run = {:run}", "", 1000, 0, { run: runRecord.id })
      oldStubs.forEach((stub) => txApp.delete(stub))

      stubs.forEach((data) => {
        const stub = new Record(txApp.findCollectionByNameOrId("pay_stubs"))
        stub.set("pay_run", runRecord.id)
        Object.keys(data).forEach((key) => stub.set(key, data[key]))
        txApp.save(stub)
      })

      const perPeriod = company.getFloat("pto_accrual_hours_per_period") || 0
      const perHour = company.getFloat("pto_accrual_hours_per_hour") || 0
      if (perPeriod || perHour) {
        stubs.forEach((data) => {
          const employee = txApp.findRecordById("employees", data.employee)
          const hours = (data.regular_hours || 0) + (data.overtime_hours || 0)
          accruePto(txApp, employee, perPeriod + perHour * hours, startDate, endDate, auth.id)
        })
      }
      run = runRecord
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

function syncPtoBalance(app, employeeId) {
  const entries = app.findRecordsByFilter("pto_entries", "employee = {:employee}", "", 10000, 0, { employee: employeeId })
  const balance = round2(entries.reduce((sum, entry) => sum + (entry.getFloat("hours") || 0), 0))
  const employee = app.findRecordById("employees", employeeId)
  employee.set("pto_balance_hours", balance)
  app.save(employee)
  return balance
}

function applyPtoUsage(app, request) {
  if (!request || request.getString("status") !== "approved") return
  const employeeId = request.getString("employee")
  if (!employeeId) return
  let employee
  try { employee = app.findRecordById("employees", employeeId) } catch (err) { return }

  let entry = null
  try {
    entry = app.findFirstRecordByFilter("pto_entries", "time_off_request = {:request}", { request: request.id })
  } catch (err) {}
  if (!entry) {
    entry = new Record(app.findCollectionByNameOrId("pto_entries"))
    entry.set("company", employee.getString("company"))
    entry.set("employee", employeeId)
    entry.set("time_off_request", request.id)
    entry.set("type", "usage")
  }
  entry.set("date", request.getString("start_date"))
  entry.set("hours", -Math.abs(request.getFloat("hours") || 0))
  entry.set("note", "Approved " + request.getString("type") + " request")
  entry.set("created_by", request.getString("approved_by") || "")
  app.save(entry)
  syncPtoBalance(app, employeeId)
}

function removePtoUsage(app, requestId, employeeId) {
  const entries = app.findRecordsByFilter("pto_entries", "time_off_request = {:request}", "", 100, 0, { request: requestId })
  entries.forEach((entry) => app.delete(entry))
  if (employeeId) syncPtoBalance(app, employeeId)
}

function accruePto(app, employee, amount, periodStart, periodEnd, createdBy) {
  const hours = round2(amount || 0)
  if (hours <= 0) return
  try {
    app.findFirstRecordByFilter(
      "pto_entries",
      "employee = {:employee} && period_start = {:start} && type = 'accrual'",
      { employee: employee.id, start: periodStart + " 00:00:00.000Z" }
    )
    return
  } catch (err) {}
  const entry = new Record(app.findCollectionByNameOrId("pto_entries"))
  entry.set("company", employee.getString("company"))
  entry.set("employee", employee.id)
  entry.set("date", periodEnd + " 00:00:00.000Z")
  entry.set("type", "accrual")
  entry.set("hours", hours)
  entry.set("period_start", periodStart + " 00:00:00.000Z")
  entry.set("note", "Payroll accrual")
  if (createdBy) entry.set("created_by", createdBy)
  app.save(entry)
  syncPtoBalance(app, employee.id)
}

function employeeSummary(app, employeeId) {
  if (!employeeId) return null
  try {
    const employee = app.findRecordById("employees", employeeId)
    return {
      id: employee.id,
      name: (employee.getString("first_name") + " " + employee.getString("last_name")).trim(),
    }
  } catch (err) {
    return null
  }
}

function swapView(app, swap) {
  let shift = null
  try { shift = app.findRecordById("shifts", swap.getString("shift")) } catch (err) { return null }
  let position = ""
  let location = ""
  try { position = app.findRecordById("positions", shift.getString("position")).getString("name") } catch (err) {}
  try { location = app.findRecordById("locations", shift.getString("location")).getString("name") } catch (err) {}
  return {
    id: swap.id,
    status: swap.getString("status"),
    note: swap.getString("note"),
    created: swap.getString("created"),
    shift: {
      id: shift.id,
      starts_at: shift.getString("starts_at"),
      ends_at: shift.getString("ends_at"),
      local_date: shift.getString("local_date"),
      local_start: shift.getString("local_start"),
      local_end: shift.getString("local_end"),
      position: position,
      location: location,
    },
    offered_by: employeeSummary(app, swap.getString("offered_by")),
    accepted_by: employeeSummary(app, swap.getString("accepted_by")),
  }
}

function runExpiryReminders(app) {
  const companies = app.findRecordsByFilter("companies", "1 = 1", "-created", 1, 0)
  const company = companies.length ? companies[0] : null
  const days = company ? (company.getFloat("expiry_reminder_days") || 30) : 30
  const today = new Date().toISOString().slice(0, 10)
  const threshold = addDays(today, days)
  let certifications = 0
  let documents = 0

  const certs = app.findRecordsByFilter(
    "employee_certifications",
    "expires_at >= {:today} && expires_at <= {:threshold}",
    "expires_at",
    1000,
    0,
    { today: today + " 00:00:00.000Z", threshold: threshold + " 23:59:59.999Z" }
  )
  certs.forEach((row) => {
    let employee = null
    try { employee = app.findRecordById("employees", row.getString("employee")) } catch (err) { return }
    let name = "Certification"
    try { name = app.findRecordById("certifications", row.getString("certification")).getString("name") } catch (err) {}
    const employeeName = (employee.getString("first_name") + " " + employee.getString("last_name")).trim()
    const title = "Certification expiring: " + name + " — " + employeeName
    const body = name + " expires " + row.getString("expires_at").slice(0, 10) + " for " + employeeName + "."
    notifyOnce(app, employee.getString("user"), "system", title, body, "/people/" + employee.id)
    notifyManagersOnce(app, "system", title, body, "/people/" + employee.id)
    certifications++
  })

  const docs = app.findRecordsByFilter(
    "documents",
    "expires_at >= {:today} && expires_at <= {:threshold}",
    "expires_at",
    1000,
    0,
    { today: today + " 00:00:00.000Z", threshold: threshold + " 23:59:59.999Z" }
  )
  docs.forEach((row) => {
    let employee = null
    try { employee = app.findRecordById("employees", row.getString("employee")) } catch (err) { return }
    const employeeName = (employee.getString("first_name") + " " + employee.getString("last_name")).trim()
    const title = "Document expiring: " + row.getString("name") + " — " + employeeName
    const body = row.getString("name") + " expires " + row.getString("expires_at").slice(0, 10) + " for " + employeeName + "."
    notifyOnce(app, employee.getString("user"), "system", title, body, "/people/" + employee.id)
    notifyManagersOnce(app, "system", title, body, "/people/" + employee.id)
    documents++
  })

  return { certifications: certifications, documents: documents, days: days }
}

function notificationPrefs(user) {
  let prefs = {}
  try { prefs = user.get("notification_prefs") || {} } catch (err) {}
  if (typeof prefs === "string") {
    try { prefs = JSON.parse(prefs) } catch (err) { prefs = {} }
  }
  return {
    in_app: prefs.in_app !== false,
    email: prefs.email === true,
  }
}

function notify(app, userId, type, title, body, link) {
  if (!userId) return
  let user = null
  try { user = app.findRecordById("users", userId) } catch (err) { return }
  const prefs = notificationPrefs(user)

  if (prefs.in_app) {
    try {
      const record = new Record(app.findCollectionByNameOrId("notifications"))
      record.set("user", userId)
      record.set("type", type)
      record.set("title", title)
      record.set("body", body || "")
      record.set("link", link || "")
      record.set("read", false)
      app.save(record)
    } catch (err) {
      console.log("notification create failed: " + err)
    }
  }

  if (prefs.email && user.getString("email")) {
    try {
      const settings = app.settings()
      const message = new MailerMessage({
        from: {
          address: settings.meta.senderAddress || "no-reply@openroster.local",
          name: settings.meta.senderName || "OpenRoster",
        },
        to: [{ address: user.getString("email") }],
        subject: title,
        html: "<p>" + String(body || "").replace(/</g, "&lt;") + "</p>" +
          (link ? "<p><a href=\"" + link + "\">Open OpenRoster</a></p>" : ""),
      })
      app.newMailClient().send(message)
    } catch (err) {
      console.log("notification email failed: " + err)
    }
  }
}

function notifyEmployee(app, employeeId, type, title, body, link) {
  if (!employeeId) return
  try {
    const employee = app.findRecordById("employees", employeeId)
    if (employee.getString("user")) notify(app, employee.getString("user"), type, title, body, link)
  } catch (err) {}
}

function notifyOnce(app, userId, type, title, body, link) {
  if (!userId) return
  const today = new Date().toISOString().slice(0, 10) + " 00:00:00.000Z"
  try {
    const existing = app.findRecordsByFilter(
      "notifications",
      "user = {:user} && title = {:title} && created >= {:today}",
      "",
      1,
      0,
      { user: userId, title: title, today: today }
    )
    if (existing.length) return
  } catch (err) {}
  notify(app, userId, type, title, body, link)
}

function notifyManagersOnce(app, type, title, body, link) {
  const users = app.findRecordsByFilter("users", "role = 'admin' || role = 'manager'", "name", 100, 0)
  users.forEach((user) => notifyOnce(app, user.id, type, title, body, link))
}

function notifyManagers(app, type, title, body, link) {
  const users = app.findRecordsByFilter("users", "role = 'admin' || role = 'manager'", "name", 100, 0)
  users.forEach((user) => notify(app, user.id, type, title, body, link))
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const earth = 6371000
  const toRad = (value) => (value * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return Math.round(earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function snapshot(record, keys) {
  if (!record) return null
  const out = {}
  keys.forEach((key) => { out[key] = record.get(key) })
  return out
}

function sameFields(a, b, keys) {
  if (!a || !b) return false
  return keys.every((key) => JSON.stringify(a.get(key)) === JSON.stringify(b.get(key)))
}

function audit(app, auth, collection, recordId, action, summary, before, after) {
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
    if (before) log.set("before", before)
    if (after) log.set("after", after)
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
  shiftDate: shiftDate,
  kioskTokenFromRequest: kioskTokenFromRequest,
  kioskDeviceForToken: kioskDeviceForToken,
  kioskPinMatches: kioskPinMatches,
  kioskDeviceView: kioskDeviceView,
  kioskContext: kioskContext,
  certificationError: certificationError,
  shiftAssignmentError: shiftAssignmentError,
  weekStartDate: weekStartDate,
  weekKey: weekKey,
  computeTimesheetHours: computeTimesheetHours,
  workedMinutesByDay: workedMinutesByDay,
  roundMinutes: roundMinutes,
  buildStub: buildStub,
  syncPtoBalance: syncPtoBalance,
  applyPtoUsage: applyPtoUsage,
  removePtoUsage: removePtoUsage,
  accruePto: accruePto,
  notify: notify,
  employeeSummary: employeeSummary,
  swapView: swapView,
  notifyEmployee: notifyEmployee,
  notifyOnce: notifyOnce,
  notifyManagersOnce: notifyManagersOnce,
  runExpiryReminders: runExpiryReminders,
  notifyManagers: notifyManagers,
  notificationPrefs: notificationPrefs,
  distanceMeters: distanceMeters,
  snapshot: snapshot,
  sameFields: sameFields,
  generatePayPeriods: generatePayPeriods,
  payrollPayload: payrollPayload,
  audit: audit,
}
