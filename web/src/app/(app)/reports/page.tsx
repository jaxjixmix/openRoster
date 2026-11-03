"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, ChevronLeft, ChevronRight, Clock3, Sparkles, TrendingUp, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { errorMessage, getEmployees, getShiftsBetween, getTimesheets } from "@/lib/data";
import type { Employee, Shift, Timesheet } from "@/lib/types";
import {
  addDaysStr,
  dateInTz,
  durationHours,
  monthDay,
  todayIn,
  toUtcIso,
  weekDates,
  weekStart,
  weekdayShort,
} from "@/lib/dates";
import { fullName, hours } from "@/lib/format";
import { useMoney } from "@/lib/currency";
import { Badge, Button, PageHeader, Spinner, StatCard } from "@/components/ui";
import { shiftColor } from "@/components/shift-row";

export default function ReportsPage() {
  const money = useMoney();
  const { company, isManager } = useAuth();
  const tz = company?.timezone || "America/Los_Angeles";
  const today = todayIn(tz);
  const [anchor, setAnchor] = useState(today);
  const start = weekStart(anchor, Number(company?.week_start ?? "1"));
  const days = weekDates(start);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [sheets, setSheets] = useState<Timesheet[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!company) return;
    try {
      const startIso = toUtcIso(start, "00:00", tz);
      const endIso = toUtcIso(addDaysStr(start, 7), "00:00", tz);
      const [weekShifts, weekSheets, emps] = await Promise.all([
        getShiftsBetween(startIso, endIso),
        getTimesheets({
          periodStart: `${start} 00:00:00.000Z`,
          periodEnd: `${addDaysStr(start, 6)} 23:59:59.999Z`,
        }),
        getEmployees(),
      ]);
      setShifts(weekShifts);
      setSheets(weekSheets);
      setEmployees(emps);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [company, start, tz]);

  useEffect(() => {
    void load();
  }, [load]);

  const employeeById = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const e of employees) map.set(e.id, e);
    return map;
  }, [employees]);

  const scheduledHours = shifts
    .filter((s) => s.employee)
    .reduce((sum, s) => sum + durationHours(s.starts_at, s.ends_at) - (s.break_minutes || 0) / 60, 0);
  const approvedSheets = sheets.filter((s) => s.status === "approved" || s.status === "paid");
  const actualRegular = approvedSheets.reduce((sum, s) => sum + (s.regular_hours || 0), 0);
  const actualOvertime = approvedSheets.reduce((sum, s) => sum + (s.overtime_hours || 0), 0);
  const actualPto = approvedSheets.reduce((sum, s) => sum + (s.pto_hours || 0), 0);
  const laborCost = approvedSheets.reduce((sum, s) => {
    const emp = employeeById.get(s.employee);
    if (!emp || emp.pay_type === "salary") return sum;
    const rate = emp.pay_rate || 0;
    return sum + (s.regular_hours || 0) * rate + (s.overtime_hours || 0) * rate * (company?.overtime_multiplier || 1.5) + (s.pto_hours || 0) * rate;
  }, 0);
  const assigned = shifts.filter((s) => s.employee).length;
  const coverage = shifts.length ? (assigned / shifts.length) * 100 : 100;

  const byDay = days.map((day) => ({
    day,
    shifts: shifts.filter((s) => dateInTz(s.starts_at, tz) === day),
  }));
  const maxDayHours = Math.max(
    1,
    ...byDay.map(({ shifts }) =>
      shifts
        .filter((s) => s.employee)
        .reduce((sum, s) => sum + durationHours(s.starts_at, s.ends_at) - (s.break_minutes || 0) / 60, 0),
    ),
  );

  const byDepartment = useMemo(() => {
    const map = new Map<string, { name: string; color: string; hours: number; cost: number }>();
    for (const shift of shifts) {
      if (!shift.employee) continue;
      const dept = shift.expand?.department;
      const key = dept?.id || "none";
      const current = map.get(key) || {
        name: dept?.name || "Unassigned",
        color: dept?.color || shiftColor(shift),
        hours: 0,
        cost: 0,
      };
      const h = durationHours(shift.starts_at, shift.ends_at) - (shift.break_minutes || 0) / 60;
      const rate = shift.expand?.employee?.pay_type === "salary" ? 0 : shift.expand?.employee?.pay_rate || 0;
      current.hours += h;
      current.cost += h * rate;
      map.set(key, current);
    }
    return Array.from(map.values()).sort((a, b) => b.hours - a.hours);
  }, [shifts]);
  const maxDeptHours = Math.max(1, ...byDepartment.map((d) => d.hours));

  const perEmployee = useMemo(() => {
    return employees
      .map((emp) => {
        const empShifts = shifts.filter((s) => s.employee === emp.id);
        const sheet = approvedSheets.find((s) => s.employee === emp.id);
        const scheduled = empShifts.reduce((sum, s) => sum + durationHours(s.starts_at, s.ends_at), 0);
        return {
          emp,
          scheduled,
          regular: sheet?.regular_hours || 0,
          overtime: sheet?.overtime_hours || 0,
          pto: sheet?.pto_hours || 0,
        };
      })
      .filter((row) => row.scheduled > 0 || row.regular > 0)
      .sort((a, b) => b.scheduled - a.scheduled);
  }, [employees, shifts, approvedSheets]);

  if (!isManager) {
    return (
      <div className="panel p-8 text-center">
        <p className="text-sm font-semibold">Manager access required</p>
        <p className="mt-1 text-sm text-muted">Reports are available to managers and administrators.</p>
      </div>
    );
  }

  if (loading) return <Spinner label="Crunching the week…" />;

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Insights"
        title="Reports"
        description="Where the hours went, what they cost, and who is carrying the week."
      />

      <div className="mb-5 flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setAnchor(addDaysStr(start, -7))}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAnchor(today)}>This week</Button>
        <Button variant="outline" size="icon" onClick={() => setAnchor(addDaysStr(start, 7))}>
          <ChevronRight className="size-4" />
        </Button>
        <p className="ml-1 text-sm font-semibold">{monthDay(start)} – {monthDay(addDaysStr(start, 6))}</p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-[#eccac4] bg-[#f9eeec] px-4 py-3 text-sm text-[#8e342b]">{error}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Scheduled" value={hours(scheduledHours)} hint={`${shifts.length} shifts`} icon={<Clock3 className="size-4" />} tone="neutral" />
        <StatCard label="Actual hours" value={hours(actualRegular + actualOvertime)} hint={`${hours(actualOvertime)} overtime · ${hours(actualPto)} PTO`} icon={<TrendingUp className="size-4" />} tone={actualOvertime > 0 ? "accent" : "sage"} />
        <StatCard label="Labor cost" value={money(laborCost)} hint="Hourly, from approved timesheets" icon={<BarChart3 className="size-4" />} tone="gold" />
        <StatCard label="Coverage" value={`${coverage.toFixed(0)}%`} hint={`${assigned} of ${shifts.length} shifts filled`} icon={<Users className="size-4" />} tone={coverage < 95 ? "accent" : "sage"} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <section className="panel-raised p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Scheduled hours by day</p>
              <p className="mt-0.5 text-xs text-muted">Assigned shifts, including breaks</p>
            </div>
            <Badge tone="neutral">{hours(scheduledHours)}</Badge>
          </div>
          <div className="mt-6 flex h-60 items-end gap-3 pt-4">
            {byDay.map(({ day, shifts: dayShifts }) => {
              const h = dayShifts
                .filter((s) => s.employee)
                .reduce((sum, s) => sum + durationHours(s.starts_at, s.ends_at) - (s.break_minutes || 0) / 60, 0);
              const total = dayShifts.reduce((sum, s) => sum + durationHours(s.starts_at, s.ends_at) - (s.break_minutes || 0) / 60, 0);
              return (
                <div key={day} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-[10px] font-medium tabular text-muted">{h ? h.toFixed(1) : "—"}</span>
                  <div className="relative w-full" style={{ height: 150 }}>
                    <div className="absolute inset-x-1 bottom-0 rounded-md bg-[#eeeae0]" style={{ height: `${(total / maxDayHours) * 100}%` }} />
                    <div
                      className={`absolute inset-x-1 bottom-0 rounded-md ${day === today ? "bg-accent" : "bg-sage"}`}
                      style={{ height: `${(h / maxDayHours) * 100}%`, minHeight: h ? 4 : 0 }}
                      title={`${h.toFixed(1)}h assigned`}
                    />
                  </div>
                  <span className={`text-[10px] ${day === today ? "font-semibold text-accent" : "text-muted"}`}>{weekdayShort(day)}</span>
                  <span className="text-[9px] text-muted/70">{Number(day.slice(8))}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel-raised p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Hours by department</p>
              <p className="mt-0.5 text-xs text-muted">Where the roster is concentrated</p>
            </div>
            <Sparkles className="size-4 text-muted" />
          </div>
          <div className="mt-5 space-y-4">
            {byDepartment.map((dept) => (
              <div key={dept.name}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-xs font-medium">{dept.name}</span>
                  <span className="font-mono text-[10px] text-muted">{hours(dept.hours)} · {money(dept.cost)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#eeeae0]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(dept.hours / maxDeptHours) * 100}%`, backgroundColor: dept.color }}
                  />
                </div>
              </div>
            ))}
            {byDepartment.length === 0 && <p className="py-8 text-center text-xs text-muted">No assigned shifts this week.</p>}
          </div>
        </section>
      </div>

      <section className="panel-raised mt-5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <p className="text-sm font-semibold">Hours by person</p>
            <p className="mt-0.5 text-xs text-muted">Scheduled vs approved actual</p>
          </div>
          <Badge tone={actualOvertime > 0 ? "accent" : "success"}>
            {actualOvertime > 0 ? `${hours(actualOvertime)} OT` : "No overtime"}
          </Badge>
        </div>
        <div className="hidden grid-cols-[1.6fr_repeat(4,0.7fr)] items-center gap-3 border-b border-line bg-[#f7f4ec] px-5 py-2.5 md:grid">
          <span className="table-head">Employee</span>
          <span className="table-head text-right">Scheduled</span>
          <span className="table-head text-right">Regular</span>
          <span className="table-head text-right">Overtime</span>
          <span className="table-head text-right">PTO</span>
        </div>
        <div className="divide-y divide-line">
          {perEmployee.map(({ emp, scheduled, regular, overtime, pto }) => (
            <div key={emp.id} className="grid grid-cols-2 items-center gap-3 px-5 py-3 md:grid-cols-[1.6fr_repeat(4,0.7fr)]">
              <div className="col-span-2 flex items-center gap-2.5 md:col-span-1">
                <span className="size-2 rounded-full" style={{ backgroundColor: emp.expand?.department?.color || "#C4552D" }} />
                <div>
                  <p className="text-xs font-medium">{fullName(emp)}</p>
                  <p className="text-[10px] text-muted">{emp.expand?.position?.name || "—"}</p>
                </div>
              </div>
              <span className="text-right font-mono text-xs tabular text-muted">{hours(scheduled)}</span>
              <span className="text-right font-mono text-xs tabular">{hours(regular)}</span>
              <span className={`text-right font-mono text-xs tabular ${overtime > 0 ? "font-semibold text-accent" : "text-muted"}`}>{hours(overtime)}</span>
              <span className="text-right font-mono text-xs tabular text-muted">{hours(pto)}</span>
            </div>
          ))}
          {perEmployee.length === 0 && <p className="px-5 py-10 text-center text-xs text-muted">No shifts or timesheets for this week.</p>}
        </div>
      </section>
    </div>
  );
}
