"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  CalendarPlus,
  Clock3,
  Inbox,
  MapPin,
  Plus,
  Sun,
  Users,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  errorMessage,
  getShiftsBetween,
  getTimeOff,
  getTimesheets,
  getPunchesBetween,
} from "@/lib/data";
import type { Punch, Shift, TimeOffRequest, Timesheet } from "@/lib/types";
import {
  addDaysStr,
  dateInTz,
  durationHours,
  formatInTimeZone,
  formatTime,
  longDate,
  todayIn,
  toUtcIso,
  weekStart,
  toDate,
} from "@/lib/dates";
import { compactMoney, fullName, hours, titleCase } from "@/lib/format";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Spinner,
  StatCard,
} from "@/components/ui";
import { ClockCard } from "@/components/clock-card";
import { ShiftRow } from "@/components/shift-row";

function greeting(tz: string): string {
  const hour = Number(formatInTimeZone(new Date(), tz, "H"));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function TodayPage() {
  const { user, employee, company, isManager } = useAuth();
  const tz = company?.timezone || "America/Los_Angeles";
  const today = todayIn(tz);
  const weekStartsOn = Number(company?.week_start ?? "1");
  const start = weekStart(today, weekStartsOn);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOffRequest[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState("");

  useEffect(() => {
    const tick = () =>
      setNow(formatInTimeZone(new Date(), tz, "h:mm:ss a"));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tz]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!company) return;
      try {
        const startIso = toUtcIso(start, "00:00", tz);
        const endIso = toUtcIso(addDaysStr(start, 7), "00:00", tz);
        const dayStart = toUtcIso(today, "00:00", tz);
        const dayEnd = toUtcIso(addDaysStr(today, 1), "00:00", tz);
        const [weekShifts, dayPunches, requests, sheets] = await Promise.all([
          getShiftsBetween(startIso, endIso),
          isManager ? getPunchesBetween(undefined, dayStart, dayEnd) : Promise.resolve([]),
          getTimeOff(isManager ? { status: "pending" } : { employee: employee?.id }),
          getTimesheets({
            employee: isManager ? undefined : employee?.id,
            periodStart: `${start} 00:00:00.000Z`,
            periodEnd: `${addDaysStr(start, 6)} 23:59:59.999Z`,
          }),
        ]);
        if (cancelled) return;
        setShifts(weekShifts);
        setPunches(dayPunches);
        setTimeOff(requests);
        setTimesheets(sheets);
        setError("");
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [company, employee?.id, isManager, start, today, tz]);

  const todayShifts = useMemo(
    () => shifts.filter((s) => dateInTz(s.starts_at, tz) === today),
    [shifts, today, tz],
  );

  const myShifts = useMemo(
    () => (employee ? shifts.filter((s) => s.employee === employee.id) : []),
    [shifts, employee],
  );

  const assignedToday = todayShifts.filter((s) => s.employee);
  const openToday = todayShifts.filter((s) => !s.employee);
  const openWeek = shifts.filter((s) => !s.employee);
  const draftCount = shifts.filter((s) => s.status === "draft").length;
  const weekHours = shifts
    .filter((s) => s.employee)
    .reduce((sum, s) => sum + durationHours(s.starts_at, s.ends_at) - (s.break_minutes || 0) / 60, 0);
  const laborCost = shifts
    .filter((s) => s.employee && s.expand?.employee?.pay_type !== "salary")
    .reduce(
      (sum, s) =>
        sum +
        (durationHours(s.starts_at, s.ends_at) - (s.break_minutes || 0) / 60) *
          (s.expand?.employee?.pay_rate || 0),
      0,
    );
  const onFloor = useMemo(
    () => [...todayShifts].sort((a, b) => +toDate(a.starts_at) - +toDate(b.starts_at)),
    [todayShifts],
  );
  const next = useMemo(() => {
    const future = myShifts.filter((s) => +toDate(s.ends_at) > Date.now());
    return future.sort((a, b) => +toDate(a.starts_at) - +toDate(b.starts_at))[0];
  }, [myShifts]);
  const openSheet = timesheets.find((s) => s.status === "open" || s.status === "submitted");
  const approvedSheet = timesheets.find((s) => s.status === "approved");
  const paidSheet = timesheets.find((s) => s.status === "paid");
  const currentSheet = openSheet || approvedSheet || paidSheet;
  const nextDate = next ? dateInTz(next.starts_at, tz) : "";
  const nextDayLabel = !next
    ? ""
    : nextDate === today
      ? "today"
      : nextDate === addDaysStr(today, 1)
        ? "tomorrow"
        : `on ${toDate(next.starts_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz })}`;

  if (loading) return <Spinner label="Loading today…" />;
  if (error) {
    return (
      <div className="panel p-6">
        <p className="text-sm font-semibold">Could not load today</p>
        <p className="mt-1 text-sm text-muted">{error}</p>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow={longDate(today)}
        title={`${greeting(tz)}, ${user?.name?.split(" ")[0] || "there"}.`}
        description={
          isManager
            ? `${assignedToday.length} people on today, ${openToday.length} open shift${openToday.length === 1 ? "" : "s"} left to cover.`
            : next
              ? `Your next shift is ${next.expand?.position?.name || "on the floor"} ${nextDayLabel} at ${formatTime(next.starts_at, tz)}.`
              : "No shifts on the books this week. Enjoy the space."
        }
        actions={
          <>
            <span className="hidden items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2 font-mono text-xs text-muted sm:flex">
              <span className="size-1.5 animate-pulse rounded-full bg-sage" />
              {now} · {tz.split("/")[1]?.replace("_", " ")}
            </span>
            {isManager ? (
              <>
                <Link href="/schedule">
                  <Button variant="outline">
                    <CalendarDays className="size-4" /> Schedule
                  </Button>
                </Link>
                <Link href="/schedule?new=1">
                  <Button>
                    <Plus className="size-4" /> Add shift
                  </Button>
                </Link>
              </>
            ) : (
              <Link href="/timeclock">
                <Button variant="outline">
                  <Clock3 className="size-4" /> Time clock
                </Button>
              </Link>
            )}
          </>
        }
      />

      {isManager ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="On today"
              value={assignedToday.length}
              hint={`${assignedToday.length} assigned · ${todayShifts.length} scheduled`}
              icon={<Users className="size-4" />}
              tone="sage"
            />
            <StatCard
              label="Open shifts"
              value={openToday.length}
              hint={openToday.length ? "Needs coverage today" : "Today is fully covered"}
              icon={<CalendarPlus className="size-4" />}
              tone={openToday.length ? "accent" : "sage"}
            />
            <StatCard
              label="Scheduled hours"
              value={`${weekHours.toFixed(1)}h`}
              hint={`${openWeek.length} open across the week`}
              icon={<Clock3 className="size-4" />}
              tone="gold"
            />
            <StatCard
              label="Labor this week"
              value={compactMoney(laborCost)}
              hint="Hourly staff, before tax"
              icon={<Wallet className="size-4" />}
              tone="neutral"
            />
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_1fr]">
            <section className="panel-raised overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <div>
                  <p className="text-sm font-semibold">On the floor today</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {assignedToday.length} assigned · {openToday.length} open
                  </p>
                </div>
                <Link href="/schedule" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-deep">
                  Full schedule <ArrowUpRight className="size-3" />
                </Link>
              </div>
              <div className="divide-y divide-line">
                {todayShifts.length === 0 && (
                  <div className="p-5">
                    <EmptyState
                      icon={<CalendarPlus className="size-5" />}
                      title="Nothing scheduled today"
                      description="Build the week or add a shift for today."
                      action={
                        <Link href="/schedule?new=1">
                          <Button size="sm"><Plus className="size-3.5" /> Add shift</Button>
                        </Link>
                      }
                    />
                  </div>
                )}
                {onFloor.slice(0, 10).map((shift) => (
                  <div key={shift.id} className="px-5 py-3">
                    <ShiftRow shift={shift} tz={tz} href="/schedule" />
                  </div>
                ))}
              </div>
            </section>

            <div className="space-y-5">
              <section className="panel-raised">
                <div className="flex items-center justify-between border-b border-line px-5 py-4">
                  <p className="text-sm font-semibold">Needs attention</p>
                  <Badge tone={openToday.length + timeOff.length + draftCount > 0 ? "accent" : "success"}>
                    {openToday.length + timeOff.length + draftCount > 0 ? "Action" : "Clear"}
                  </Badge>
                </div>
                <div className="space-y-1 p-2">
                  {[
                    { href: "/schedule", icon: CalendarPlus, label: "Open shifts today", value: openToday.length },
                    { href: "/schedule", icon: CalendarDays, label: "Draft shifts this week", value: draftCount },
                    { href: "/requests", icon: Inbox, label: "Time off requests", value: timeOff.length },
                    { href: "/timesheets", icon: Clock3, label: "Timesheets to approve", value: timesheets.filter((s) => s.status === "submitted" || s.status === "open").length },
                  ].map((row) => (
                    <Link
                      key={row.label}
                      href={row.href}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-black/[0.03]"
                    >
                      <span className="rounded-md bg-[#eeeae0] p-1.5 text-muted">
                        <row.icon className="size-3.5" />
                      </span>
                      <span className="flex-1 text-xs font-medium">{row.label}</span>
                      <span className={`text-sm font-semibold tabular ${row.value ? "text-accent" : "text-muted"}`}>
                        {row.value}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>

              <section className="panel-raised">
                <div className="flex items-center justify-between border-b border-line px-5 py-4">
                  <p className="text-sm font-semibold">Recent punches</p>
                  <Link href="/timeclock" className="text-xs font-medium text-accent hover:text-accent-deep">
                    Time clock
                  </Link>
                </div>
                <div className="divide-y divide-line">
                  {punches.slice(0, 6).map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-5 py-2.5">
                      <span className={`size-1.5 rounded-full ${p.type === "in" ? "bg-sage" : "bg-accent"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{fullName(p.expand?.employee)}</p>
                        <p className="text-[10px] text-muted">
                          {p.type === "in" ? "Clocked in" : "Clocked out"} · {p.expand?.location?.name || "—"}
                        </p>
                      </div>
                      <span className="font-mono text-[10px] text-muted">{formatTime(p.punched_at, tz)}</span>
                    </div>
                  ))}
                  {punches.length === 0 && (
                    <p className="px-5 py-6 text-center text-xs text-muted">No punches yet today.</p>
                  )}
                </div>
              </section>
            </div>
          </div>
        </>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
          <div className="space-y-5">
            <section className="panel-raised">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <div>
                  <p className="text-sm font-semibold">Your week</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {myShifts.length} shift{myShifts.length === 1 ? "" : "s"} · {hours(myShifts.reduce((sum, s) => sum + durationHours(s.starts_at, s.ends_at), 0))} scheduled
                  </p>
                </div>
                <Link href="/schedule" className="text-xs font-medium text-accent hover:text-accent-deep">
                  View schedule
                </Link>
              </div>
              <div className="space-y-2 p-4">
                {myShifts.length === 0 && (
                  <EmptyState title="No shifts scheduled" description="Your manager has not published this week's roster yet." />
                )}
                {myShifts.slice(0, 5).map((shift) => (
                  <ShiftRow key={shift.id} shift={shift} tz={tz} showDate href="/schedule" />
                ))}
              </div>
            </section>

            <section className="panel-raised">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <p className="text-sm font-semibold">This week&apos;s time</p>
                <Link href="/timesheets" className="text-xs font-medium text-accent hover:text-accent-deep">
                  Timesheet
                </Link>
              </div>
              <div className="grid grid-cols-3 divide-x divide-line">
                <div className="px-5 py-4">
                  <p className="eyebrow">Regular</p>
                  <p className="mt-1 text-xl font-semibold tabular">{hours(currentSheet?.regular_hours || 0)}</p>
                </div>
                <div className="px-5 py-4">
                  <p className="eyebrow">Overtime</p>
                  <p className="mt-1 text-xl font-semibold tabular">{hours(currentSheet?.overtime_hours || 0)}</p>
                </div>
                <div className="px-5 py-4">
                  <p className="eyebrow">Time off</p>
                  <p className="mt-1 text-xl font-semibold tabular">{hours(currentSheet?.pto_hours || 0)}</p>
                </div>
              </div>
              <div className="border-t border-line px-5 py-3">
                <p className="text-xs text-muted">
                  {currentSheet ? `Status: ${titleCase(currentSheet.status)}` : "No timesheet for this week yet. Your manager generates them from punches."}
                </p>
              </div>
            </section>
          </div>

          <div className="space-y-5">
            <ClockCard />

            <section className="panel-raised p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Time off balance</p>
                <Sun className="size-4 text-gold" />
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight tabular">
                {hours(employee?.pto_balance_hours || 0)}
              </p>
              <p className="mt-1 text-xs text-muted">Available paid time off</p>
              <div className="mt-4 space-y-2">
                {timeOff.slice(0, 3).map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg bg-[#f4f1e9] px-3 py-2">
                    <div>
                      <p className="text-xs font-medium">{titleCase(r.type)}</p>
                      <p className="text-[10px] text-muted">
                        {toDate(r.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                        {r.start_date.slice(0, 10) !== r.end_date.slice(0, 10) && ` – ${toDate(r.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`}
                      </p>
                    </div>
                    <Badge tone={r.status === "approved" ? "success" : r.status === "denied" ? "danger" : "warning"}>
                      {r.status}
                    </Badge>
                  </div>
                ))}
                {timeOff.length === 0 && <p className="text-xs text-muted">No requests on file.</p>}
              </div>
              <Link href="/requests" className="mt-4 block">
                <Button variant="outline" className="w-full" size="sm">
                  <CalendarPlus className="size-3.5" /> Request time off
                </Button>
              </Link>
            </section>

            {next && (
              <section className="panel-raised p-5">
                <p className="eyebrow mb-3">Next up</p>
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-[#efe9db] p-2 text-ink">
                    <MapPin className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{next.expand?.position?.name || "Shift"}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {toDate(next.starts_at).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: tz })}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {formatTime(next.starts_at, tz)} – {formatTime(next.ends_at, tz)} · {next.expand?.location?.name}
                    </p>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
