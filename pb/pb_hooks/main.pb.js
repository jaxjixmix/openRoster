/// <reference path="../pb_data/types.d.ts" />
// OpenRoster backend routes + validation. Helpers live in lib.js because each
// handler runs in its own JSVM instance.

// ------------------------------------------------------------------ clock in / out
routerAdd("POST", "/api/openroster/clock", (e) => {
  const h = require(`${__hooks}/lib.js`)
  if (!e.auth) return h.bad(e, "Sign in first.", 401)
  const body = e.requestInfo().body || {}
  let employee = null
  if (body.employee && h.isManager(e.auth)) {
    try { employee = e.app.findRecordById("employees", body.employee) } catch (err) {}
  }
  if (!employee) employee = h.employeeForUser(e.app, e.auth.id)
  if (!employee) return h.bad(e, "No employee profile is linked to this account.", 404)

  const type = body.type === "out" ? "out" : "in"
  const punches = e.app.findRecordsByFilter(
    "punches",
    "employee = {:employee}",
    "-punched_at",
    1,
    0,
    { employee: employee.id }
  )
  const last = punches.length ? punches[0] : null
  if (type === "in" && last && last.getString("type") === "in") {
    return h.bad(e, "Already clocked in at " + last.getString("punched_at") + ".", 409)
  }
  if (type === "out" && (!last || last.getString("type") === "out")) {
    return h.bad(e, "No open clock-in to close.", 409)
  }

  const punch = new Record(e.app.findCollectionByNameOrId("punches"))
  punch.set("employee", employee.id)
  if (body.location) punch.set("location", body.location)
  else if (employee.getString("location")) punch.set("location", employee.getString("location"))
  punch.set("type", type)
  punch.set("punched_at", new Date().toISOString())
  punch.set("source", body.source || "web")
  if (body.lat) punch.set("lat", body.lat)
  if (body.lng) punch.set("lng", body.lng)
  punch.set("created_by", e.auth.id)
  e.app.save(punch)

  const todayStart = new Date().toISOString().slice(0, 10) + " 00:00:00.000Z"
  const todays = e.app.findRecordsByFilter(
    "punches",
    "employee = {:employee} && punched_at >= {:start}",
    "punched_at",
    100,
    0,
    { employee: employee.id, start: todayStart }
  )
  let worked = 0
  let openAt = null
  todays.forEach((p) => {
    if (p.getString("type") === "in") openAt = h.toMs(p.getString("punched_at"))
    else if (openAt !== null) {
      worked += h.toMs(p.getString("punched_at")) - openAt
      openAt = null
    }
  })
  if (openAt !== null) worked += Date.now() - openAt

  return e.json(200, {
    punch: punch,
    clocked_in: type === "in",
    worked_minutes: Math.max(0, Math.round(worked / 60000)),
  })
}, $apis.requireAuth())

// ------------------------------------------------------------------ auto scheduler
routerAdd("POST", "/api/openroster/schedule/auto", (e) => {
  const h = require(`${__hooks}/lib.js`)
  if (!h.isManager(e.auth)) return h.bad(e, "Manager access required.", 403)
  const body = e.requestInfo().body || {}
  const weekStart = body.week_start
  if (!weekStart) return h.bad(e, "week_start is required (YYYY-MM-DD).")
  const company = h.companyOf(e.app, e.auth)
  if (!company) return h.bad(e, "Company not configured.", 404)

  const offsets = Array.isArray(body.offsets) ? body.offsets : []
  const offsetFor = (dayIndex) => Number(offsets[dayIndex] || 0)
  const weekEnd = h.addDays(weekStart, 7)
  const weekStartMs = new Date(weekStart + "T00:00:00Z").getTime()

  let filter = "company = {:company} && starts_at >= {:start} && starts_at < {:end} && employee = ''"
  let params = {
    company: company.id,
    start: weekStart + " 00:00:00.000Z",
    end: weekEnd + " 00:00:00.000Z",
  }
  if (body.location) {
    filter += " && location = {:location}"
    params.location = body.location
  }
  const shifts = e.app.findRecordsByFilter("shifts", filter, "starts_at", 500, 0, params)

  let empFilter = "company = {:company} && status = 'active'"
  let empParams = { company: company.id }
  if (body.location) {
    empFilter += " && (location = {:location} || location = '')"
    empParams.location = body.location
  }
  const employees = e.app.findRecordsByFilter("employees", empFilter, "first_name", 300, 0, empParams)
  const availability = e.app.findRecordsByFilter(
    "availability",
    "employee.company = {:company}",
    "weekday",
    1000,
    0,
    { company: company.id }
  )
  const availabilityByEmployee = {}
  availability.forEach((a) => {
    const key = a.getString("employee")
    if (!availabilityByEmployee[key]) availabilityByEmployee[key] = []
    availabilityByEmployee[key].push(a)
  })

  const assigned = e.app.findRecordsByFilter(
    "shifts",
    "company = {:company} && starts_at >= {:start} && starts_at < {:end} && employee != ''",
    "starts_at",
    1000,
    0,
    {
      company: company.id,
      start: weekStart + " 00:00:00.000Z",
      end: weekEnd + " 00:00:00.000Z",
    }
  )

  const hoursByEmployee = {}
  const shiftsByEmployee = {}
  assigned.forEach((s) => {
    const id = s.getString("employee")
    const hours = (h.toMs(s.getString("ends_at")) - h.toMs(s.getString("starts_at"))) / 3600000
    hoursByEmployee[id] = (hoursByEmployee[id] || 0) + hours
    if (!shiftsByEmployee[id]) shiftsByEmployee[id] = []
    shiftsByEmployee[id].push(s)
  })

  const timeOffCache = {}
  const timeOffFor = (employeeId) => {
    if (!timeOffCache[employeeId]) {
      timeOffCache[employeeId] = h.approvedTimeOff(e.app, employeeId, weekStart, h.addDays(weekEnd, -1))
    }
    return timeOffCache[employeeId]
  }

  const unfilled = []
  let totalAssigned = 0

  shifts.forEach((shift) => {
    const startMs = h.toMs(shift.getString("starts_at"))
    const endMs = h.toMs(shift.getString("ends_at"))
    const hours = Math.max(0, (endMs - startMs) / 3600000 - (shift.getFloat("break_minutes") || 0) / 60)
    if (hours <= 0) return

    const dayIndex = Math.floor((startMs - weekStartMs) / 86400000)
    const localStartMs = startMs + offsetFor(dayIndex) * 60000
    const localEndMs = endMs + offsetFor(dayIndex) * 60000
    const weekday = new Date(localStartMs).getUTCDay()
    const localStart = (((localStartMs % 86400000) + 86400000) % 86400000) / 60000
    const localEnd = (((localEndMs % 86400000) + 86400000) % 86400000) / 60000
    const shiftDate = new Date(localStartMs).toISOString().slice(0, 10)

    let best = null
    let bestScore = -Infinity
    let reason = "No eligible employee"

    employees.forEach((emp) => {
      if (emp.getString("pay_type") === "salary") return
      if (shift.getString("location") && emp.getString("location") && emp.getString("location") !== shift.getString("location")) return

      const off = timeOffFor(emp.id).some((r) => {
        return shiftDate >= h.isoDate(r.getString("start_date")) && shiftDate <= h.isoDate(r.getString("end_date"))
      })
      if (off) { reason = "Eligible staff are on approved leave"; return }

      const empShifts = shiftsByEmployee[emp.id] || []
      const clash = empShifts.some((s) => h.overlaps(startMs, endMs, h.toMs(s.getString("starts_at")), h.toMs(s.getString("ends_at"))))
      if (clash) return

      const maxHours = emp.getFloat("max_weekly_hours") || 40
      if ((hoursByEmployee[emp.id] || 0) + hours > maxHours) {
        reason = "Weekly hour caps reached"
        return
      }

      const windows = availabilityByEmployee[emp.id] || []
      const dayWindows = windows.filter((w) => parseInt(w.getString("weekday"), 10) === weekday)
      if (windows.length) {
        const covered = dayWindows.some((w) => {
          return h.minutesOfDay(w.getString("start_time")) <= localStart && h.minutesOfDay(w.getString("end_time")) >= localEnd
        })
        if (!covered) { reason = "No one is available for this window"; return }
      }

      let score = 0
      const empPosition = emp.getString("position")
      if (shift.getString("position") && empPosition === shift.getString("position")) score += 100
      if (shift.getString("department") && emp.getString("department") === shift.getString("department")) score += 30
      if (shift.getString("location") && emp.getString("location") === shift.getString("location")) score += 20
      score -= (hoursByEmployee[emp.id] || 0) * 2
      if ((hoursByEmployee[emp.id] || 0) + hours > 35) score -= 25
      const sameDay = empShifts.some((s) => h.isoDate(s.getString("starts_at")) === h.isoDate(shift.getString("starts_at")))
      if (sameDay) score += 5

      if (score > bestScore) {
        bestScore = score
        best = emp
      }
    })

    if (!best) {
      unfilled.push({ id: shift.id, starts_at: shift.getString("starts_at"), reason: reason })
      return
    }

    shift.set("employee", best.id)
    shift.set("source", "auto")
    e.app.save(shift)
    shiftsByEmployee[best.id] = (shiftsByEmployee[best.id] || []).concat([shift])
    hoursByEmployee[best.id] = (hoursByEmployee[best.id] || 0) + hours
    totalAssigned++
  })

  return e.json(200, {
    assigned: totalAssigned,
    unfilled: unfilled,
    checked: shifts.length,
  })
}, $apis.requireAuth())

// ------------------------------------------------------------------ timesheet rollup
routerAdd("POST", "/api/openroster/timesheets/generate", (e) => {
  const h = require(`${__hooks}/lib.js`)
  if (!h.isManager(e.auth)) return h.bad(e, "Manager access required.", 403)
  const body = e.requestInfo().body || {}
  const startDate = body.period_start
  const endDate = body.period_end
  if (!startDate || !endDate) return h.bad(e, "period_start and period_end are required.")
  const company = h.companyOf(e.app, e.auth)
  if (!company) return h.bad(e, "Company not configured.", 404)

  const employees = e.app.findRecordsByFilter(
    "employees",
    "company = {:company} && status = 'active'",
    "first_name",
    300,
    0,
    { company: company.id }
  )

  const weeklyLimit = company.getFloat("overtime_weekly_hours") || 40
  const dailyLimit = company.getFloat("overtime_daily_hours") || 8
  let sheets = 0

  employees.forEach((emp) => {
    if (emp.getString("pay_type") === "salary") return
    const punches = h.workedMinutesByDay(e.app, emp.id, startDate, endDate)
    const shifts = e.app.findRecordsByFilter(
      "shifts",
      "employee = {:employee} && starts_at >= {:start} && starts_at < {:end} && ends_at < {:now}",
      "starts_at",
      300,
      0,
      {
        employee: emp.id,
        start: startDate + " 00:00:00.000Z",
        end: h.addDays(endDate, 1) + " 00:00:00.000Z",
        now: new Date().toISOString(),
      }
    )
    const byDay = {}
    shifts.forEach((s) => {
      const key = h.isoDate(s.getString("starts_at"))
      const mins = (h.toMs(s.getString("ends_at")) - h.toMs(s.getString("starts_at"))) / 60000 - (s.getFloat("break_minutes") || 0)
      if (mins > 0) byDay[key] = (byDay[key] || 0) + mins
    })
    Object.keys(punches).forEach((key) => { byDay[key] = punches[key] })

    const off = h.approvedTimeOff(e.app, emp.id, startDate, endDate)
    let ptoHours = 0
    off.forEach((r) => { ptoHours += r.getFloat("hours") || 0 })

    const days = Object.keys(byDay).sort()
    if (!days.length && ptoHours === 0) return

    const daily = {}
    days.forEach((day) => {
      const hours = h.round2(byDay[day] / 60)
      const ot = dailyLimit > 0 ? h.round2(Math.max(0, hours - dailyLimit)) : 0
      daily[day] = { regular: h.round2(hours - ot), overtime: ot }
    })

    const weekTotals = {}
    Object.keys(daily).forEach((day) => {
      const wk = h.weekKey(day)
      weekTotals[wk] = h.round2((weekTotals[wk] || 0) + daily[day].regular)
    })
    Object.keys(daily).forEach((day) => {
      const wk = h.weekKey(day)
      if (weekTotals[wk] > weeklyLimit) {
        const excess = h.round2(weekTotals[wk] - weeklyLimit)
        const take = Math.min(excess, daily[day].regular)
        daily[day].regular = h.round2(daily[day].regular - take)
        daily[day].overtime = h.round2(daily[day].overtime + take)
        weekTotals[wk] = h.round2(weekTotals[wk] - take)
      }
    })

    let regular = 0
    let overtime = 0
    Object.keys(daily).forEach((day) => {
      regular += daily[day].regular
      overtime += daily[day].overtime
    })

    let sheet
    try {
      sheet = e.app.findFirstRecordByFilter(
        "timesheets",
        "employee = {:employee} && period_start = {:start}",
        { employee: emp.id, start: startDate + " 00:00:00.000Z" }
      )
      if (sheet.getString("status") !== "open") return
    } catch (err) {
      sheet = new Record(e.app.findCollectionByNameOrId("timesheets"))
      sheet.set("employee", emp.id)
      sheet.set("period_start", startDate + " 00:00:00.000Z")
      sheet.set("period_end", endDate + " 00:00:00.000Z")
      sheet.set("status", "open")
    }

    sheet.set("regular_hours", h.round2(regular))
    sheet.set("overtime_hours", h.round2(overtime))
    sheet.set("pto_hours", h.round2(ptoHours))
    sheet.set("total_hours", h.round2(regular + overtime + ptoHours))
    e.app.save(sheet)

    const oldEntries = e.app.findRecordsByFilter("timesheet_entries", "timesheet = {:sheet}", "date", 1000, 0, { sheet: sheet.id })
    oldEntries.forEach((entry) => e.app.delete(entry))

    Object.keys(daily).sort().forEach((day) => {
      const entry = new Record(e.app.findCollectionByNameOrId("timesheet_entries"))
      entry.set("timesheet", sheet.id)
      entry.set("employee", emp.id)
      entry.set("date", day + " 00:00:00.000Z")
      entry.set("regular_hours", daily[day].regular)
      entry.set("overtime_hours", daily[day].overtime)
      entry.set("note", punches[day] ? "From punches" : "From scheduled shift")
      e.app.save(entry)
    })
    if (ptoHours > 0) {
      const entry = new Record(e.app.findCollectionByNameOrId("timesheet_entries"))
      entry.set("timesheet", sheet.id)
      entry.set("employee", emp.id)
      entry.set("date", startDate + " 00:00:00.000Z")
      entry.set("pto_hours", h.round2(ptoHours))
      entry.set("note", "Approved paid time off")
      e.app.save(entry)
    }
    sheets++
  })

  return e.json(200, { sheets: sheets, period_start: startDate, period_end: endDate })
}, $apis.requireAuth())

// ------------------------------------------------------------------ payroll
routerAdd("POST", "/api/openroster/payroll/preview", (e) => {
  const h = require(`${__hooks}/lib.js`)
  if (!h.isManager(e.auth)) return h.bad(e, "Manager access required.", 403)
  const result = h.payrollPayload(e.app, e.auth, e.requestInfo().body || {}, false)
  if (result.error) return h.bad(e, result.error)
  return e.json(200, result)
}, $apis.requireAuth())

routerAdd("POST", "/api/openroster/payroll/run", (e) => {
  const h = require(`${__hooks}/lib.js`)
  if (!h.isManager(e.auth)) return h.bad(e, "Manager access required.", 403)
  const result = h.payrollPayload(e.app, e.auth, e.requestInfo().body || {}, true)
  if (result.error) return h.bad(e, result.error)
  return e.json(200, result)
}, $apis.requireAuth())

// ------------------------------------------------------------------ bootstrap
routerAdd("GET", "/api/openroster/bootstrap", (e) => {
  const h = require(`${__hooks}/lib.js`)
  if (!e.auth) return h.bad(e, "Sign in first.", 401)
  const employee = h.employeeForUser(e.app, e.auth.id)
  let company = null
  if (employee) company = e.app.findRecordById("companies", employee.getString("company"))
  else {
    const companies = e.app.findRecordsByFilter("companies", "1 = 1", "-created", 1, 0)
    company = companies.length ? companies[0] : null
  }
  const locations = company
    ? e.app.findRecordsByFilter("locations", "company = {:company}", "name", 100, 0, { company: company.id })
    : []
  return e.json(200, {
    user: {
      id: e.auth.id,
      email: e.auth.getString("email"),
      name: e.auth.getString("name"),
      role: e.auth.getString("role"),
      avatar: e.auth.getString("avatar"),
    },
    employee: employee,
    company: company,
    locations: locations,
    is_manager: h.isManager(e.auth),
  })
}, $apis.requireAuth())

// ------------------------------------------------------------------ validation
onRecordCreateRequest((e) => {
  const h = require(`${__hooks}/lib.js`)
  if (e.record.getString("ends_at") && h.toMs(e.record.getString("ends_at")) <= h.toMs(e.record.getString("starts_at"))) {
    throw new BadRequestError("Shift end must be after start.")
  }
  if (e.record.getString("employee")) {
    const clashes = e.app.findRecordsByFilter(
      "shifts",
      "employee = {:employee} && starts_at < {:end} && ends_at > {:start}",
      "",
      5,
      0,
      { employee: e.record.getString("employee"), start: e.record.getString("starts_at"), end: e.record.getString("ends_at") }
    )
    if (clashes.length) throw new BadRequestError("This employee already has an overlapping shift.")
  }
  e.next()
}, "shifts")

onRecordUpdateRequest((e) => {
  const h = require(`${__hooks}/lib.js`)
  if (e.record.getString("ends_at") && h.toMs(e.record.getString("ends_at")) <= h.toMs(e.record.getString("starts_at"))) {
    throw new BadRequestError("Shift end must be after start.")
  }
  if (e.record.getString("employee")) {
    const clashes = e.app.findRecordsByFilter(
      "shifts",
      "employee = {:employee} && starts_at < {:end} && ends_at > {:start} && id != {:id}",
      "",
      5,
      0,
      { employee: e.record.getString("employee"), start: e.record.getString("starts_at"), end: e.record.getString("ends_at"), id: e.record.id }
    )
    if (clashes.length) throw new BadRequestError("This employee already has an overlapping shift.")
  }
  e.next()
}, "shifts")

onRecordCreateRequest((e) => {
  const h = require(`${__hooks}/lib.js`)
  if (e.record.getString("employee")) {
    let emp
    try { emp = e.app.findRecordById("employees", e.record.getString("employee")) } catch (err) {}
    if ((!emp || emp.getString("user") !== e.auth.id) && !h.isManager(e.auth)) {
      throw new ForbiddenError("You can only manage your own availability.")
    }
  }
  e.next()
}, "availability")

onRecordCreateRequest((e) => {
  const h = require(`${__hooks}/lib.js`)
  if (e.record.getString("employee")) {
    let emp
    try { emp = e.app.findRecordById("employees", e.record.getString("employee")) } catch (err) {}
    if ((!emp || emp.getString("user") !== e.auth.id) && !h.isManager(e.auth)) {
      throw new ForbiddenError("You can only request your own time off.")
    }
  }
  if (!h.isManager(e.auth) || !e.record.getString("status")) e.record.set("status", "pending")
  e.next()
}, "time_off_requests")

onRecordUpdateRequest((e) => {
  const h = require(`${__hooks}/lib.js`)
  const original = e.record.original()
  if (!h.isAdmin(e.auth) && original && original.getString("role") !== e.record.getString("role")) {
    throw new ForbiddenError("Only an administrator can change roles.")
  }
  e.next()
}, "users")

// ------------------------------------------------------------------ audit
onRecordCreateRequest((e) => {
  const h = require(`${__hooks}/lib.js`)
  e.next()
  h.audit(e.app, e.auth, "shifts", e.record.id, "create", "Created shift")
}, "shifts")

onRecordUpdateRequest((e) => {
  const h = require(`${__hooks}/lib.js`)
  e.next()
  h.audit(e.app, e.auth, "shifts", e.record.id, "update", "Updated shift")
}, "shifts")

onRecordCreateRequest((e) => {
  const h = require(`${__hooks}/lib.js`)
  e.next()
  h.audit(e.app, e.auth, "employees", e.record.id, "create", "Added " + e.record.getString("first_name") + " " + e.record.getString("last_name"))
}, "employees")

onRecordCreateRequest((e) => {
  const h = require(`${__hooks}/lib.js`)
  e.next()
  h.audit(e.app, e.auth, "pay_runs", e.record.id, "payroll", "Payroll run for " + e.record.getString("period_start"))
}, "pay_runs")

onRecordUpdateRequest((e) => {
  const h = require(`${__hooks}/lib.js`)
  e.next()
  h.audit(e.app, e.auth, "employees", e.record.id, "update", "Updated " + e.record.getString("first_name") + " " + e.record.getString("last_name"))
}, "employees")

onRecordUpdateRequest((e) => {
  const h = require(`${__hooks}/lib.js`)
  e.next()
  h.audit(e.app, e.auth, "pay_runs", e.record.id, "payroll", "Pay run marked " + e.record.getString("status"))
}, "pay_runs")

onRecordUpdateRequest((e) => {
  const h = require(`${__hooks}/lib.js`)
  e.next()
  h.audit(e.app, e.auth, "timesheets", e.record.id, "update", "Timesheet marked " + e.record.getString("status"))
}, "timesheets")

onRecordDeleteRequest((e) => {
  const h = require(`${__hooks}/lib.js`)
  const id = e.record.id
  e.next()
  h.audit(e.app, e.auth, e.collection.name, id, "delete", "Deleted " + e.collection.name)
}, "shifts", "employees")

onRecordCreateRequest((e) => {
  const h = require(`${__hooks}/lib.js`)
  const employeeId = e.record.getString("employee")
  let employee = null
  try { employee = e.app.findRecordById("employees", employeeId) } catch (err) {}
  if (!employee) throw new BadRequestError("Employee is required.")

  if (!h.isManager(e.auth)) {
    if (employee.getString("user") !== e.auth.id) throw new ForbiddenError("You can only punch for yourself.")
    const punchTime = h.toMs(e.record.getString("punched_at"))
    if (Math.abs(Date.now() - punchTime) > 10 * 60000) {
      throw new BadRequestError("Punches can only be recorded at the time they happen.")
    }
  }

  const last = e.app.findRecordsByFilter("punches", "employee = {:employee}", "-punched_at", 1, 0, { employee: employeeId })
  if (last.length && last[0].getString("type") === e.record.getString("type")) {
    throw new BadRequestError(e.record.getString("type") === "in" ? "Already clocked in." : "No open clock-in to close.")
  }
  e.next()
}, "punches")
