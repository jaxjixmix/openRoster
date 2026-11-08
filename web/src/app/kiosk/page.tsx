"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Clock3, Coffee, Delete, LogIn, LogOut, Maximize2, RefreshCw, Search, WifiOff } from "lucide-react";
import { pb } from "@/lib/pb";
import { Avatar, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/dates";
import { enqueueKioskPunch, getKioskQueue, removeKioskPunch } from "@/lib/kiosk-offline";

type PunchAction = "in" | "out" | "break_start" | "break_end";

interface KioskEmployee {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  position?: string;
  has_pin: boolean;
  clocked_in: boolean;
  on_break: boolean;
  last_punch_at?: string;
}

interface Roster {
  device: { id: string; name: string; location: string; location_name: string; last_seen?: string };
  company: { id: string; name: string; timezone: string; locale?: string };
  employees: KioskEmployee[];
}

const TOKEN_KEY = "openroster.kiosk.token";

export default function KioskPage() {
  const [token, setToken] = useState("");
  const [roster, setRoster] = useState<Roster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [pairBusy, setPairBusy] = useState(false);
  const [selected, setSelected] = useState<KioskEmployee | null>(null);
  const [action, setAction] = useState<PunchAction | null>(null);
  const [pin, setPin] = useState("");
  const [punchBusy, setPunchBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [search, setSearch] = useState("");
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (deviceToken = token) => {
    if (!deviceToken) return;
    try {
      const data = await pb.send<Roster>("/api/openroster/kiosk/roster", {
        method: "GET",
        headers: { "X-Kiosk-Token": deviceToken },
      });
      setRoster(data);
      setError("");
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        setToken("");
        setRoster(null);
        setError("This tablet was unpaired. Ask a manager for a new code.");
      } else {
        setError(err instanceof Error ? err.message : "Could not reach OpenRoster.");
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY) || "";
    setToken(saved);
    if (saved) void load(saved);
    else setLoading(false);
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const syncQueue = useCallback(async () => {
    if (!token) return;
    const pending = getKioskQueue();
    let synced = 0;
    for (const item of pending) {
      try {
        await pb.send("/api/openroster/kiosk/punch", {
          method: "POST",
          headers: { "X-Kiosk-Token": token },
          body: {
            employee: item.employee,
            type: item.type,
            client_id: item.id,
            punched_at: item.punched_at,
            offline: true,
          },
        });
        removeKioskPunch(item.id);
        synced++;
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 400 || status === 409 || status === 422) {
          removeKioskPunch(item.id);
        } else {
          break;
        }
      }
    }
    setQueued(getKioskQueue().length);
    if (synced) await load();
  }, [token, load]);

  useEffect(() => {
    setQueued(getKioskQueue().length);
    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void syncQueue();
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [syncQueue]);

  useEffect(() => {
    let wakeLock: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        const wake = navigator as Navigator & { wakeLock?: { request: (type: string) => Promise<{ release: () => Promise<void> }> } };
        wakeLock = (await wake.wakeLock?.request("screen")) || null;
      } catch {}
    };
    void request();
    const visibility = () => { if (document.visibilityState === "visible") void request(); };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      void wakeLock?.release();
    };
  }, []);

  const backToIdle = useCallback(() => {
    setSelected(null);
    setAction(null);
    setPin("");
    setNotice("");
  }, []);

  useEffect(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (!selected && !notice) return;
    idleTimer.current = setTimeout(backToIdle, 20000);
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [selected, notice, backToIdle]);

  async function pair(e: React.FormEvent) {
    e.preventDefault();
    setPairBusy(true);
    setError("");
    try {
      const result = await pb.send<{ token: string }>("/api/openroster/kiosk/pair", {
        method: "POST",
        body: { code: pairCode.trim() },
      });
      localStorage.setItem(TOKEN_KEY, result.token);
      setToken(result.token);
      setPairCode("");
      await load(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not pair this tablet.");
    } finally {
      setPairBusy(false);
    }
  }

  const timezone = roster?.company.timezone || "America/Los_Angeles";
  const timeLabel = new Date(now).toLocaleTimeString(roster?.company.locale || "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
  const dateLabel = new Date(now).toLocaleDateString(roster?.company.locale || "en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  });

  const visibleEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (roster?.employees || []).filter((employee) => !query || employee.name.toLowerCase().includes(query));
  }, [roster, search]);

  function beginPunch(employee: KioskEmployee, nextAction: PunchAction) {
    if (!navigator.onLine) {
      enqueueKioskPunch({
        employee: employee.id,
        employee_name: employee.name,
        type: nextAction,
        punched_at: new Date().toISOString(),
      });
      setQueued(getKioskQueue().length);
      setNotice(`Punch queued · ${employee.name}`);
      setSelected(null);
      setAction(null);
      setPin("");
      setError("");
      setTimeout(backToIdle, 4500);
      return;
    }
    setSelected(employee);
    setAction(nextAction);
    setPin("");
    setError("");
    setNotice("");
  }

  function actionLabel(value: PunchAction) {
    return value === "in" ? "Clocked in" : value === "out" ? "Clocked out" : value === "break_start" ? "Break started" : "Break ended";
  }

  async function submitPunch() {
    if (!selected || !action) return;
    if (!navigator.onLine) {
      enqueueKioskPunch({ employee: selected.id, employee_name: selected.name, type: action, punched_at: new Date().toISOString() });
      setQueued(getKioskQueue().length);
      setNotice(`Punch queued · ${selected.name}`);
      setSelected(null);
      setAction(null);
      setPin("");
      setTimeout(backToIdle, 4500);
      return;
    }
    if (pin.length < 4) { setError("Enter the employee's 4–8 digit PIN."); return; }
    setPunchBusy(true);
    setError("");
    try {
      await pb.send("/api/openroster/kiosk/punch", {
        method: "POST",
        headers: { "X-Kiosk-Token": token },
        body: { employee: selected.id, type: action, pin },
      });
      setNotice(`${actionLabel(action)} · ${selected.name}`);
      setSelected(null);
      setAction(null);
      setPin("");
      await load();
      setTimeout(backToIdle, 4500);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 401) setError("Incorrect PIN. Try again.");
      else setError(err instanceof Error ? err.message : "Could not record the punch.");
      setPin("");
    } finally {
      setPunchBusy(false);
    }
  }

  function fullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-night text-[#f4f1e8]">
        <div className="text-center">
          <KioskMark />
          <p className="mt-4 text-sm text-[#a7a18f]">Opening the time clock…</p>
        </div>
      </main>
    );
  }

  if (!token || !roster) {
    return (
      <main className="min-h-screen bg-night text-[#f4f1e8]">
        <div className="grid min-h-screen lg:grid-cols-[1.1fr_.9fr]">
          <section className="relative hidden flex-col justify-between overflow-hidden border-r border-white/10 p-10 lg:flex lg:p-16">
            <div className="absolute inset-0 opacity-[0.045]" style={{ backgroundImage: "linear-gradient(#f4f1e8 1px, transparent 1px), linear-gradient(90deg, #f4f1e8 1px, transparent 1px)", backgroundSize: "44px 44px" }} />
            <div className="relative">
              <div className="flex items-center gap-3">
                <KioskMark />
                <div>
                  <p className="text-lg font-semibold tracking-tight">OpenRoster</p>
                  <p className="text-[11px] text-[#a7a18f]">Workforce, self-hosted</p>
                </div>
              </div>
            </div>
            <div className="relative max-w-xl">
              <h1 className="mt-4 text-5xl font-semibold leading-[1.02] tracking-[-0.045em] xl:text-6xl">Time clock,<br />ready for the floor.</h1>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-[#a7a18f]">
                Pair a shared iPad or Android tablet to the site. Staff clock in with a PIN; every punch flows into the same timesheet.
              </p>
              <div className="mt-10 space-y-4 text-sm text-[#cfc9b9]">
                <p><span className="mr-3 font-mono text-[#c4512c]">01</span> A manager opens Settings → Kiosk mode.</p>
                <p><span className="mr-3 font-mono text-[#c4512c]">02</span> Generate a six-digit pairing code.</p>
                <p><span className="mr-3 font-mono text-[#c4512c]">03</span> Enter it here, once, on this tablet.</p>
              </div>
            </div>
            <p className="relative text-[10px] leading-relaxed text-[#6f6a5b]">Alpha software. Payroll is a preview/export, not tax filing or direct deposit.</p>
          </section>

          <section className="flex items-center justify-center bg-paper px-6 py-12 text-ink">
            <div className="w-full max-w-md">
              <div className="mb-8 flex items-center gap-3 lg:hidden">
                <KioskMark />
                <p className="text-lg font-semibold tracking-tight">OpenRoster</p>
              </div>
              <div className="panel-raised p-7 sm:p-8">
                <h2 className="text-3xl font-semibold tracking-[-0.04em]">Pair this tablet</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Ask a manager for a pairing code in Settings → Kiosk mode. It expires in 10 minutes.
                </p>
                <form onSubmit={pair} className="mt-7">
                  <label htmlFor="pair-code" className="text-[10px] uppercase tracking-[0.16em] text-muted">Six-digit code</label>
                  <input
                    id="pair-code"
                    value={pairCode}
                    onChange={(event) => setPairCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    className="mt-2 w-full rounded-xl border border-line bg-[#fbf8f0] px-4 py-4 text-center font-mono text-4xl tracking-[0.35em] text-ink outline-none transition focus:border-line-strong focus:ring-2 focus:ring-accent/20"
                  />
                  {error && <p className="mt-3 rounded-lg border border-[#eccac4] bg-[#f9eeec] px-3 py-2 text-sm text-[#8e342b]">{error}</p>}
                  <Button type="submit" size="lg" className="mt-4 w-full" loading={pairBusy} disabled={pairCode.length !== 6}>
                    Pair tablet
                  </Button>
                </form>
                <p className="mt-5 text-[10px] leading-relaxed text-muted">Device tokens are clock-only and revocable from Settings.</p>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const working = roster.employees.filter((employee) => employee.clocked_in && !employee.on_break).length;
  const onBreak = roster.employees.filter((employee) => employee.on_break).length;
  const off = roster.employees.length - working - onBreak;

  return (
    <main className="min-h-screen bg-night text-[#f4f1e8]">
      <div className="grid min-h-screen lg:grid-cols-[340px_1fr]">
        <aside className="relative hidden flex-col overflow-hidden border-r border-white/10 p-8 lg:flex">
          <div className="absolute inset-0 opacity-[0.035]" style={{ backgroundImage: "linear-gradient(#f4f1e8 1px, transparent 1px), linear-gradient(90deg, #f4f1e8 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
          <div className="relative flex items-center gap-3">
            <KioskMark />
            <div>
              <p className="text-lg font-semibold tracking-tight">OpenRoster</p>
              <p className="text-[11px] text-[#a7a18f]">{roster.device.name}</p>
            </div>
          </div>

          <div className="relative mt-14">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#8e8878]">{roster.device.location_name}</p>
            <p className="mt-3 whitespace-nowrap font-mono text-[56px] font-semibold leading-none tracking-[-0.06em] tabular">{timeLabel}</p>
            <p className="mt-3 text-sm text-[#a7a18f]">{dateLabel}</p>
          </div>

          <div className="relative mt-10 grid grid-cols-2 gap-2.5">
            <Metric value={working} label="Working" />
            <Metric value={onBreak} label="On break" />
            <Metric value={off} label="Off shift" />
            <Metric value={queued} label="Queued" />
          </div>

          <div className="relative mt-auto space-y-5">
            <div className="flex items-center gap-2 text-[11px] text-[#a7a18f]">
              <span className={cn("size-1.5 rounded-full", online ? "bg-[#7fc79a]" : "bg-[#e6a67a]")} />
              {online ? "Connected" : "Offline · punches queue here"}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={() => void load()} aria-label="Refresh roster" className="border-white/15 bg-white/5 text-[#f4f1e8] hover:bg-white/10"><RefreshCw className="size-4" /></Button>
              <Button variant="outline" size="icon" onClick={fullscreen} aria-label="Fullscreen" className="border-white/15 bg-white/5 text-[#f4f1e8] hover:bg-white/10"><Maximize2 className="size-4" /></Button>
            </div>
            <p className="text-[10px] leading-relaxed text-[#6f6a5b]">Alpha · payroll preview only</p>
          </div>
        </aside>

        <section className="min-h-screen bg-paper px-5 py-5 text-ink sm:px-8 lg:px-10 lg:py-8">
          <div className="mb-6 flex items-start justify-between gap-4 lg:hidden">
            <div>
              <p className="text-lg font-semibold tracking-tight">{roster.company.name}</p>
              <p className="text-[11px] text-muted">{roster.device.location_name} · {online ? "online" : "offline"}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-2xl font-semibold tabular">{timeLabel}</p>
              <p className="text-[10px] text-muted">{dateLabel}</p>
            </div>
          </div>

          {!online && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#e8d4a8] bg-[#fbf4e4] px-4 py-3 text-sm text-[#6b5218]">
              <WifiOff className="size-4 shrink-0" /> Offline. Punches queue on this tablet and sync when it reconnects; PIN checks happen on sync.
            </div>
          )}
          {queued > 0 && (
            <div className="mb-4 flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 text-sm">
              <span>{queued} punch{queued === 1 ? "" : "es"} waiting to sync.</span>
              <span className="text-[11px] text-muted">Keep this tab open.</span>
            </div>
          )}
          {error && !(selected && action) && <div className="mb-4 rounded-xl border border-[#eccac4] bg-[#f9eeec] px-4 py-3 text-sm text-[#8e342b]">{error}</div>}

          {notice ? (
            <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center">
              <section className="w-full max-w-2xl panel-raised p-10 text-center sm:p-14">
                <div className="mx-auto grid size-24 place-items-center rounded-full bg-[#dcebdd] text-sage"><Check className="size-11" /></div>
                <h1 className="mt-7 text-4xl font-semibold tracking-[-0.045em]">{notice.split(" · ")[0]}</h1>
                <p className="mt-2 text-lg text-muted">{notice.split(" · ")[1]}</p>
                <p className="mt-8 font-mono text-sm tabular text-muted">{timeLabel} · returning to the roster</p>
                <div className="mx-auto mt-4 flex justify-center gap-1.5">
                  {[0,1,2].map((dot) => <span key={dot} className="size-1.5 rounded-full bg-line" />)}
                </div>
              </section>
            </div>
          ) : selected && action ? (
            <div className="mx-auto max-w-5xl">
              <Button variant="ghost" size="sm" onClick={backToIdle} className="-ml-2"><ArrowLeft className="size-4" /> Roster</Button>
              <div className="mt-6 grid gap-4 lg:min-h-[calc(100dvh-12rem)] lg:grid-cols-[.85fr_1.15fr] lg:items-center">
                <EmployeePanel employee={selected} tz={timezone} className="panel-raised p-6 lg:p-8" />
                <section className="panel-raised p-6 lg:p-8">
                  <p className="text-sm font-semibold">Enter your PIN</p>
                  <p className="mt-1 text-xs text-muted">{action === "in" ? "Clock in" : action === "out" ? "Clock out" : action === "break_start" ? "Start break" : "End break"} · records at {timeLabel}</p>
                  <div className="mt-6 grid grid-cols-3 gap-2">
                    {[1,2,3,4,5,6,7,8,9].map((digit) => (
                      <button key={digit} onClick={() => setPin((value) => (value + digit).slice(0, 8))} className="rounded-xl border border-line bg-surface py-5 font-mono text-2xl font-semibold transition hover:border-line-strong hover:bg-[#fbf6ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30">{digit}</button>
                    ))}
                    <button onClick={() => setPin((value) => value.slice(0, -1))} aria-label="Backspace" className="rounded-xl border border-line bg-surface py-5 text-muted transition hover:border-line-strong hover:bg-[#fbf6ec]"><Delete className="mx-auto size-5" /></button>
                    <button onClick={() => setPin((value) => (value + "0").slice(0, 8))} className="rounded-xl border border-line bg-surface py-5 font-mono text-2xl font-semibold transition hover:border-line-strong hover:bg-[#fbf6ec]">0</button>
                    <button onClick={() => void submitPunch()} disabled={punchBusy || pin.length < 4} className="rounded-xl bg-ink py-5 font-semibold text-[#f4f1e8] transition hover:bg-[#2a2a22] disabled:opacity-40">{punchBusy ? "Saving…" : "OK"}</button>
                  </div>
                  <div className="mt-5 flex justify-center gap-2">
                    {Array.from({ length: 4 }, (_, index) => (
                      <span key={index} className={cn("size-2 rounded-full transition", pin.length > index ? "bg-ink" : "bg-line")} />
                    ))}
                  </div>
                  {error && <p className="mt-4 text-center text-xs font-medium text-danger">{error}</p>}
                </section>
              </div>
            </div>
          ) : selected ? (
            <div className="mx-auto max-w-5xl">
              <Button variant="ghost" size="sm" onClick={backToIdle} className="-ml-2"><ArrowLeft className="size-4" /> Roster</Button>
              <div className="mt-6 grid gap-4 lg:min-h-[calc(100dvh-12rem)] lg:grid-cols-[.85fr_1.15fr] lg:items-center">
                <EmployeePanel employee={selected} tz={timezone} className="panel-raised p-6 lg:p-8" />
                <section className="panel-raised p-6 lg:p-8">
                  <p className="text-sm font-semibold">What&apos;s next?</p>
                  <p className="mt-1 text-xs text-muted">Choose an action, then confirm with your PIN. Records at {timeLabel}.</p>
                  <div className="mt-5 space-y-2.5">
                    {!selected.clocked_in && <ActionTile icon={<LogIn className="size-5" />} title="Clock in" hint="Start your shift" onClick={() => beginPunch(selected, "in")} primary />}
                    {selected.clocked_in && !selected.on_break && <ActionTile icon={<Coffee className="size-5" />} title="Start break" hint="Pause the clock" onClick={() => beginPunch(selected, "break_start")} />}
                    {selected.on_break && <ActionTile icon={<Coffee className="size-5" />} title="End break" hint="Back on the floor" onClick={() => beginPunch(selected, "break_end")} primary />}
                    {selected.clocked_in && <ActionTile icon={<LogOut className="size-5" />} title="Clock out" hint="Finish for the day" onClick={() => beginPunch(selected, "out")} />}
                  </div>
                  {!selected.has_pin && <p className="mt-5 rounded-xl border border-[#eccac4] bg-[#f9eeec] px-4 py-3 text-sm text-[#8e342b]">A manager must set a kiosk PIN for this employee before they can clock in.</p>}
                </section>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <h1 className="text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">Tap your name</h1>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">Clock in, take a break, or finish your shift. Your hours land in the timesheet automatically.</p>
                </div>
                <label className="flex h-12 w-full max-w-sm items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-line-strong focus-within:ring-2 focus-within:ring-accent/20">
                  <Search className="size-4 shrink-0 text-muted" />
                  <span className="sr-only">Find your name</span>
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find your name…" className="h-full w-full bg-transparent text-sm outline-none" />
                </label>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px]">
                <span className="inline-flex items-center gap-1.5 text-muted"><span className="size-1.5 rounded-full bg-sage" />{working} working</span>
                <span className="inline-flex items-center gap-1.5 text-muted"><span className="size-1.5 rounded-full bg-gold" />{onBreak} on break</span>
                <span className="inline-flex items-center gap-1.5 text-muted"><span className="size-1.5 rounded-full bg-line" />{off} off shift</span>
              </div>
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {visibleEmployees.map((employee) => (
                  <button
                    key={employee.id}
                    onClick={() => setSelected(employee)}
                    className={cn(
                      "group rounded-2xl border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
                      employee.on_break ? "border-[#eadcb9] bg-[#fbf6e9]" : employee.clocked_in ? "border-[#cfe0d3] bg-[#f4f9f3]" : "border-line bg-surface hover:border-line-strong",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Avatar name={employee.name} id={employee.id} size="lg" />
                      <StatusPill employee={employee} />
                    </div>
                    <p className="mt-5 truncate text-xl font-semibold tracking-[-0.02em]">{employee.name}</p>
                    <p className="truncate text-xs text-muted">{employee.position || "Team member"}</p>
                    <p className="mt-4 flex items-center gap-1.5 text-[11px] text-muted">
                      <Clock3 className="size-3" />
                      {employee.last_punch_at
                        ? `${employee.on_break ? "Break since" : employee.clocked_in ? "Since" : "Last punch"} ${formatTime(employee.last_punch_at, timezone)}`
                        : "No punch today"}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1 text-[11px] font-semibold text-ink/70 transition group-hover:text-ink">
                      {employee.clocked_in ? "Tap for actions" : "Tap to clock in"} <ArrowLeft className="size-3 rotate-180" />
                    </span>
                  </button>
                ))}
              </div>
              {visibleEmployees.length === 0 && <p className="mt-16 text-center text-sm text-muted">No active employees at this location.</p>}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function KioskMark() {
  return (
    <span className="grid size-9 shrink-0 grid-cols-2 gap-1 rounded-lg bg-[#f4f1e8] p-1.5">
      <span className="rounded-[2px] bg-accent" />
      <span className="rounded-[2px] bg-[#1d211c]/30" />
      <span className="rounded-[2px] bg-[#1d211c]/30" />
      <span className="rounded-[2px] bg-[#1d211c]" />
    </span>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3">
      <p className="font-mono text-2xl font-semibold tabular leading-none">{value}</p>
      <p className="mt-1.5 text-[10px] uppercase tracking-[0.12em] text-[#8e8878]">{label}</p>
    </div>
  );
}

function StatusPill({ employee }: { employee: KioskEmployee }) {
  const label = employee.on_break ? "On break" : employee.clocked_in ? "Working" : "Off";
  return (
    <span className={cn(
      "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
      employee.on_break ? "bg-[#f5e8c8] text-[#7a5a16]" : employee.clocked_in ? "bg-[#dcebdd] text-[#2f5a45]" : "bg-[#eeeae0] text-muted",
    )}>{label}</span>
  );
}

function EmployeePanel({ employee, tz, className }: { employee: KioskEmployee; tz: string; className?: string }) {
  return (
    <section className={cn("flex flex-col justify-between", className)}>
      <div>
        <Avatar name={employee.name} id={employee.id} size="xl" />
        <h2 className="mt-5 text-4xl font-semibold tracking-[-0.045em]">{employee.name}</h2>
        <p className="mt-1 text-sm text-muted">{employee.position || "Team member"}</p>
        <div className="mt-4"><StatusPill employee={employee} /></div>
      </div>
      <div className="mt-8 border-t border-line pt-4">
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Latest punch</p>
        <p className="mt-1 text-sm text-ink">
          {employee.last_punch_at
            ? `${formatTime(employee.last_punch_at, tz)} · ${employee.on_break ? "on break" : employee.clocked_in ? "working" : "out"}`
            : "No punch today"}
        </p>
      </div>
    </section>
  );
}

function ActionTile({
  icon,
  title,
  hint,
  onClick,
  primary,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-4 rounded-xl border px-4 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
        primary ? "border-sage bg-sage text-white hover:opacity-90" : "border-line bg-surface hover:border-line-strong hover:bg-[#fbf6ec]",
      )}
    >
      <span className={cn("grid size-9 place-items-center rounded-lg", primary ? "bg-white/15" : "bg-[#f2eee3] text-ink")}>{icon}</span>
      <span>
        <span className="block text-base font-semibold">{title}</span>
        <span className={cn("block text-[11px]", primary ? "text-white/70" : "text-muted")}>{hint}</span>
      </span>
      <ArrowLeft className="ml-auto size-4 rotate-180 opacity-40" />
    </button>
  );
}
