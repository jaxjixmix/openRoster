"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Coffee, Delete, LogIn, LogOut, Maximize2, RefreshCw, WifiOff } from "lucide-react";
import { pb } from "@/lib/pb";
import { Avatar, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
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
    return <main className="grid min-h-screen place-items-center bg-night text-[#f4f1e8]">Loading kiosk…</main>;
  }

  if (!token || !roster) {
    return (
      <main className="grid min-h-screen place-items-center bg-night p-6 text-[#f4f1e8]">
        <div className="w-full max-w-md">
          <p className="eyebrow text-[#a7a18f]">OpenRoster</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">Pair this tablet</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#a7a18f]">
            Ask a manager for a pairing code in Settings → Kiosk mode. The code expires in 10 minutes.
          </p>
          <form onSubmit={pair} className="mt-8 space-y-4">
            <label htmlFor="pair-code" className="text-[11px] uppercase tracking-[0.16em] text-[#a7a18f]">Six-digit code</label>
            <input
              id="pair-code"
              value={pairCode}
              onChange={(event) => setPairCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-4 text-center font-mono text-4xl tracking-[0.35em] text-white outline-none focus:border-accent"
            />
            {error && <p className="text-sm text-[#ec9a8a]">{error}</p>}
            <Button type="submit" size="lg" className="w-full" loading={pairBusy} disabled={pairCode.length !== 6}>
              Pair tablet
            </Button>
          </form>
          <p className="mt-8 text-[10px] leading-relaxed text-[#6f6a5b]">Alpha software. Payroll here is preview/export only.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f1e8] px-6 py-5 text-ink sm:px-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="eyebrow">Time clock · {roster.device.name}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">{roster.company.name}</h1>
          <p className="mt-1 text-xs text-muted">
            {roster.device.location_name} · {online ? "online" : "offline — punches queue on this tablet"} · {queued} queued
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-4xl font-semibold tabular tracking-[-0.04em]">{timeLabel}</p>
          <p className="text-xs text-muted">{dateLabel}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => void load()} aria-label="Refresh"><RefreshCw className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={fullscreen} aria-label="Fullscreen"><Maximize2 className="size-4" /></Button>
        </div>
      </header>

      {!online && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#eccac4] bg-[#f9eeec] px-4 py-3 text-sm text-[#8e342b]">
          <WifiOff className="size-4" /> No connection. Punches are queued on this tablet and sync when it reconnects; the PIN check happens on sync.
        </div>
      )}
      {error && <p className="mt-4 rounded-xl border border-[#eccac4] bg-[#f9eeec] px-4 py-3 text-sm text-[#8e342b]">{error}</p>}

      {notice ? (
        <section className="mt-16 text-center">
          <div className="mx-auto grid size-20 place-items-center rounded-full bg-[#dcebdd] text-sage"><Check className="size-9" /></div>
          <h2 className="mt-6 text-4xl font-semibold tracking-[-0.04em]">{notice}</h2>
          <p className="mt-2 text-sm text-muted">Returning to the roster…</p>
        </section>
      ) : selected && action ? (
        <section className="mx-auto mt-10 max-w-md">
          <Button variant="ghost" size="sm" onClick={backToIdle}><ArrowLeft className="size-4" /> Back</Button>
          <div className="mt-5 text-center">
            <Avatar name={selected.name} id={selected.id} size="lg" />
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em]">{selected.name}</h2>
            <p className="mt-1 text-sm text-muted">{action === "in" ? "Clock in" : action === "out" ? "Clock out" : action === "break_start" ? "Start break" : "End break"} · enter PIN</p>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-2">
            {[1,2,3,4,5,6,7,8,9].map((digit) => (
              <button key={digit} onClick={() => setPin((value) => (value + digit).slice(0, 8))} className="rounded-xl border border-line bg-surface py-5 font-mono text-2xl font-semibold transition hover:bg-[#fbf6ec]">{digit}</button>
            ))}
            <button onClick={() => setPin((value) => value.slice(0, -1))} aria-label="Backspace" className="rounded-xl border border-line bg-surface py-5 text-muted transition hover:bg-[#fbf6ec]"><Delete className="mx-auto size-5" /></button>
            <button onClick={() => setPin((value) => (value + "0").slice(0, 8))} className="rounded-xl border border-line bg-surface py-5 font-mono text-2xl font-semibold transition hover:bg-[#fbf6ec]">0</button>
            <button onClick={() => void submitPunch()} disabled={punchBusy || pin.length < 4} className="rounded-xl bg-ink py-5 font-semibold text-[#f4f1e8] transition disabled:opacity-40">{punchBusy ? "…" : "OK"}</button>
          </div>
          <div className="mt-4 flex justify-center gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <span key={index} className={cn("size-2 rounded-full", pin.length > index ? "bg-ink" : "bg-line")} />
            ))}
          </div>
        </section>
      ) : selected ? (
        <section className="mx-auto mt-10 max-w-2xl">
          <Button variant="ghost" size="sm" onClick={backToIdle}><ArrowLeft className="size-4" /> Back</Button>
          <div className="mt-5 text-center">
            <Avatar name={selected.name} id={selected.id} size="lg" />
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em]">{selected.name}</h2>
            <p className="mt-1 text-sm text-muted">{selected.position || "Team member"}</p>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {!selected.clocked_in && <button onClick={() => beginPunch(selected, "in")} className="rounded-2xl bg-sage px-6 py-8 text-left text-white transition hover:opacity-90"><LogIn className="size-6" /><span className="mt-4 block text-2xl font-semibold">Clock in</span></button>}
            {selected.clocked_in && !selected.on_break && <button onClick={() => beginPunch(selected, "break_start")} className="rounded-2xl border border-line bg-surface px-6 py-8 text-left transition hover:bg-[#fbf6ec]"><Coffee className="size-6 text-gold" /><span className="mt-4 block text-2xl font-semibold">Start break</span></button>}
            {selected.on_break && <button onClick={() => beginPunch(selected, "break_end")} className="rounded-2xl bg-gold px-6 py-8 text-left text-white transition hover:opacity-90"><Coffee className="size-6" /><span className="mt-4 block text-2xl font-semibold">End break</span></button>}
            {selected.clocked_in && <button onClick={() => beginPunch(selected, "out")} className="rounded-2xl border border-line bg-surface px-6 py-8 text-left transition hover:bg-[#fbf6ec]"><LogOut className="size-6 text-accent" /><span className="mt-4 block text-2xl font-semibold">Clock out</span></button>}
          </div>
          {!selected.has_pin && <p className="mt-4 rounded-xl border border-[#eccac4] bg-[#f9eeec] px-4 py-3 text-sm text-[#8e342b]">A manager must set a kiosk PIN for this employee before they can clock in.</p>}
        </section>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Tap your name to clock in or out.</p>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find your name…" className="h-11 w-full max-w-xs rounded-xl border border-line bg-surface px-4 text-sm outline-none focus:border-line-strong" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visibleEmployees.map((employee) => (
              <button key={employee.id} onClick={() => setSelected(employee)} className={cn("rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-line-strong hover:shadow-sm", employee.clocked_in && "border-[#cfe0d3] bg-[#f3f8f2]")}>
                <div className="flex items-start justify-between gap-2">
                  <Avatar name={employee.name} id={employee.id} size="md" />
                  <span className={cn("mt-1 size-2 rounded-full", employee.on_break ? "bg-gold" : employee.clocked_in ? "animate-pulse bg-sage" : "bg-line")} />
                </div>
                <p className="mt-3 truncate text-base font-semibold">{employee.name}</p>
                <p className="truncate text-[11px] text-muted">{employee.position || "Team member"}</p>
                <p className="mt-2 text-[10px] font-medium uppercase tracking-wider text-muted">
                  {employee.on_break ? "On break" : employee.clocked_in ? "Working" : "Off"}
                </p>
              </button>
            ))}
          </div>
          {visibleEmployees.length === 0 && <p className="mt-12 text-center text-sm text-muted">No active employees at this location.</p>}
        </>
      )}
    </main>
  );
}
