"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ClipboardPaste,
  Copy,
  ChevronRight,
  Download,
  LayoutGrid,
  Loader2,
  MapPin,
  MoreHorizontal,
  Plus,
  Repeat,
  Sparkles,
  Trash2,
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
  addMonthsStr,
  dateInTz,
  durationHours,
  formatInTimeZone,
  formatTime,
  longDate,
  monthDay,
  monthYear,
  minutesFromMidnight,
  scheduleRange,
  todayIn,
  toUtcIso,
  tzOffsets,
  weekStart,
  weekdayShort,
  toDate,
  type ScheduleView,
} from "@/lib/dates";
import { fullName, hours } from "@/lib/format";
import { Avatar, Badge, Button, Input, Label, Modal, PageHeader, Select, Spinner } from "@/components/ui";
import { ShiftModal } from "@/components/shift-modal";
import { ShiftRow, shiftColor } from "@/components/shift-row";
import { useMoney } from "@/lib/currency";
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
  const money = useMoney();
  const tz = company?.timezone || "America/Los_Angeles";
  const today = todayIn(tz);
  const [anchor, setAnchor] = useState(today);
  const [rangeView, setRangeView] = useState<ScheduleView>("week");
  const weekStartsOn = Number(company?.week_start ?? "1");
  const range = useMemo(() => scheduleRange(anchor, rangeView, weekStartsOn), [anchor, rangeView, weekStartsOn]);
  const rangeStart = range.start;
  const rangeEnd = range.end;
  const days = range.days;
  const actionWeek = weekStart(anchor, weekStartsOn);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [locations, setLocations] = useState<Awaited<ReturnType<typeof getLocations>>>([]);
  const [locationFilter, setLocationFilter] = useState("");
  const [layout, setLayout] = useState<"board" | "timeline">("board");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Shift | null>(null);
  const [defaultDate, setDefaultDate] = useState(today);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTarget, setCopyTarget] = useState(addDaysStr(weekStart(today, Number(company?.week_start ?? "1")), 7));
  const [clipboard, setClipboard] = useState<Shift | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; shift: Shift | null; day: string } | null>(null);

  const load = useCallback(async () => {
    if (!company) return;
    try {
      const startIso = toUtcIso(rangeStart, "00:00", tz);
      const endIso = toUtcIso(rangeEnd, "00:00", tz);
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
  }, [company, rangeStart, rangeEnd, tz, isManager]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isManager) return;
    getLocations().then(setLocations).catch(() => {});
  }, [isManager]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = pb.collection("shifts").subscribe("*", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, 350);
    }).catch(() => {});
    return () => {
      if (timer) clearTimeout(timer);
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

  const rangeHours = visibleShifts
    .filter((s) => s.employee)
    .reduce((sum, s) => sum + durationHours(s.starts_at, s.ends_at) - (s.break_minutes || 0) / 60, 0);
  const openCount = visibleShifts.filter((s) => !s.employee).length;
  const draftCount = visibleShifts.filter((s) => s.status === "draft").length;
  const scheduledCost = visibleShifts
    .filter((s) => s.employee && s.expand?.employee?.pay_type !== "salary")
    .reduce((sum, s) => sum + (durationHours(s.starts_at, s.ends_at) - (s.break_minutes || 0) / 60) * (s.expand?.employee?.pay_rate || 0), 0);
  const laborBudget = company?.weekly_labor_budget || 0;
  const budgetWeeks = Math.max(1, Math.ceil(days.length / 7));
  const rangeBudget = laborBudget * budgetWeeks;
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
            week_start: actionWeek,
            location: locationFilter || undefined,
            offsets: tzOffsets(actionWeek, tz),
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

  async function applyTemplates() {
    setBusy(true)
    try {
      const result = await pb.send<{ created: number; skipped: Array<{ reason: string }> }>("/api/openroster/shift_templates/apply", {
        method: "POST",
        body: { week_start: actionWeek, offsets: tzOffsets(actionWeek, tz) },
      })
      await load()
      toast(
        result.created
          ? `Generated ${result.created} draft shifts from templates${result.skipped.length ? `; skipped ${result.skipped.length}` : ""}.`
          : "No new template shifts were generated.",
        result.skipped.length ? "info" : "success",
      )
    } catch (err) {
      toast(errorMessage(err), "error")
    } finally {
      setBusy(false)
    }
  }

  async function copyWeek() {
    if (!isManager) return
    const target = weekStart(copyTarget, weekStartsOn)
    setBusy(true)
    try {
      const result = await pb.send<{ created: number; to_week: string }>("/api/openroster/schedule/copy", {
        method: "POST",
        body: {
          from_week: actionWeek,
          to_week: target,
          from_offsets: tzOffsets(actionWeek, tz),
          to_offsets: tzOffsets(target, tz),
        },
      })
      setCopyOpen(false)
      setAnchor(target)
      setRangeView("week")
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

  function shiftAnchor(direction: number) {
    if (rangeView === "day") {
      setAnchor(addDaysStr(anchor, direction));
    } else if (rangeView === "month") {
      setAnchor(addMonthsStr(anchor, direction));
    } else {
      const length = rangeView === "week" ? 7 : rangeView === "2weeks" ? 14 : 28;
      setAnchor(addDaysStr(rangeStart, direction * length));
    }
  }

  function openMenuAt(x: number, y: number, shift?: Shift, day?: string) {
    if (!isManager) return;
    const targetDay = day || (shift ? dateInTz(shift.starts_at, tz) : today);
    const width = 224;
    const height = 300;
    setMenu({
      x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
      shift: shift || null,
      day: targetDay,
    });
  }

  function openMenu(event: ReactMouseEvent, shift?: Shift, day?: string) {
    event.preventDefault();
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    openMenuAt(event.clientX || rect.left + 8, event.clientY || rect.top + 8, shift, day);
  }

  function openMenuFromKeyboard(event: ReactKeyboardEvent, shift: Shift) {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    openMenuAt(rect.left + 8, rect.top + 8, shift);
  }

  function copiedPayload(source: Shift, date: string) {
    const startTime = source.local_start || formatInTimeZone(toDate(source.starts_at), tz, "HH:mm");
    const endTime = source.local_end || formatInTimeZone(toDate(source.ends_at), tz, "HH:mm");
    const endDate = endTime <= startTime ? addDaysStr(date, 1) : date;
    return {
      company: company?.id,
      location: source.location || undefined,
      department: source.department || undefined,
      position: source.position || undefined,
      employee: source.employee || "",
      starts_at: toUtcIso(date, startTime, tz),
      ends_at: toUtcIso(endDate, endTime, tz),
      local_date: `${date} 00:00:00.000Z`,
      local_start: startTime,
      local_end: endTime,
      break_minutes: source.break_minutes || 0,
      status: "draft",
      notes: source.notes || undefined,
      source: "manual",
    };
  }

  async function createCopies(source: Shift, dates: string[], label: string) {
    if (!isManager || !company) return;
    setMenu(null);
    setBusy(true);
    try {
      await Promise.all(dates.map((date) => pb.collection("shifts").create(copiedPayload(source, date))));
      await load();
      toast(`Created ${dates.length} ${label}${dates.length === 1 ? "" : "s"} as drafts.`);
    } catch (err) {
      toast(errorMessage(err), "error");
      await load();
    } finally {
      setBusy(false);
    }
  }

  function copyShift(shift: Shift) {
    setClipboard({ ...shift });
    setMenu(null);
    toast("Shift copied. Right-click a day or another shift to paste.");
  }

  async function pasteShift() {
    if (!clipboard || !menu) return;
    await createCopies(clipboard, [menu.day], "shift");
  }

  async function repeatShift(weeks: number) {
    if (!menu?.shift) return;
    const base = dateInTz(menu.shift.starts_at, tz);
    const dates = Array.from({ length: weeks }, (_, index) => addDaysStr(base, (index + 1) * 7));
    await createCopies(menu.shift, dates, "repeated shift");
  }

  async function deleteShift(shift: Shift) {
    setMenu(null);
    if (!window.confirm("Delete this shift? This cannot be undone.")) return;
    setBusy(true);
    try {
      await pb.collection("shifts").delete(shift.id);
      await load();
      toast("Shift deleted.");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", escape);
    };
  }, [menu]);

  useEffect(() => {
    if (rangeView !== "day" && rangeView !== "week" && layout === "timeline") setLayout("board");
  }, [rangeView, layout]);

  const periodLabel = rangeView === "day" ? "today" : rangeView === "week" ? "this week" : "in this view";
  const rangeLabel =
    rangeView === "day"
      ? longDate(anchor)
      : rangeView === "month"
        ? monthYear(anchor)
        : `${monthDay(rangeStart)} – ${monthDay(addDaysStr(rangeEnd, -1))}, ${rangeStart.slice(0, 4)}`;

  if (loading) return <Spinner label="Loading schedule…" />;

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Roster"
        title="Schedule"
        description={
          isManager
            ? `${visibleShifts.length} shifts ${periodLabel} · ${hours(rangeHours)} assigned · ${openCount} open`
            : `${visibleShifts.length} shift${visibleShifts.length === 1 ? "" : "s"} on your roster ${periodLabel}.`
        }
        actions={
          isManager ? (
            <>
              <Button variant="outline" size="sm" onClick={publishAll} disabled={!draftCount || busy}>
                <UploadCloud className="size-3.5" /> Publish{draftCount ? ` ${draftCount}` : ""}
              </Button>
              {(rangeView === "day" || rangeView === "week") && (
                <>
                  <Button variant="outline" size="sm" onClick={autoFill} loading={busy}>
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                    Auto-fill
                  </Button>
                  <Button variant="outline" size="sm" onClick={applyTemplates} loading={busy}>
                    <CalendarClock className="size-3.5" /> Apply templates
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setCopyTarget(addDaysStr(actionWeek, 7)); setCopyOpen(true); }}
                  >
                    <Copy className="size-3.5" /> Copy week
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCsv(`schedule-${rangeStart}.csv`, visibleShifts.map((shift) => ({
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
          <Button variant="outline" size="icon" onClick={() => shiftAnchor(-1)} aria-label="Previous period">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(today)}>
            <CalendarDays className="size-3.5" /> {rangeView === "day" ? "Today" : rangeView === "month" ? "This month" : "This week"}
          </Button>
          <Button variant="outline" size="icon" onClick={() => shiftAnchor(1)} aria-label="Next period">
            <ChevronRight className="size-4" />
          </Button>
          <div className="ml-1">
            <p data-testid="range-label" className="text-sm font-semibold">{rangeLabel}</p>
            <p className="text-[10px] text-muted">{tz.replace("_", " ")}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-line bg-surface p-0.5">
            {([
              ["day", "Day"],
              ["week", "Week"],
              ["2weeks", "2 weeks"],
              ["4weeks", "4 weeks"],
              ["month", "Month"],
            ] as [ScheduleView, string][]).map(([value, label]) => (
              <button
                key={value}
                data-testid={`schedule-view-${value}`}
                onClick={() => {
                  setRangeView(value);
                  if (value === "day") setLayout("timeline");
                  else if (value !== "week") setLayout("board");
                }}
                className={cn(
                  "rounded-md px-2 py-1.5 text-[11px] font-medium transition",
                  rangeView === value ? "bg-ink text-[#f4f1e8]" : "text-muted hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {(rangeView === "day" || rangeView === "week") && (
            <div className="hidden items-center rounded-lg border border-line bg-surface p-0.5 lg:flex">
              <button
                onClick={() => setLayout("board")}
                className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition", layout === "board" ? "bg-ink text-[#f4f1e8]" : "text-muted hover:text-ink")}
              >
                <LayoutGrid className="size-3" /> Board
              </button>
              <button
                onClick={() => setLayout("timeline")}
                className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition", layout === "timeline" ? "bg-ink text-[#f4f1e8]" : "text-muted hover:text-ink")}
              >
                <CalendarRange className="size-3" /> Timeline
              </button>
            </div>
          )}
          {isManager && <span className="hidden text-[10px] text-muted xl:inline">Right-click a shift for actions</span>}
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

      <div className={cn("hidden gap-2 lg:grid", rangeView === "day" ? "lg:grid-cols-1" : "lg:grid-cols-7", layout !== "board" && "lg:hidden")}>
        {byDay.map(({ day, shifts: dayShifts }) => {
          const outsideMonth = rangeView === "month" && day.slice(0, 7) !== anchor.slice(0, 7);
          const dayHours = dayShifts
            .filter((s) => s.employee)
            .reduce((sum, s) => sum + durationHours(s.starts_at, s.ends_at) - (s.break_minutes || 0) / 60, 0);
          const dayOpen = dayShifts.filter((s) => !s.employee).length;
          return (
            <section
              key={day}
              className={cn(
                "flex flex-col rounded-xl border border-line bg-surface",
                rangeView === "day" ? "min-h-[360px]" : rangeView === "week" ? "min-h-[480px]" : rangeView === "2weeks" ? "min-h-[160px]" : "min-h-[120px]",
                day === today && "border-[#d9c8b4] bg-[#fbf6ec]",
                outsideMonth && "opacity-55",
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
                      data-shift-id={shift.id}
                      onClick={() => { setSelected(shift); setModalOpen(true); }}
                      onContextMenu={(event) => openMenu(event, shift)}
                      onKeyDown={(event) => openMenuFromKeyboard(event, shift)}
                      aria-haspopup="menu"
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
                    onContextMenu={(event) => openMenu(event, undefined, day)}
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

      {laborBudget > 0 && (
        <div className={`mb-4 rounded-xl border px-4 py-3 ${scheduledCost > rangeBudget ? "border-[#eccac4] bg-[#f9eeec]" : "border-line bg-surface"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold">Scheduled labor budget</p>
              <p className="mt-0.5 text-[11px] text-muted">
                {money(scheduledCost)} of {money(rangeBudget)} · {Math.round((scheduledCost / rangeBudget) * 100)}% · {budgetWeeks} week{budgetWeeks === 1 ? "" : "s"} at {money(laborBudget)}/week
              </p>
            </div>
            <span className={`text-xs font-semibold ${scheduledCost > rangeBudget ? "text-danger" : "text-sage"}`}>
              {scheduledCost > rangeBudget ? `Over by ${money(scheduledCost - rangeBudget)}` : `${money(rangeBudget - scheduledCost)} left`}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eeeae0]">
            <div
              className={`h-full rounded-full ${scheduledCost > rangeBudget ? "bg-danger" : "bg-sage"}`}
              style={{ width: `${Math.min(100, (scheduledCost / rangeBudget) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className={cn("hidden overflow-hidden rounded-2xl border border-line bg-surface lg:block", layout !== "timeline" && "lg:hidden")}>
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
              <div
                key={day}
                onContextMenu={(event) => openMenu(event, undefined, day)}
                className={cn("relative flex-1 border-l border-line", day === today && "bg-[#faf6ec]")}
              >
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
                      data-shift-id={shift.id}
                      onClick={() => {
                        setSelected(shift);
                        setModalOpen(true);
                      }}
                      onContextMenu={(event) => openMenu(event, shift)}
                      onKeyDown={(event) => openMenuFromKeyboard(event, shift)}
                      aria-haspopup="menu"
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
                      title={`${formatTime(shift.starts_at, tz)} – ${formatTime(shift.ends_at, tz)} · ${shift.expand?.employee ? fullName(shift.expand.employee) : "Open"} · Right-click for actions`}
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
        {(rangeView === "day" || rangeView === "week" ? byDay : byDay.filter((entry) => entry.shifts.length > 0)).map(({ day, shifts: dayShifts }) => (
          <section key={day} onContextMenu={(event) => openMenu(event, undefined, day)} className="panel overflow-hidden">
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
                <div key={shift.id} data-shift-id={shift.id} className="flex items-start gap-1">
                  <button
                    onClick={() => { setSelected(shift); setModalOpen(true); }}
                    onContextMenu={(event) => openMenu(event, shift)}
                    onKeyDown={(event) => openMenuFromKeyboard(event, shift)}
                    aria-haspopup="menu"
                    className="min-w-0 flex-1 text-left"
                  >
                    <ShiftRow shift={shift} tz={tz} compact />
                  </button>
                  {isManager && (
                    <button
                      aria-label="Shift actions"
                      onClick={(event) => openMenu(event, shift)}
                      className="mt-1 rounded-md p-2 text-muted transition hover:bg-[#eeeae0] hover:text-ink"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  )}
                </div>
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

      {menu && (
        <div
          role="menu"
          aria-label="Shift actions"
          className="fixed z-50 w-56 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-xl"
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {menu.shift ? (
            <>
              <MenuItem icon={<Copy className="size-3.5" />} onClick={() => copyShift(menu.shift!)}>
                Copy shift
              </MenuItem>
              <MenuItem icon={<ClipboardPaste className="size-3.5" />} onClick={() => void pasteShift()} disabled={!clipboard}>
                Paste here
              </MenuItem>
              <div className="my-1 border-t border-line" />
              <MenuItem icon={<Repeat className="size-3.5" />} onClick={() => void repeatShift(1)}>
                Repeat next week
              </MenuItem>
              <MenuItem icon={<Repeat className="size-3.5" />} onClick={() => void repeatShift(4)}>
                Repeat next 4 weeks
              </MenuItem>
              <div className="my-1 border-t border-line" />
              <MenuItem icon={<Trash2 className="size-3.5" />} onClick={() => void deleteShift(menu.shift!)} danger>
                Delete shift
              </MenuItem>
            </>
          ) : (
            <>
              <MenuItem icon={<ClipboardPaste className="size-3.5" />} onClick={() => void pasteShift()} disabled={!clipboard}>
                Paste shift here
              </MenuItem>
              <MenuItem icon={<Plus className="size-3.5" />} onClick={() => { const day = menu.day; setMenu(null); openNew(day); }}>
                Add shift
              </MenuItem>
            </>
          )}
        </div>
      )}

      <Modal
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        title="Copy week"
        description={`Copy ${monthDay(actionWeek)} – ${monthDay(addDaysStr(actionWeek, 6))} into an empty week. New shifts are drafts.`}
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

function MenuItem({
  icon,
  children,
  onClick,
  disabled,
  danger,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition",
        disabled ? "cursor-not-allowed text-muted/50" : danger ? "text-danger hover:bg-[#f9eeec]" : "text-ink hover:bg-[#f2eee3]",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
