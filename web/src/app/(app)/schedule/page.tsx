"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  Copy,
  ChevronRight,
  Download,
  LayoutGrid,
  Loader2,
  MapPin,
  Plus,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { pb } from "@/lib/pb";
import { useAuth } from "@/lib/auth";
import {
  errorMessage,
  getDepartments,
  getEmployees,
  getLocations,
  getPositions,
  getShiftsBetween,
} from "@/lib/data";
import type { Department, Employee, Position, Shift } from "@/lib/types";
import {
  addDaysStr,
  dateInTz,
  durationHours,
  formatInTimeZone,
  formatTime,
  monthDay,
  minutesFromMidnight,
  todayIn,
  toUtcIso,
  tzOffsets,
  weekDates,
  weekStart,
  weekdayShort,
  toDate,
} from "@/lib/dates";
import { fullName, hours } from "@/lib/format";
import { Avatar, Badge, Button, Input, Label, Modal, PageHeader, Select, Spinner } from "@/components/ui";
import { ShiftModal } from "@/components/shift-modal";
import { ShiftRow, shiftColor } from "@/components/shift-row";
import { useToast } from "@/lib/toast";
import { downloadCsv } from "@/lib/csv";
import { cn } from "@/lib/cn";

const START_MIN = 6 * 60;
const END_MIN = 24 * 60;
const PX_PER_HOUR = 48;

interface Positioned {
  shift: Shift;
  lane: number;
  lanes: number;
}

function layoutDay(shifts: Shift[], tz: string): Positioned[] {
  const sorted = [...shifts].sort(
    (a, b) => minutesFromMidnight(a.starts_at, tz) - minutesFromMidnight(b.starts_at, tz),
  );
  const lanes: Shift[][] = [];
  const laneOf = new Map<string, number>();
  for (const shift of sorted) {
    const start = minutesFromMidnight(shift.starts_at, tz);
    let index = lanes.findIndex((lane) => {
      const last = lane[lane.length - 1];
      const lastEnd =
        minutesFromMidnight(last.starts_at, tz) +
        (toDate(last.ends_at).getTime() - toDate(last.starts_at).getTime()) / 60000;
      return lastEnd <= start;
    });
    if (index === -1) {
      lanes.push([]);
      index = lanes.length - 1;
    }
    lanes[index].push(shift);
    laneOf.set(shift.id, index);
  }
  return sorted.map((shift) => ({
    shift,
    lane: laneOf.get(shift.id) || 0,
    lanes: lanes.length || 1,
  }));
}

export default function SchedulePage() {
  const { company, employee, isManager } = useAuth();
  const toast = useToast();
  const tz = company?.timezone || "America/Los_Angeles";
  const today = todayIn(tz);
  const [anchor, setAnchor] = useState(today);
  const start = weekStart(anchor, Number(company?.week_start ?? "1"));
  const days = weekDates(start);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [locations, setLocations] = useState<Awaited<ReturnType<typeof getLocations>>>([]);
  const [locationFilter, setLocationFilter] = useState("");
  const [view, setView] = useState<"board" | "timeline">("board");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Shift | null>(null);
  const [defaultDate, setDefaultDate] = useState(today);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTarget, setCopyTarget] = useState(addDaysStr(start, 7));

  const load = useCallback(async () => {
    if (!company) return;
    try {
      const startIso = toUtcIso(start, "00:00", tz);
      const endIso = toUtcIso(addDaysStr(start, 7), "00:00", tz);
      const [weekShifts, emps, depts, pos] = await Promise.all([
        getShiftsBetween(startIso, endIso),
        isManager ? getEmployees() : Promise.resolve([]),
        getDepartments(),
        getPositions(),
      ]);
      setShifts(weekShifts);
      setEmployees(emps);
      setDepartments(depts);
      setPositions(pos);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [company, start, tz, isManager]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isManager) return;
    getLocations().then(setLocations).catch(() => {});
  }, [isManager]);

  useEffect(() => {
    const unsub = pb.collection("shifts").subscribe("*", () => {
      void load();
    }).catch(() => {});
    return () => {
      unsub.then((fn) => { if (typeof fn === "function") fn(); }).catch(() => {});
    };
  }, [load]);

  useEffect(() => {
    if (!company) return;
    if (window.location.search.includes("new=1")) {
      setSelected(null);
      setDefaultDate(today);
      setModalOpen(true);
      window.history.replaceState({}, "", "/schedule");
    }
  }, [company, today]);

  const visibleShifts = useMemo(
    () => (locationFilter ? shifts.filter((s) => s.location === locationFilter) : shifts),
    [shifts, locationFilter],
  );

  const weekHours = visibleShifts
    .filter((s) => s.employee)
    .reduce((sum, s) => sum + durationHours(s.starts_at, s.ends_at) - (s.break_minutes || 0) / 60, 0);
  const openCount = visibleShifts.filter((s) => !s.employee).length;
  const draftCount = visibleShifts.filter((s) => s.status === "draft").length;
  const byDay = useMemo(
    () =>
      days.map((day) => ({
        day,
        shifts: visibleShifts.filter((s) => dateInTz(s.starts_at, tz) === day),
      })),
    [days, visibleShifts, tz],
  );

  async function autoFill() {
    setBusy(true);
    try {
      const result = await pb.send<{ assigned: number; unfilled: unknown[]; checked: number }>(
        "/api/openroster/schedule/auto",
        {
          method: "POST",
          body: {
            week_start: start,
            location: locationFilter || undefined,
            offsets: tzOffsets(start, tz),
          },
        },
      );
      await load();
      toast(
        result.unfilled.length
          ? `Filled ${result.assigned} shifts. ${result.unfilled.length} still need a person.`
          : `Filled ${result.assigned} of ${result.checked} open shifts.`,
        result.unfilled.length ? "info" : "success",
      );
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function publishAll() {
    const drafts = visibleShifts.filter((s) => s.status === "draft");
    if (!drafts.length) return;
    setBusy(true);
    try {
      await Promise.all(
        drafts.map((s) => pb.collection("shifts").update(s.id, { status: "published" })),
      );
      await load();
      toast(`Published ${drafts.length} draft shifts.`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function offerSwap() {
    if (!selected) return
    try {
      await pb.send("/api/openroster/swaps", { method: "POST", body: { shift: selected.id } })
      toast("Shift offered for swap. A manager will see it in Swaps.")
      setModalOpen(false)
      await load()
    } catch (err) {
      toast(errorMessage(err), "error")
    }
  }

  async function copyWeek() {
    if (!isManager) return
    const target = weekStart(copyTarget, Number(company?.week_start ?? "1"))
    setBusy(true)
    try {
      const result = await pb.send<{ created: number; to_week: string }>("/api/openroster/schedule/copy", {
        method: "POST",
        body: {
          from_week: start,
          to_week: target,
          from_offsets: tzOffsets(start, tz),
          to_offsets: tzOffsets(target, tz),
        },
      })
      setCopyOpen(false)
      setAnchor(target)
      toast(`Copied ${result.created} shifts into ${monthDay(target)}. New shifts are drafts.`)
    } catch (err) {
      toast(errorMessage(err), "error")
    } finally {
      setBusy(false)
    }
  }

  async function claimShift() {
    if (!selected) return
    try {
      await pb.send("/api/openroster/shifts/claim", { method: "POST", body: { shift: selected.id } })
      toast("Shift claimed. It is now on your schedule.")
      setModalOpen(false)
      await load()
    } catch (err) {
      toast(errorMessage(err), "error")
    }
  }

  function openNew(date: string) {
    setSelected(null);
    setDefaultDate(date);
    setModalOpen(true);
  }

  if (loading) return <Spinner label="Loading schedule…" />;

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Roster"
        title="Schedule"
        description={
          isManager
            ? `${visibleShifts.length} shifts this week · ${hours(weekHours)} assigned · ${openCount} open`
            : `${visibleShifts.length} shift${visibleShifts.length === 1 ? "" : "s"} on your roster this week.`
        }
        actions={
          isManager ? (
            <>
              <Button variant="outline" size="sm" onClick={publishAll} disabled={!draftCount || busy}>
                <UploadCloud className="size-3.5" /> Publish{draftCount ? ` ${draftCount}` : ""}
              </Button>
              <Button variant="outline" size="sm" onClick={autoFill} loading={busy}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                Auto-fill
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setCopyTarget(addDaysStr(start, 7)); setCopyOpen(true); }}
              >
                <Copy className="size-3.5" /> Copy week
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCsv(`schedule-${start}.csv`, visibleShifts.map((shift) => ({
                  date: dateInTz(shift.starts_at, tz),
                  start: formatTime(shift.starts_at, tz),
                  end: formatTime(shift.ends_at, tz),
                  employee: shift.expand?.employee ? fullName(shift.expand.employee) : "OPEN",
                  position: shift.expand?.position?.name || "",
                  location: shift.expand?.location?.name || "",
                  status: shift.status,
                  source: shift.source || "",
                })))}
                disabled={!visibleShifts.length}
              >
                <Download className="size-3.5" /> Export
              </Button>
              <Button size="sm" onClick={() => openNew(today)}>
                <Plus className="size-3.5" /> Add shift
              </Button>
            </>
          ) : undefined
        }
      />

      {error && (
        <div className="mb-4 rounded-xl border border-[#eccac4] bg-[#f9eeec] px-4 py-3 text-sm text-[#8e342b]">
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setAnchor(addDaysStr(start, -7))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(today)}>
            <CalendarDays className="size-3.5" /> This week
          </Button>
          <Button variant="outline" size="icon" onClick={() => setAnchor(addDaysStr(start, 7))}>
            <ChevronRight className="size-4" />
          </Button>
          <div className="ml-1">
            <p className="text-sm font-semibold">{monthDay(start)} – {monthDay(addDaysStr(start, 6))}, {start.slice(0, 4)}</p>
            <p className="text-[10px] text-muted">{tz.replace("_", " ")}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden items-center rounded-lg border border-line bg-surface p-0.5 lg:flex">
            <button
              onClick={() => setView("board")}
              className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition", view === "board" ? "bg-ink text-[#f4f1e8]" : "text-muted hover:text-ink")}
            >
              <LayoutGrid className="size-3" /> Board
            </button>
            <button
              onClick={() => setView("timeline")}
              className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition", view === "timeline" ? "bg-ink text-[#f4f1e8]" : "text-muted hover:text-ink")}
            >
              <CalendarRange className="size-3" /> Timeline
            </button>
          </div>
          {openCount > 0 && <Badge tone="accent">{openCount} open</Badge>}
          {draftCount > 0 && <Badge tone="warning">{draftCount} draft</Badge>}
          {isManager && locations.length > 0 && (
            <div className="flex items-center gap-1.5">
              <MapPin className="size-3.5 text-muted" />
              <Select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="h-8 w-auto min-w-36 text-xs"
              >
                <option value="">All locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </Select>
            </div>
          )}
        </div>
      </div>

      <div className={cn("hidden grid-cols-7 gap-2 lg:grid", view !== "board" && "lg:hidden")}>
        {byDay.map(({ day, shifts: dayShifts }) => {
          const dayHours = dayShifts
            .filter((s) => s.employee)
            .reduce((sum, s) => sum + durationHours(s.starts_at, s.ends_at) - (s.break_minutes || 0) / 60, 0);
          const dayOpen = dayShifts.filter((s) => !s.employee).length;
          return (
            <section
              key={day}
              className={cn(
                "flex min-h-[480px] flex-col rounded-xl border border-line bg-surface",
                day === today && "border-[#d9c8b4] bg-[#fbf6ec]",
              )}
            >
              <div className={cn("flex items-center justify-between border-b border-line px-2.5 py-2", day === today && "border-[#e4d6c2]")}>
                <div>
                  <p className={cn("text-[9px] font-semibold uppercase tracking-[0.12em]", day === today ? "text-accent" : "text-muted")}>
                    {weekdayShort(day)}
                  </p>
                  <p className={cn("text-base font-semibold leading-tight tabular", day === today ? "text-accent" : "text-ink")}>
                    {Number(day.slice(8))}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[9px] tabular text-muted">{dayHours.toFixed(1)}h</p>
                  <p className={cn("text-[9px]", dayOpen ? "font-medium text-accent" : "text-muted/70")}>{dayOpen ? `${dayOpen} open` : "covered"}</p>
                </div>
              </div>
              <div className="flex-1 space-y-1.5 p-1.5">
                {dayShifts.map((shift) => {
                  const color = shiftColor(shift);
                  const open = !shift.employee;
                  const startLabel = formatInTimeZone(toDate(shift.starts_at), tz, "h a").replace(" ", "").toLowerCase();
                  const endLabel = formatInTimeZone(toDate(shift.ends_at), tz, "h a").replace(" ", "").toLowerCase();
                  const hrs = durationHours(shift.starts_at, shift.ends_at) - (shift.break_minutes || 0) / 60;
                  return (
                    <button
                      key={shift.id}
                      onClick={() => { setSelected(shift); setModalOpen(true); }}
                      className={cn(
                        "w-full rounded-lg border border-line bg-raised p-2 text-left transition hover:border-line-strong hover:shadow-sm",
                        open && "border-dashed bg-[#fdf7f2]",
                      )}
                      style={{ borderLeft: `3px solid ${color}` }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-[8px] leading-none text-muted">{startLabel}–{endLabel}</span>
                        <span className="font-mono text-[8px] leading-none text-muted/70">{hrs.toFixed(1)}h</span>
                      </div>
                      <p className="mt-1 truncate text-[10px] font-semibold leading-tight text-ink">
                        {shift.expand?.position?.name || shift.expand?.department?.name || "Shift"}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        {open ? (
                          <span className="inline-flex rounded-full border border-[#edd0c1] bg-[#f6e2d8] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-[#9a3b1f]">
                            Open
                          </span>
                        ) : (
                          <>
                            <Avatar name={fullName(shift.expand?.employee)} id={shift.employee} size="xs" className="!size-4 !text-[7px]" />
                            <span className="truncate text-[9px] text-muted">
                              {fullName(shift.expand?.employee).split(" ")[0]}
                            </span>
                          </>
                        )}
                        {shift.status === "draft" && <span className="ml-auto text-[8px] font-medium uppercase text-[#82621c]">Draft</span>}
                      </div>
                    </button>
                  );
                })}
                {dayShifts.length === 0 && (
                  <button
                    onClick={() => isManager && openNew(day)}
                    className="w-full rounded-lg border border-dashed border-line py-6 text-[10px] text-muted/60 transition hover:border-line-strong hover:text-muted"
                  >
                    {isManager ? "+ Add shift" : "No shifts"}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className={cn("hidden overflow-hidden rounded-2xl border border-line bg-surface lg:block", view !== "timeline" && "lg:hidden")}>
        <div className="flex border-b border-line bg-[#f7f4ec]">
          <div className="w-14 shrink-0" />
          {days.map((day) => (
            <div
              key={day}
              className={cn(
                "flex-1 border-l border-line px-3 py-2.5 text-center",
                day === today && "bg-[#efe9db]",
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{weekdayShort(day)}</p>
              <p className={cn("mt-0.5 text-sm font-semibold tabular", day === today && "text-accent")}>
                {Number(day.slice(8))}
              </p>
            </div>
          ))}
        </div>

        <div className="relative flex" style={{ height: ((END_MIN - START_MIN) / 60) * PX_PER_HOUR + 8 }}>
          <div className="relative w-14 shrink-0 bg-[#faf8f2]">
            {Array.from({ length: (END_MIN - START_MIN) / 60 + 1 }, (_, i) => {
              const hour = START_MIN / 60 + i;
              return (
                <div key={hour} className="absolute right-2 -translate-y-1/2 text-[9px] font-medium text-muted/70" style={{ top: i * PX_PER_HOUR }}>
                  {hour === 12 ? "12p" : hour > 12 ? `${hour - 12}p` : `${hour}a`}
                </div>
              );
            })}
          </div>

          {byDay.map(({ day, shifts: dayShifts }) => {
            const positioned = layoutDay(dayShifts, tz);
            return (
              <div key={day} className={cn("relative flex-1 border-l border-line", day === today && "bg-[#faf6ec]")}>
                {Array.from({ length: (END_MIN - START_MIN) / 60 + 1 }, (_, i) => (
                  <div
                    key={i}
                    className={cn("absolute inset-x-0 border-t", i % 2 === 0 ? "border-line/80" : "border-line/35")}
                    style={{ top: i * PX_PER_HOUR }}
                  />
                ))}
                {positioned.map(({ shift, lane, lanes }) => {
                  const startMin = minutesFromMidnight(shift.starts_at, tz);
                  const mins = (toDate(shift.ends_at).getTime() - toDate(shift.starts_at).getTime()) / 60000;
                  const top = Math.max(0, ((startMin - START_MIN) / 60) * PX_PER_HOUR);
                  const rawHeight = (mins / 60) * PX_PER_HOUR;
                  const height = Math.max(24, Math.min(rawHeight, (END_MIN - START_MIN) / 60 * PX_PER_HOUR - top));
                  const color = shiftColor(shift);
                  const width = 100 / lanes;
                  const open = !shift.employee;
                  return (
                    <button
                      key={shift.id}
                      onClick={() => {
                        setSelected(shift);
                        setModalOpen(true);
                      }}
                      className={cn(
                        "group absolute overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left transition hover:z-20 hover:shadow-lg",
                        open && "border border-dashed border-l-[3px]",
                      )}
                      style={{
                        top,
                        height,
                        left: `calc(${lane * width}% + 3px)`,
                        width: `calc(${width}% - 6px)`,
                        backgroundColor: open ? "#fbf3ee" : `${color}1a`,
                        borderLeftColor: color,
                        ...(open ? { borderColor: `${color}66`, borderLeftColor: color } : {}),
                      }}
                      title={`${formatTime(shift.starts_at, tz)} – ${formatTime(shift.ends_at, tz)} · ${shift.expand?.employee ? fullName(shift.expand.employee) : "Open"}`}
                    >
                      <p className="truncate font-mono text-[9px] leading-tight text-muted">
                        {formatTime(shift.starts_at, tz)}–{formatTime(shift.ends_at, tz)}
                      </p>
                      <p className="truncate text-[10px] font-semibold leading-tight text-ink">
                        {open ? "Open shift" : fullName(shift.expand?.employee)}
                      </p>
                      {height > 42 && (
                        <p className="truncate text-[9px] leading-tight text-muted">
                          {shift.expand?.position?.name || shift.expand?.department?.name}
                        </p>
                      )}
                      {height > 58 && shift.status === "draft" && (
                        <span className="mt-1 inline-block rounded bg-white/70 px-1 text-[8px] font-semibold uppercase tracking-wider text-[#82621c]">
                          Draft
                        </span>
                      )}
                    </button>
                  );
                })}
                {dayShifts.length === 0 && (
                  <button
                    onClick={() => isManager && openNew(day)}
                    className="absolute inset-x-2 top-3 rounded-lg border border-dashed border-line py-2 text-[10px] text-muted/60 transition hover:border-line-strong hover:text-muted"
                  >
                    {isManager ? "+ Add" : ""}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-4 lg:hidden">
        {byDay.map(({ day, shifts: dayShifts }) => (
          <section key={day} className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-line bg-[#f7f4ec] px-4 py-2.5">
              <p className={cn("text-xs font-semibold", day === today && "text-accent")}>
                {weekdayShort(day)} · {monthDay(day)}
                {day === today && <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-[9px] uppercase text-white">Today</span>}
              </p>
              {isManager && (
                <button onClick={() => openNew(day)} className="text-[11px] font-medium text-accent">
                  + Add
                </button>
              )}
            </div>
            <div className="space-y-2 p-3">
              {dayShifts.length === 0 && <p className="py-3 text-center text-xs text-muted">No shifts.</p>}
              {dayShifts.map((shift) => (
                <button key={shift.id} onClick={() => { setSelected(shift); setModalOpen(true); }} className="block w-full text-left">
                  <ShiftRow shift={shift} tz={tz} compact />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface px-4 py-2.5">
        <span className="text-[10px] uppercase tracking-[0.12em] text-muted">Teams</span>
        {departments.map((d) => (
          <span key={d.id} className="inline-flex items-center gap-1.5 text-[11px] text-muted">
            <span className="size-2 rounded-full" style={{ backgroundColor: d.color || "#C4552D" }} />
            {d.name}
          </span>
        ))}
      </div>

      <Modal
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        title="Copy week"
        description={`Copy ${monthDay(start)} – ${monthDay(addDaysStr(start, 6))} into an empty week. New shifts are drafts.`}
        footer={<><Button variant="ghost" onClick={() => setCopyOpen(false)}>Cancel</Button><Button onClick={copyWeek} loading={busy}>Copy week</Button></>}
      >
        <div>
          <Label>Target week (pick any day)</Label>
          <Input type="date" value={copyTarget} onChange={(e) => setCopyTarget(e.target.value)} />
          <p className="mt-2 text-[11px] text-muted">The target week must have no shifts. The copied shifts are drafts so you can review them first.</p>
        </div>
      </Modal>

      <ShiftModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        shift={selected}
        defaultDate={defaultDate}
        tz={tz}
        canEdit={isManager}
        canClaim={!isManager && !!selected && !selected.employee && selected.status === "published"}
        onClaim={claimShift}
        canOfferSwap={!isManager && !!selected && selected.employee === employee?.id && selected.status === "published"}
        onOfferSwap={offerSwap}
        employees={employees}
        locations={locations}
        departments={departments}
        positions={positions}
        onSaved={load}
      />
    </div>
  );
}
