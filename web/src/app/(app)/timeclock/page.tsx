"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, Coffee, Lock, LogIn, LogOut, MapPin, Pencil, Unlock, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { pb } from "@/lib/pb";
import { errorMessage, getEmployees, getKioskPin, getPunchesBetween, getShiftsBetween, getTimesheets } from "@/lib/data";
import type { Employee, KioskPin, Punch, Shift, Timesheet } from "@/lib/types";
import {
  addDaysStr,
  dateInTz,
  durationHours,
  formatInTimeZone,
  formatTime,
  toDate,
  todayIn,
  toUtcIso,
  weekStart,
} from "@/lib/dates";
import { fullName, hours, titleCase } from "@/lib/format";
import { Avatar, Badge, Button, Input, Label, Modal, PageHeader, Select, Spinner } from "@/components/ui";
import { ClockCard } from "@/components/clock-card";
import { ShiftRow } from "@/components/shift-row";
import { useToast } from "@/lib/toast";

export default function TimeClockPage() {
  const { company, employee, isManager } = useAuth();
  const toast = useToast();
  const tz = company?.timezone || "America/Los_Angeles";
  const today = todayIn(tz);
  const start = weekStart(today, Number(company?.week_start ?? "1"));

  const [punches, setPunches] = useState<Punch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [myShifts, setMyShifts] = useState<Shift[]>([]);
  const [sheets, setSheets] = useState<Timesheet[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingPunch, setEditingPunch] = useState<Punch | null>(null);
  const [punchForm, setPunchForm] = useState({ punched_at: "", type: "in", reason: "" });
  const [kiosk, setKiosk] = useState<KioskPin | null>(null);
  const [kioskUnlocked, setKioskUnlocked] = useState(!isManager);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  const load = useCallback(async () => {
    if (!company) return;
    try {
      const dayStart = toUtcIso(today, "00:00", tz);
      const dayEnd = toUtcIso(addDaysStr(today, 1), "00:00", tz);
      const weekStartIso = toUtcIso(start, "00:00", tz);
      const weekEndIso = toUtcIso(addDaysStr(start, 7), "00:00", tz);
      const [dayPunches, emps, shifts, timesheets] = await Promise.all([
        getPunchesBetween(undefined, dayStart, dayEnd),
        isManager ? getEmployees() : Promise.resolve([]),
        employee ? getShiftsBetween(weekStartIso, weekEndIso, { employee: employee.id }) : Promise.resolve([]),
        employee ? getTimesheets({ employee: employee.id, periodStart: `${start} 00:00:00.000Z`, periodEnd: `${addDaysStr(start, 6)} 23:59:59.999Z` }) : Promise.resolve([]),
      ]);
      setPunches(dayPunches);
      setEmployees(emps);
      setMyShifts(shifts);
      setSheets(timesheets);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [company, employee, isManager, start, today, tz]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!company || !isManager) {
      setKioskUnlocked(true);
      return;
    }
    getKioskPin(company.id)
      .then((record) => {
        setKiosk(record);
        const unlocked = !record?.pin || sessionStorage.getItem(`openroster_kiosk_${company.id}`) === "1";
        setKioskUnlocked(unlocked);
      })
      .catch(() => setKioskUnlocked(true));
  }, [company, isManager]);

  function unlockKiosk() {
    if (!company || !kiosk?.pin) return;
    if (pinInput.trim() === kiosk.pin) {
      sessionStorage.setItem(`openroster_kiosk_${company.id}`, "1");
      setKioskUnlocked(true);
      setPinError("");
      setPinInput("");
    } else {
      setPinError("Incorrect PIN.");
    }
  }

  function lockKiosk() {
    if (company) sessionStorage.removeItem(`openroster_kiosk_${company.id}`);
    setKioskUnlocked(false);
    setSelected("");
    setPinInput("");
  }

  function openPunch(punch: Punch) {
    setEditingPunch(punch)
    setPunchForm({
      punched_at: formatInTimeZone(toDate(punch.punched_at), tz, "yyyy-MM-dd'T'HH:mm"),
      type: punch.type,
      reason: "",
    })
  }

  async function savePunch() {
    if (!editingPunch) return
    try {
      const [date, time] = punchForm.punched_at.split("T")
      await pb.send("/api/openroster/punches/correct", {
        method: "POST",
        body: {
          punch: editingPunch.id,
          type: punchForm.type,
          punched_at: toUtcIso(date, time, tz),
          reason: punchForm.reason,
        },
      })
      setEditingPunch(null)
      await load()
      toast("Punch corrected. Regenerate the timesheet if needed.")
    } catch (err) {
      toast(errorMessage(err), "error")
    }
  }

  useEffect(() => {
    if (isManager && !selected && employee) setSelected(employee.id);
  }, [isManager, selected, employee]);

  const onClock = useMemo(() => {
    const latest = new Map<string, Punch>();
    for (const p of punches) {
      const current = latest.get(p.employee);
      if (!current || +toDate(p.punched_at) > +toDate(current.punched_at)) {
        latest.set(p.employee, p);
      }
    }
    return Array.from(latest.values()).filter((p) => p.type === "in");
  }, [punches]);

  const workedByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    const byEmployee = new Map<string, Punch[]>();
    for (const p of punches) {
      const list = byEmployee.get(p.employee) || [];
      list.push(p);
      byEmployee.set(p.employee, list);
    }
    for (const [id, list] of byEmployee) {
      const sorted = list.sort((a, b) => +toDate(a.punched_at) - +toDate(b.punched_at));
      let total = 0;
      let openAt: number | null = null;
      for (const p of sorted) {
        if (p.type === "in") openAt = +toDate(p.punched_at);
        else if (openAt !== null) {
          total += +toDate(p.punched_at) - openAt;
          openAt = null;
        }
      }
      if (openAt !== null) total += Date.now() - openAt;
      map.set(id, total);
    }
    return map;
  }, [punches]);

  const todayShift = myShifts.find((s) => dateInTz(s.starts_at, tz) === today);
  const weekHours = myShifts.reduce((sum, s) => sum + durationHours(s.starts_at, s.ends_at), 0);
  const sheet = sheets[0];

  if (loading) return <Spinner label="Loading time clock…" />;

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Time & attendance"
        title="Time Clock"
        description={
          isManager
            ? "Clock people in and out, and keep an eye on the floor in real time."
            : "Clock in when you start, clock out when you're done. Hours flow into your timesheet."
        }
      />

      {error && (
        <div className="mb-4 rounded-xl border border-[#eccac4] bg-[#f9eeec] px-4 py-3 text-sm text-[#8e342b]">
          {error}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_1.15fr]">
        <div className="space-y-5">
          {isManager && (
            <div className="panel-raised p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Kiosk mode</p>
                  <p className="mt-0.5 text-xs text-muted">Clock someone in or out on this device.</p>
                </div>
                <Users className="size-4 text-muted" />
              </div>
              {kiosk?.pin && !kioskUnlocked ? (
                <div className="mt-3 space-y-2">
                  <Label>Enter kiosk PIN</Label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={pinInput}
                      onChange={(e) => { setPinInput(e.target.value); setPinError(""); }}
                      onKeyDown={(e) => { if (e.key === "Enter") unlockKiosk(); }}
                      placeholder="••••"
                      maxLength={12}
                    />
                    <Button onClick={unlockKiosk}><Unlock className="size-4" /> Unlock</Button>
                  </div>
                  {pinError && <p className="text-[11px] text-danger">{pinError}</p>}
                </div>
              ) : (
                <>
                  <Select
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                    className="mt-3"
                  >
                    <option value="">Choose a team member</option>
                    {employees.filter((e) => e.status === "active").map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {fullName(emp)} · {emp.expand?.position?.name || titleCase(emp.pay_type || "")}
                      </option>
                    ))}
                  </Select>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-[10px] text-muted">
                      {kiosk?.pin ? "Kiosk unlocked for this session." : "No kiosk PIN configured. Set one in Settings."}
                    </p>
                    {kiosk?.pin && (
                      <Button variant="ghost" size="sm" onClick={lockKiosk}>
                        <Lock className="size-3.5" /> Lock
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {selected ? (
            <ClockCard employeeId={selected} onChanged={load} />
          ) : (
            <ClockCard onChanged={load} />
          )}

          {!isManager && (
            <div className="panel-raised p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Today&apos;s shift</p>
                <Badge tone={todayShift ? "sage" : "neutral"}>{todayShift ? "Scheduled" : "No shift"}</Badge>
              </div>
              <div className="mt-3">
                {todayShift ? (
                  <ShiftRow shift={todayShift} tz={tz} />
                ) : (
                  <p className="text-xs text-muted">You are not scheduled today. Clock in only if a manager asked you to.</p>
                )}
              </div>
              <div className="mt-4 grid grid-cols-3 divide-x divide-line border-t border-line pt-4">
                <div className="pr-3">
                  <p className="eyebrow">Week hours</p>
                  <p className="mt-1 text-lg font-semibold tabular">{hours(weekHours)}</p>
                </div>
                <div className="px-3">
                  <p className="eyebrow">Timesheet</p>
                  <p className="mt-1 text-sm font-semibold capitalize">{sheet ? sheet.status : "—"}</p>
                </div>
                <div className="pl-3">
                  <p className="eyebrow">PTO</p>
                  <p className="mt-1 text-lg font-semibold tabular">{hours(employee?.pto_balance_hours || 0)}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-5">
          {isManager && (
            <section className="panel-raised overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <div>
                  <p className="text-sm font-semibold">On the clock now</p>
                  <p className="mt-0.5 text-xs text-muted">{onClock.length} working · {punches.length} punches today</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#cddfd3] bg-[#e5efe7] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#2f5c47]">
                  <span className="size-1.5 animate-pulse rounded-full bg-sage" /> Live
                </span>
              </div>
              <div className="divide-y divide-line">
                {onClock.map((p) => {
                  const emp = p.expand?.employee;
                  const worked = workedByEmployee.get(p.employee) || 0;
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                      <Avatar name={fullName(emp)} id={p.employee} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">{fullName(emp)}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted">
                          <MapPin className="size-2.5" />
                          {p.expand?.location?.name || "Location not set"} · in at {formatTime(p.punched_at, tz)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-xs tabular">{(worked / 3600000).toFixed(2)}h</p>
                        <p className="text-[9px] text-muted">today</p>
                      </div>
                      <button
                        onClick={() => setSelected(p.employee)}
                        className="ml-1 rounded-md p-1.5 text-muted transition hover:bg-black/5 hover:text-ink"
                        title="Open this person's clock"
                      >
                        <Clock3 className="size-3.5" />
                      </button>
                    </div>
                  );
                })}
                {onClock.length === 0 && (
                  <p className="px-5 py-8 text-center text-xs text-muted">Nobody is clocked in right now.</p>
                )}
              </div>
            </section>
          )}

          <section className="panel-raised overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <p className="text-sm font-semibold">{isManager ? "Today's punch feed" : "Your punches today"}</p>
              <p className="mt-0.5 text-xs text-muted">Newest first · {today}</p>
            </div>
            <div className="divide-y divide-line">
              {(isManager ? punches : punches.filter((p) => p.employee === employee?.id)).slice(0, 20).map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className={`flex size-7 items-center justify-center rounded-full ${p.type === "in" ? "bg-[#e5efe7] text-sage" : "bg-[#f6e2d8] text-accent"}`}>
                    {p.type === "in" ? <LogIn className="size-3" /> : p.type === "break_start" || p.type === "break_end" ? <Coffee className="size-3" /> : <LogOut className="size-3" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {isManager ? fullName(p.expand?.employee) : p.type === "in" ? "Clocked in" : p.type === "out" ? "Clocked out" : p.type === "break_start" ? "Break started" : "Break ended"}
                    </p>
                    <p className="text-[10px] text-muted">{p.expand?.location?.name || "—"} · {p.source || "web"}</p>
                  </div>
                  <span className="font-mono text-[10px] text-muted">{formatTime(p.punched_at, tz)}</span>
                  {isManager && (
                    <button onClick={() => openPunch(p)} className="rounded-md p-1 text-muted hover:bg-black/5 hover:text-ink" title="Correct punch">
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {(isManager ? punches : punches.filter((p) => p.employee === employee?.id)).length === 0 && (
                <p className="px-5 py-8 text-center text-xs text-muted">No punches today.</p>
              )}
            </div>
          </section>
        </div>
      </div>

      <Modal
        open={!!editingPunch}
        onClose={() => setEditingPunch(null)}
        title="Correct punch"
        description="Corrections are audited. Regenerate the timesheet after changing a punch."
        footer={<><Button variant="ghost" onClick={() => setEditingPunch(null)}>Cancel</Button><Button onClick={savePunch}>Save correction</Button></>}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Time</Label>
              <Input type="datetime-local" value={punchForm.punched_at} onChange={(e) => setPunchForm({ ...punchForm, punched_at: e.target.value })} />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={punchForm.type} onChange={(e) => setPunchForm({ ...punchForm, type: e.target.value })}>
                <option value="in">Clock in</option>
                <option value="out">Clock out</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Reason</Label>
            <Input value={punchForm.reason} onChange={(e) => setPunchForm({ ...punchForm, reason: e.target.value })} placeholder="Forgot to clock out, wrong location, etc." />
          </div>
        </div>
      </Modal>
    </div>
  );
}
