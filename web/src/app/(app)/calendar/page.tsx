"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, TriangleAlert } from "lucide-react";
import { pb } from "@/lib/pb";
import { useAuth } from "@/lib/auth";
import {
  errorMessage,
  getBlackoutDates,
  getShiftsBetween,
  getTimeOff,
} from "@/lib/data";
import type { BlackoutDate, Shift, TimeOffRequest } from "@/lib/types";
import {
  addDaysStr,
  dateInTz,
  monthDay,
  todayIn,
  toUtcIso,
  weekStart,
  weekdayShort,
} from "@/lib/dates";
import { fullName } from "@/lib/format";
import {
  Button,
  ErrorNote,
  Input,
  Label,
  Modal,
  PageHeader,
  Spinner,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/lib/toast";

export default function CalendarPage() {
  const { company, employee, isManager } = useAuth();
  const toast = useToast();
  const tz = company?.timezone || "America/Los_Angeles";
  const locale = company?.locale || "en-US";
  const weekStartsOn = Number(company?.week_start ?? "1");
  const today = todayIn(tz);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [blackouts, setBlackouts] = useState<BlackoutDate[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", start_date: "", end_date: "", note: "" });
  const [formError, setFormError] = useState("");

  const [year, monthNumber] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
  const gridStart = weekStart(monthStart, weekStartsOn);
  const gridEnd = addDaysStr(weekStart(monthEnd, weekStartsOn), 6);

  const days = useMemo(() => {
    const result: string[] = [];
    for (let date = gridStart; date <= gridEnd; date = addDaysStr(date, 1)) result.push(date);
    return result;
  }, [gridStart, gridEnd]);

  const load = useCallback(async () => {
    try {
      const [timeOff, blackoutRows, shiftRows] = await Promise.all([
        getTimeOff(isManager ? {} : { employee: employee?.id }),
        getBlackoutDates(),
        isManager
          ? getShiftsBetween(toUtcIso(gridStart, "00:00", tz), toUtcIso(addDaysStr(gridEnd, 1), "00:00", tz))
          : Promise.resolve([]),
      ]);
      setRequests(timeOff);
      setBlackouts(blackoutRows);
      setShifts(shiftRows);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [employee?.id, gridEnd, gridStart, isManager, tz]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDay = useMemo(() => {
    const map: Record<string, { requests: TimeOffRequest[]; shifts: Shift[]; blackout?: BlackoutDate; conflict: boolean }> = {};
    for (const day of days) {
      const dayRequests = requests.filter((request) => {
        const start = request.start_date.slice(0, 10);
        const end = request.end_date.slice(0, 10);
        return start <= day && end >= day;
      });
      const dayShifts = shifts.filter((shift) => dateInTz(shift.starts_at, tz) === day && shift.employee);
      const blackout = blackouts.find((row) => row.start_date.slice(0, 10) <= day && row.end_date.slice(0, 10) >= day);
      const conflict = dayShifts.some((shift) =>
        dayRequests.some((request) => request.status === "approved" && request.employee === shift.employee),
      );
      map[day] = { requests: dayRequests, shifts: dayShifts, blackout, conflict };
    }
    return map;
  }, [blackouts, days, requests, shifts, tz]);

  function shiftMonth(delta: number) {
    const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
    setMonth(date.toISOString().slice(0, 7));
  }

  async function saveBlackout() {
    setFormError("");
    try {
      if (!company) throw new Error("Company not configured.")
      if (!form.name.trim() || !form.start_date || !form.end_date) throw new Error("Name and dates are required.")
      if (form.end_date < form.start_date) throw new Error("End date must be on or after start date.")
      await pb.collection("blackout_dates").create({
        company: company.id,
        name: form.name.trim(),
        start_date: `${form.start_date} 00:00:00.000Z`,
        end_date: `${form.end_date} 00:00:00.000Z`,
        note: form.note || undefined,
        active: true,
      })
      setModalOpen(false)
      setForm({ name: "", start_date: "", end_date: "", note: "" })
      await load()
      toast("Blackout date added.")
    } catch (err) {
      setFormError(errorMessage(err))
    }
  }

  async function removeBlackout(row: BlackoutDate) {
    if (!window.confirm(`Delete blackout “${row.name}”?`)) return
    try {
      await pb.collection("blackout_dates").delete(row.id)
      await load()
      toast("Blackout removed.", "info")
    } catch (err) {
      toast(errorMessage(err), "error")
    }
  }

  if (loading) return <Spinner label="Loading calendar…" />;

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Time off"
        title="Time-off calendar"
        description="Approved and pending leave, blackout dates and schedule conflicts."
        actions={
          <>
            <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)}><ChevronLeft className="size-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setMonth(today.slice(0, 7))}>This month</Button>
            <Button variant="outline" size="icon" onClick={() => shiftMonth(1)}><ChevronRight className="size-4" /></Button>
            {isManager && (
              <Button size="sm" onClick={() => { setForm({ ...form, start_date: "", end_date: "" }); setModalOpen(true); }}>
                <Plus className="size-3.5" /> Blackout
              </Button>
            )}
          </>
        }
      />

      {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}

      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">
          {new Date(monthStart + "T00:00:00").toLocaleDateString(locale, { month: "long", year: "numeric" })}
        </p>
        <div className="flex items-center gap-3 text-[10px] text-muted">
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-sage" /> Approved</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-gold" /> Pending</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-danger" /> Conflict</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-7 border-b border-line bg-[#f7f4ec]">
            {Array.from({ length: 7 }, (_, index) => {
              const day = addDaysStr(gridStart, index);
              return <div key={day} className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{weekdayShort(day)}</div>;
            })}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const data = byDay[day];
              const inMonth = day >= monthStart && day <= monthEnd;
              return (
                <div
                  key={day}
                  className={`min-h-28 border-b border-r border-line p-2 ${inMonth ? "bg-surface" : "bg-[#faf8f2] text-muted/50"} ${day === today ? "ring-1 ring-inset ring-accent" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-medium tabular ${day === today ? "text-accent" : ""}`}>{Number(day.slice(8))}</span>
                    {data.conflict && <TriangleAlert className="size-3.5 text-danger" />}
                  </div>
                  {data.blackout && (
                    <div className="mt-1 rounded bg-[#f7ecd3] px-1.5 py-0.5 text-[9px] font-medium text-[#82621c]">
                      {data.blackout.name}
                    </div>
                  )}
                  <div className="mt-1 space-y-1">
                    {data.requests.slice(0, 3).map((request) => (
                      <div
                        key={request.id}
                        className={`truncate rounded px-1.5 py-0.5 text-[9px] ${request.status === "approved" ? "bg-[#e5efe7] text-[#2f5c47]" : "bg-[#f7ecd3] text-[#82621c]"}`}
                      >
                        {fullName(request.expand?.employee)}
                      </div>
                    ))}
                    {data.requests.length > 3 && <p className="text-[9px] text-muted">+{data.requests.length - 3} more</p>}
                  </div>
                  {data.conflict && <p className="mt-1 text-[9px] font-medium text-danger">Cover conflict</p>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {blackouts.length > 0 && (
        <div className="mt-4 panel-raised p-4">
          <p className="text-sm font-semibold">Blackout dates</p>
          <div className="mt-3 divide-y divide-line">
            {blackouts.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="text-xs font-medium">{row.name}</p>
                  <p className="text-[10px] text-muted">
                    {monthDay(row.start_date.slice(0, 10))} – {monthDay(row.end_date.slice(0, 10))}
                    {row.note ? ` · ${row.note}` : ""}
                  </p>
                </div>
                {isManager && (
                  <button onClick={() => void removeBlackout(row)} className="rounded p-1 text-muted hover:text-danger" title="Delete">
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add blackout date"
        description="Blackouts are shown on the calendar and in time-off requests."
        footer={<><Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={saveBlackout}>Add blackout</Button></>}
      >
        <div className="space-y-4">
          {formError && <ErrorNote>{formError}</ErrorNote>}
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Holiday rush" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>Start</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value, end_date: form.end_date || e.target.value })} /></div>
            <div><Label>End</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
          </div>
          <div><Label>Note</Label><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} /></div>
        </div>
      </Modal>
    </div>
  );
}
