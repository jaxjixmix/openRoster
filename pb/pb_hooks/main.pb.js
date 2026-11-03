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

  const allowedTypes = ["in", "out", "break_start", "break_end"]
  if (!allowedTypes.includes(body.type)) return h.bad(e, "Unknown punch type.")
  const type = body.type
  const punches = e.app.findRecordsByFilter(
    "punches",
    "employee = {:employee}",
    "-punched_at",
    1,
    0,
    { employee: employee.id }
  )
  const last = punches.length ? punches[0] : null
  const lastType = last ? last.getString("type") : ""

  if (type === "in") {
    if (lastType === "in") return h.bad(e, "Already clocked in at " + last.getString("punched_at") + ".", 409)
    if (lastType === "break_start") return h.bad(e, "End your break before clocking out or in again.", 409)
  }
  if (type === "out") {
    if (!last || lastType === "out") return h.bad(e, "No open clock-in to close.", 409)
    if (lastType === "break_start") return h.bad(e, "End your break before clocking out.", 409)
  }
  if (type === "break_start") {
    if (lastType !== "in") return h.bad(e, "Clock in before starting a break.", 409)
  }
  if (type === "break_end") {
    if (lastType !== "break_start") return h.bad(e, "No open break to end.", 409)
  }

  const punchLocationId = body.location || employee.getString("location")
  if (punchLocationId && typeof body.lat === "number" && typeof body.lng === "number") {
    let location = null
    try { location = e.app.findRecordById("locations", punchLocationId) } catch (err) {}
    if (location) {
      const lat = location.getFloat("lat")
      const lng = location.getFloat("lng")
      const radius = location.getFloat("geofence_meters") || 0
      if (radius > 0 && (Math.abs(lat) > 0.0001 || Math.abs(lng) > 0.0001)) {
        const distance = h.distanceMeters(body.lat, body.lng, lat, lng)
        if (distance > radius) {
          return h.bad(e, "You are " + distance + "m from " + location.getString("name") + ". Move within " + radius + "m to clock in.", 422)
        }
      }
    }
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

  const offsetMinutes = Number(body.offset_minutes || 0)
  const localDay = new Date(Date.now() + offsetMinutes * 60000).toISOString().slice(0, 10)
  const dayStart = new Date(Date.parse(localDay + "T00:00:00Z") - offsetMinutes * 60000).toISOString()
  const dayEnd = new Date(Date.parse(localDay + "T00:00:00Z") + 86400000 - offsetMinutes * 60000).toISOString()
  const todays = e.app.findRecordsByFilter(
    "punches",
    "employee = {:employee} && punched_at >= {:start} && punched_at < {:end}",
    "punched_at",
    100,
    0,
    { employee: employee.id, start: dayStart, end: dayEnd }
  )
  let worked = 0
  let openAt = null
  let breakAt = null
  let breakMs = 0
  todays.forEach((p) => {
    const t = h.toMs(p.getString("punched_at"))
    const punchType = p.getString("type")
    if (punchType === "in") {
      openAt = t
      breakAt = null
      breakMs = 0
    } else if (punchType === "break_start") {
      breakAt = t
    } else if (punchType === "break_end") {
      if (breakAt !== null) {
        breakMs += Math.max(0, t - breakAt)
        breakAt = null
      }
    } else if (punchType === "out" && openAt !== null) {
      worked += Math.max(0, t - openAt - breakMs)
      openAt = null
      breakAt = null
      breakMs = 0
    }
  })
  if (openAt !== null) {
    worked += Math.max(0, Date.now() - openAt - breakMs - (breakAt !== null ? Date.now() - breakAt : 0))
  }

  return e.json(200, {
    punch: punch,
    clocked_in: type === "in" || type === "break_start",
    on_break: type === "break_start",
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

  e.app.runInTransaction((txApp) => {
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
    txApp.save(shift)
    shiftsByEmployee[best.id] = (shiftsByEmployee[best.id] || []).concat([shift])
    hoursByEmployee[best.id] = (hoursByEmployee[best.id] || 0) + hours
    totalAssigned++
    })
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

  e.app.runInTransaction((txApp) => {
    employees.forEach((emp) => {
      if (emp.getString("pay_type") === "salary") return
      const punches = h.workedMinutesByDay(txApp, emp.id, startDate, endDate, company.getFloat("punch_rounding_minutes") || 0)
      const shifts = txApp.findRecordsByFilter(
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

      const off = h.approvedTimeOff(txApp, emp.id, startDate, endDate)
      let ptoHours = 0
      off.forEach((r) => { ptoHours += r.getFloat("hours") || 0 })

      const days = Object.keys(byDay).sort()
      if (!days.length && ptoHours === 0) return

      const computed = h.computeTimesheetHours(byDay, dailyLimit, weeklyLimit)
      const daily = computed.daily

      let sheet
      try {
        sheet = txApp.findFirstRecordByFilter(
          "timesheets",
          "employee = {:employee} && period_start = {:start}",
          { employee: emp.id, start: startDate + " 00:00:00.000Z" }
        )
        if (sheet.getString("status") !== "open") return
      } catch (err) {
        sheet = new Record(txApp.findCollectionByNameOrId("timesheets"))
        sheet.set("employee", emp.id)
        sheet.set("period_start", startDate + " 00:00:00.000Z")
        sheet.set("period_end", endDate + " 00:00:00.000Z")
        sheet.set("status", "open")
      }

      sheet.set("regular_hours", computed.regular)
      sheet.set("overtime_hours", computed.overtime)
      sheet.set("pto_hours", h.round2(ptoHours))
      sheet.set("total_hours", h.round2(computed.regular + computed.overtime + ptoHours))
      txApp.save(sheet)

      const oldEntries = txApp.findRecordsByFilter("timesheet_entries", "timesheet = {:sheet}", "date", 1000, 0, { sheet: sheet.id })
      oldEntries.forEach((entry) => txApp.delete(entry))

      Object.keys(daily).sort().forEach((day) => {
        const entry = new Record(txApp.findCollectionByNameOrId("timesheet_entries"))
        entry.set("timesheet", sheet.id)
        entry.set("employee", emp.id)
        entry.set("date", day + " 00:00:00.000Z")
        entry.set("regular_hours", daily[day].regular)
        entry.set("overtime_hours", daily[day].overtime)
        entry.set("note", punches[day] ? "From punches" : "From scheduled shift")
        txApp.save(entry)
      })
      if (ptoHours > 0) {
        const entry = new Record(txApp.findCollectionByNameOrId("timesheet_entries"))
        entry.set("timesheet", sheet.id)
        entry.set("employee", emp.id)
        entry.set("date", startDate + " 00:00:00.000Z")
        entry.set("pto_hours", h.round2(ptoHours))
        entry.set("note", "Approved paid time off")
        txApp.save(entry)
      }
      sheets++
    })
  })

  return e.json(200, { sheets: sheets, period_start: startDate, period_end: endDate })
}, $apis.requireAuth())

// ------------------------------------------------------------------ claim an open shift
routerAdd("POST", "/api/openroster/shifts/claim", (e) => {
  const h = require(`${__hooks}/lib.js`)
  if (!e.auth) return h.bad(e, "Sign in first.", 401)
  const body = e.requestInfo().body || {}
  if (!body.shift) return h.bad(e, "Shift is required.")
  const employee = h.employeeForUser(e.app, e.auth.id)
  if (!employee) return h.bad(e, "No employee profile is linked to this account.", 404)

  const shift = e.app.findRecordById("shifts", body.shift)
  if (shift.getString("employee")) return h.bad(e, "That shift is already assigned.", 409)
  if (shift.getString("status") !== "published") return h.bad(e, "That shift is not published.", 409)

  const assignmentError = h.shiftAssignmentError(e.app, shift, employee.id, shift.id)
  if (assignmentError) return h.bad(e, assignmentError)

  e.app.runInTransaction((txApp) => {
    const record = txApp.findRecordById("shifts", shift.id)
    record.set("employee", employee.id)
    record.set("source", "swap")
    txApp.save(record)
    shift.set("employee", employee.id)
    shift.set("source", "swap")
  })
  h.audit(e.app, e.auth, "shifts", shift.id, "schedule", "Claimed open shift")
  return e.json(200, { shift: shift })
}, $apis.requireAuth())

// ------------------------------------------------------------------ timesheet approval
routerAdd("POST", "/api/openroster/timesheets/approve", (e) => {
  const h = require(`${__hooks}/lib.js`)
  if (!h.isManager(e.auth)) return h.bad(e, "Manager access required.", 403)
  const body = e.requestInfo().body || {}
  const ids = Array.isArray(body.ids) ? body.ids : []
  if (!ids.length) return h.bad(e, "No timesheets selected.")

  let approved = 0
  const approvedIds = []
  e.app.runInTransaction((txApp) => {
    ids.forEach((id) => {
      const sheet = txApp.findRecordById("timesheets", id)
      const status = sheet.getString("status")
      if (status === "approved") return
      if (status === "paid") return
      if (status !== "open" && status !== "submitted") {
        throw new BadRequestError("Only open timesheets can be approved.")
      }
      sheet.set("status", "approved")
      sheet.set("approved_by", e.auth.id)
      sheet.set("approved_at", new Date().toISOString())
      txApp.save(sheet)
      approvedIds.push(id)
      approved++
    })
  })

  approvedIds.forEach((id) => {
    h.audit(e.app, e.auth, "timesheets", id, "update", "Timesheet approved")
  })

  return e.json(200, { approved: approved })
}, $apis.requireAuth())

// ------------------------------------------------------------------ pay periods
routerAdd("POST", "/api/openroster/pay_periods/generate", (e) => {
  const h = require(`${__hooks}/lib.js`)
  if (!h.isManager(e.auth)) return h.bad(e, "Manager access required.", 403)
  const body = e.requestInfo().body || {}
  const from = String(body.from || "")
  const to = String(body.to || (from ? h.addDays(from, 365) : ""))
  if (!from || !to) return h.bad(e, "from and to are required (YYYY-MM-DD).")
  if (to < from) return h.bad(e, "to must be after from.")
  const company = h.companyOf(e.app, e.auth)
  if (!company) return h.bad(e, "Company not configured.", 404)

  const periods = h.generatePayPeriods(
    company.getString("pay_frequency") || "biweekly",
    from,
    to,
    parseInt(company.getString("week_start") || "1", 10),
    5
  )

  let created = 0
  e.app.runInTransaction((txApp) => {
    periods.forEach((period) => {
      try {
        txApp.findFirstRecordByFilter(
          "pay_periods",
          "company = {:company} && period_start = {:start}",
          { company: company.id, start: period.start + " 00:00:00.000Z" }
        )
        return
      } catch (err) {}
      const record = new Record(txApp.findCollectionByNameOrId("pay_periods"))
      record.set("company", company.id)
      record.set("period_start", period.start + " 00:00:00.000Z")
      record.set("period_end", period.end + " 00:00:00.000Z")
      record.set("pay_date", period.pay_date + " 00:00:00.000Z")
      record.set("status", "open")
      record.set("created_by", e.auth.id)
      txApp.save(record)
      created++
    })
  })

  return e.json(200, { created: created, generated: periods.length })
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

// ------------------------------------------------------------------ pay run lifecycle
routerAdd("POST", "/api/openroster/payroll/status", (e) => {
  const h = require(`${__hooks}/lib.js`)
  if (!h.isManager(e.auth)) return h.bad(e, "Manager access required.", 403)
  const body = e.requestInfo().body || {}
  const status = String(body.status || "")
  if (!body.run) return h.bad(e, "Pay run is required.")
  if (status !== "approved" && status !== "paid" && status !== "voided") {
    return h.bad(e, "Status must be approved, paid or voided.")
  }

  let paidSheets = 0
  let beforeState = null
  let afterState = null
  e.app.runInTransaction((txApp) => {
    const run = txApp.findRecordById("pay_runs", body.run)
    const from = run.getString("status")
    const keys = ["status", "period_start", "period_end", "total_gross", "total_tax", "total_deductions", "total_net", "void_reason"]
    beforeState = h.snapshot(run, keys)

    if (status === "approved") {
      if (from !== "draft") throw new BadRequestError("Only draft pay runs can be approved.")
      run.set("status", "approved")
      txApp.save(run)
      return
    }

    if (status === "paid") {
      if (from !== "approved") throw new BadRequestError("Only approved pay runs can be marked paid.")
      run.set("status", "paid")
      txApp.save(run)
      const sheets = txApp.findRecordsByFilter(
        "timesheets",
        "employee.company = {:company} && period_start >= {:start} && period_end <= {:end} && status = 'approved'",
        "",
        1000,
        0,
        {
          company: run.getString("company"),
          start: run.getString("period_start"),
          end: run.getString("period_end"),
        }
      )
      sheets.forEach((sheet) => {
        sheet.set("status", "paid")
        txApp.save(sheet)
        paidSheets++
      })
      try {
        const period = txApp.findFirstRecordByFilter(
          "pay_periods",
          "company = {:company} && period_start = {:start}",
          { company: run.getString("company"), start: run.getString("period_start") }
        )
        period.set("status", "closed")
        period.set("locked_at", new Date().toISOString())
        txApp.save(period)
      } catch (err) {}
      return
    }

    if (from === "voided") throw new BadRequestError("This pay run is already voided.")
    run.set("status", "voided")
    run.set("voided_at", new Date().toISOString())
    run.set("void_reason", String(body.reason || "Voided by manager"))
    txApp.save(run)
    try {
      const period = txApp.findFirstRecordByFilter(
        "pay_periods",
        "company = {:company} && period_start = {:start}",
        { company: run.getString("company"), start: run.getString("period_start") }
      )
      period.set("status", "open")
      period.set("locked_at", "")
      txApp.save(period)
    } catch (err) {}
  })

  const saved = e.app.findRecordById("pay_runs", body.run)
  afterState = h.snapshot(saved, ["status", "period_start", "period_end", "total_gross", "total_tax", "total_deductions", "total_net", "void_reason"])
  h.audit(e.app, e.auth, "pay_runs", body.run, "payroll", "Pay run marked " + status + (paidSheets ? " (" + paidSheets + " timesheets paid)" : ""), beforeState, afterState)

  return e.json(200, { ok: true, timesheets_paid: paidSheets })
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

// ------------------------------------------------------------------ punch correction
routerAdd("POST", "/api/openroster/punches/correct", (e) => {
  const h = require(`${__hooks}/lib.js`)
  if (!h.isManager(e.auth)) return h.bad(e, "Manager access required.", 403)
  const body = e.requestInfo().body || {}
  const reason = String(body.reason || "").trim()
  if (!body.punch) return h.bad(e, "Punch is required.")
  if (!reason) return h.bad(e, "A correction reason is required.")

  let beforeState = null
  let afterState = null
  e.app.runInTransaction((txApp) => {
    const punch = txApp.findRecordById("punches", body.punch)
    beforeState = h.snapshot(punch, ["type", "punched_at", "note"])
    if (["in", "out", "break_start", "break_end"].includes(body.type)) punch.set("type", body.type)
    if (body.punched_at) punch.set("punched_at", body.punched_at)
    punch.set("note", reason)
    txApp.save(punch)
    afterState = h.snapshot(punch, ["type", "punched_at", "note"])
  })

  const saved = e.app.findRecordById("punches", body.punch)
  h.audit(e.app, e.auth, "punches", body.punch, "clock", "Corrected punch: " + reason, beforeState, afterState)
  return e.json(200, { punch: saved })
}, $apis.requireAuth())

// ------------------------------------------------------------------ first-run setup
routerAdd("GET", "/api/openroster/status", (e) => {
  let setupRequired = true
  let demoAvailable = false
  try {
    const companies = e.app.findRecordsByFilter("companies", "1 = 1", "", 1, 0)
    const users = e.app.findRecordsByFilter("users", "1 = 1", "", 1, 0)
    setupRequired = companies.length === 0 && users.length === 0
  } catch (err) {
    setupRequired = true
  }
  try {
    e.app.findAuthRecordByEmail("users", "maya@harborhearth.co")
    demoAvailable = true
  } catch (err) {}
  return e.json(200, { setup_required: setupRequired, demo_available: demoAvailable })
})

routerAdd("POST", "/api/openroster/setup", (e) => {
  const h = require(`${__hooks}/lib.js`)
  const body = e.requestInfo().body || {}
  const companies = e.app.findRecordsByFilter("companies", "1 = 1", "", 1, 0)
  const users = e.app.findRecordsByFilter("users", "1 = 1", "", 1, 0)
  if (companies.length || users.length) {
    return e.json(409, { message: "This workspace is already initialized." })
  }

  const companyName = String(body.company_name || "").trim()
  const adminName = String(body.admin_name || "").trim()
  const adminEmail = String(body.admin_email || "").trim().toLowerCase()
  const adminPassword = String(body.admin_password || "")
  const locationName = String(body.location_name || "").trim()
  const locationAddress = String(body.location_address || "").trim()
  const timezone = String(body.timezone || "America/Los_Angeles")
  const currency = String(body.currency || "USD").toUpperCase().slice(0, 3)
  const locale = String(body.locale || "en-US")
  const weekStart = String(body.week_start || "1") === "0" ? "0" : "1"

  if (!companyName) return e.json(400, { message: "Company name is required." })
  if (!adminName) return e.json(400, { message: "Administrator name is required." })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) return e.json(400, { message: "A valid administrator email is required." })
  if (adminPassword.length < 10) return e.json(400, { message: "Use a password with at least 10 characters." })
  if (!locationName) return e.json(400, { message: "A first location is required." })

  let ids = {}
  e.app.runInTransaction((txApp) => {
    const company = new Record(txApp.findCollectionByNameOrId("companies"))
    company.set("name", companyName)
    company.set("legal_name", companyName)
    company.set("timezone", timezone)
    company.set("currency", currency)
    company.set("locale", locale)
    company.set("week_start", weekStart)
    company.set("pay_frequency", "biweekly")
    company.set("overtime_weekly_hours", 40)
    company.set("overtime_daily_hours", 8)
    company.set("overtime_multiplier", 1.5)
    company.set("setup_complete", true)
    txApp.save(company)

    const location = new Record(txApp.findCollectionByNameOrId("locations"))
    location.set("company", company.id)
    location.set("name", locationName)
    location.set("address", locationAddress)
    location.set("timezone", timezone)
    location.set("active", true)
    txApp.save(location)

    const department = new Record(txApp.findCollectionByNameOrId("departments"))
    department.set("company", company.id)
    department.set("name", "General")
    department.set("color", "#3F6B57")
    txApp.save(department)

    const position = new Record(txApp.findCollectionByNameOrId("positions"))
    position.set("company", company.id)
    position.set("department", department.id)
    position.set("name", "Team member")
    position.set("default_rate", 0)
    position.set("active", true)
    txApp.save(position)

    const user = new Record(txApp.findCollectionByNameOrId("users"))
    user.set("email", adminEmail)
    user.set("password", adminPassword)
    user.set("passwordConfirm", adminPassword)
    user.set("name", adminName)
    user.set("role", "admin")
    user.set("verified", true)
    txApp.save(user)

    const parts = adminName.split(/\s+/)
    const employee = new Record(txApp.findCollectionByNameOrId("employees"))
    employee.set("user", user.id)
    employee.set("company", company.id)
    employee.set("location", location.id)
    employee.set("department", department.id)
    employee.set("position", position.id)
    employee.set("first_name", parts[0] || "Admin")
    employee.set("last_name", parts.slice(1).join(" ") || "User")
    employee.set("email", adminEmail)
    employee.set("hire_date", new Date().toISOString())
    employee.set("employment_type", "full_time")
    employee.set("pay_type", "salary")
    employee.set("pay_rate", 0)
    employee.set("overtime_exempt", true)
    employee.set("max_weekly_hours", 40)
    employee.set("pto_balance_hours", 0)
    employee.set("status", "active")
    txApp.save(employee)

    const year = new Date().getUTCFullYear()
    const periods = h.generatePayPeriods("biweekly", year + "-01-01", (year + 1) + "-12-31", parseInt(weekStart, 10), 5)
    periods.forEach((period) => {
      const payPeriod = new Record(txApp.findCollectionByNameOrId("pay_periods"))
      payPeriod.set("company", company.id)
      payPeriod.set("period_start", period.start + " 00:00:00.000Z")
      payPeriod.set("period_end", period.end + " 00:00:00.000Z")
      payPeriod.set("pay_date", period.pay_date + " 00:00:00.000Z")
      payPeriod.set("status", "open")
      payPeriod.set("created_by", user.id)
      txApp.save(payPeriod)
    })

    ids = { company: company.id, location: location.id, user: user.id, employee: employee.id }
  })

  return e.json(201, {
    ok: true,
    company_id: ids.company,
    location_id: ids.location,
    user_id: ids.user,
    employee_id: ids.employee,
  })
})

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
    const assignmentError = h.shiftAssignmentError(e.app, e.record, e.record.getString("employee"), "")
    if (assignmentError) throw new BadRequestError(assignmentError)
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
    const assignmentError = h.shiftAssignmentError(e.app, e.record, e.record.getString("employee"), e.record.id)
    if (assignmentError) throw new BadRequestError(assignmentError)
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
  if (e.record.getString("status") === "approved") h.applyPtoUsage(e.app, e.record)
}, "time_off_requests")

onRecordUpdateRequest((e) => {
  const h = require(`${__hooks}/lib.js`)
  const original = e.record.original()
  const wasApproved = !!original && original.getString("status") === "approved"
  e.next()
  const approved = e.record.getString("status") === "approved"
  if (approved) h.applyPtoUsage(e.app, e.record)
  else if (wasApproved) h.removePtoUsage(e.app, e.record.id, e.record.getString("employee"))
}, "time_off_requests")

onRecordDeleteRequest((e) => {
  const h = require(`${__hooks}/lib.js`)
  const id = e.record.id
  const employeeId = e.record.getString("employee")
  const wasApproved = e.record.getString("status") === "approved"
  e.next()
  if (wasApproved) h.removePtoUsage(e.app, id, employeeId)
}, "time_off_requests")

onRecordUpdateRequest((e) => {
  const h = require(`${__hooks}/lib.js`)
  const original = e.record.original()
  if (!h.isAdmin(e.auth) && original && original.getString("role") !== e.record.getString("role")) {
    throw new ForbiddenError("Only an administrator can change roles.")
  }
  e.next()
}, "users")

onRecordUpdateRequest((e) => {
  const h = require(`${__hooks}/lib.js`)
  if (e.auth && e.auth.isSuperuser()) return e.next()
  const original = e.record.original()
  if (!original) return e.next()

  const from = original.getString("status")
  const to = e.record.getString("status")
  const moneyFields = ["employee", "period_start", "period_end", "regular_hours", "overtime_hours", "pto_hours", "total_hours"]
  const changed = !h.sameFields(original, e.record, moneyFields)

  if (from === "approved" && (changed || (to !== "approved" && to !== "paid"))) {
    throw new BadRequestError("Approved timesheets are locked. Ask a superuser to correct them.")
  }
  if (from === "paid") {
    throw new BadRequestError("Paid timesheets are locked.")
  }
  e.next()
}, "timesheets")

onRecordUpdateRequest((e) => {
  const h = require(`${__hooks}/lib.js`)
  if (e.auth && e.auth.isSuperuser()) return e.next()
  const original = e.record.original()
  if (!original) return e.next()

  const from = original.getString("status")
  const to = e.record.getString("status")
  const moneyFields = ["company", "period_start", "period_end", "total_gross", "total_tax", "total_deductions", "total_net"]
  const changed = !h.sameFields(original, e.record, moneyFields)

  if (from === "approved" && (changed || (to !== "paid" && to !== "voided"))) {
    throw new BadRequestError("Approved pay runs are locked. Mark them paid or void them.")
  }
  if (from === "paid" && to !== "voided") {
    throw new BadRequestError("Paid pay runs are locked. Void the run to correct it.")
  }
  if (from === "voided") {
    throw new BadRequestError("Voided pay runs are immutable.")
  }
  e.next()
}, "pay_runs")

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
  const keys = ["status", "period_start", "period_end", "total_gross", "total_tax", "total_deductions", "total_net", "void_reason"]
  const before = h.snapshot(e.record.original(), keys)
  e.next()
  const after = h.snapshot(e.record, keys)
  h.audit(e.app, e.auth, "pay_runs", e.record.id, "payroll", "Pay run marked " + e.record.getString("status"), before, after)
}, "pay_runs")

onRecordUpdateRequest((e) => {
  const h = require(`${__hooks}/lib.js`)
  const keys = ["status", "regular_hours", "overtime_hours", "pto_hours", "total_hours", "approved_by", "approved_at"]
  const before = h.snapshot(e.record.original(), keys)
  e.next()
  const after = h.snapshot(e.record, keys)
  h.audit(e.app, e.auth, "timesheets", e.record.id, "update", "Timesheet marked " + e.record.getString("status"), before, after)
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
