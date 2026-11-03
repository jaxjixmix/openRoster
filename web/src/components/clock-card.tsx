"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, Coffee, LogIn, LogOut, MapPin, RefreshCw, WifiOff } from "lucide-react";
import { pb } from "@/lib/pb";
import { getPunchesBetween, errorMessage } from "@/lib/data";
import { addDaysStr, dateInTz, formatTime, toDate, todayIn, toUtcIso, tzOffsetForDate } from "@/lib/dates";
import { enqueuePunch, getQueuedPunches, removeQueuedPunch, type QueuedPunchType } from "@/lib/offline-punches";
import type { Punch } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { Button, ErrorNote } from "@/components/ui";
import { useToast } from "@/lib/toast";

function elapsedLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ClockCard({
  employeeId,
  compact = false,
  onChanged,
}: {
  employeeId?: string;
  compact?: boolean;
  onChanged?: () => void;
}) {
  const { employee, company, isManager } = useAuth();
  const toast = useToast();
  const tz = company?.timezone || "America/Los_Angeles";
  const locale = company?.locale || "en-US";
  const targetId = employeeId || employee?.id;
  const [punches, setPunches] = useState<Punch[]>([]);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [queuedCount, setQueuedCount] = useState(0);

  const queuedPunchesToday = useCallback((): Punch[] => {
    if (!targetId) return [];
    const todayKey = todayIn(tz);
    return getQueuedPunches(targetId)
      .filter((item) => dateInTz(item.punched_at, tz) === todayKey)
      .map((item): Punch => ({
        id: `offline:${item.id}`,
        collectionId: "",
        collectionName: "punches",
        created: "",
        updated: "",
        employee: item.employee,
        type: item.type,
        punched_at: item.punched_at,
        source: "offline",
        queued: true,
      }));
  }, [targetId, tz]);

  const load = useCallback(async () => {
    if (!targetId) return;
    try {
      const today = todayIn(tz);
      const start = toUtcIso(today, "00:00", tz);
      const end = toUtcIso(addDaysStr(today, 1), "00:00", tz);
      const rows = await getPunchesBetween(targetId, start, end);
      const queued = queuedPunchesToday();
      setPunches([...rows, ...queued].sort((a, b) => +toDate(a.punched_at) - +toDate(b.punched_at)));
      setQueuedCount(getQueuedPunches(targetId).length);
      setError("");
    } catch (err) {
      const queued = queuedPunchesToday();
      setPunches(queued.sort((a, b) => +toDate(a.punched_at) - +toDate(b.punched_at)));
      setQueuedCount(getQueuedPunches(targetId).length);
      setError(navigator.onLine ? errorMessage(err) : "");
    } finally {
      setLoading(false);
    }
  }, [targetId, tz, queuedPunchesToday]);

  const sync = useCallback(async () => {
    if (!targetId) return;
    const pending = getQueuedPunches(targetId);
    if (!pending.length) {
      setQueuedCount(0);
      return;
    }
    let synced = 0;
    let rejected = 0;
    for (const item of pending) {
      try {
        await pb.send("/api/openroster/clock", {
          method: "POST",
          body: {
            type: item.type,
            employee: employeeId || undefined,
            source: "offline",
            offset_minutes: item.offset_minutes,
            lat: item.lat,
            lng: item.lng,
            punched_at: item.punched_at,
            client_id: item.id,
          },
        });
        removeQueuedPunch(item.id);
        synced++;
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 400 || status === 409 || status === 422) {
          removeQueuedPunch(item.id);
          rejected++;
        } else {
          break;
        }
      }
    }
    setQueuedCount(getQueuedPunches(targetId).length);
    if (synced) {
      toast(`${synced} offline punch${synced === 1 ? "" : "es"} synced.`);
      await load();
      onChanged?.();
    }
    if (rejected) setError(`${rejected} offline punch${rejected === 1 ? "" : "es"} could not be applied because the clock state changed.`);
  }, [targetId, employeeId, load, onChanged, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function update() {
      setOnline(navigator.onLine);
      if (navigator.onLine) void sync();
    }
    setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if (navigator.onLine) void sync();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [sync]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!targetId) return;
    let unsub: (() => void) | undefined;
    pb.collection("punches")
      .subscribe("*", () => void load())
      .then((fn) => {
        unsub = fn;
      })
      .catch(() => {});
    return () => unsub?.();
  }, [targetId, load]);

  const latestType = punches.length ? punches[punches.length - 1].type : "";
  const clockedIn = latestType === "in" || latestType === "break_start" || latestType === "break_end";
  const onBreak = latestType === "break_start";

  const currentInAt = useMemo(() => {
    for (let i = punches.length - 1; i >= 0; i--) {
      if (punches[i].type === "in") return +toDate(punches[i].punched_at);
      if (punches[i].type === "out") return null;
    }
    return null;
  }, [punches]);

  const workedMs = useMemo(() => {
    let total = 0;
    let openAt: number | null = null;
    let breakAt: number | null = null;
    let breakMs = 0;
    for (const p of punches) {
      const t = +toDate(p.punched_at);
      if (p.type === "in") {
        openAt = t;
        breakAt = null;
        breakMs = 0;
      } else if (p.type === "break_start") {
        breakAt = t;
      } else if (p.type === "break_end") {
        if (breakAt !== null) {
          breakMs += Math.max(0, t - breakAt);
          breakAt = null;
        }
      } else if (p.type === "out" && openAt !== null) {
        total += Math.max(0, t - openAt - breakMs);
        openAt = null;
        breakAt = null;
        breakMs = 0;
      }
    }
    if (openAt !== null) {
      total += Math.max(0, now - openAt - breakMs - (breakAt !== null ? now - breakAt : 0));
    }
    return total;
  }, [punches, now]);

  async function position(): Promise<{ lat?: number; lng?: number }> {
    if (typeof navigator === "undefined" || !navigator.geolocation) return {}
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({}),
        { enableHighAccuracy: false, timeout: 3000, maximumAge: 60000 },
      )
    })
  }

  async function punch(type: QueuedPunchType) {
    setBusy(true);
    setError("");
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        enqueuePunch({
          employee: targetId!,
          type,
          punched_at: new Date().toISOString(),
          offset_minutes: tzOffsetForDate(todayIn(tz), tz),
        });
        setOnline(false);
        await load();
        onChanged?.();
        toast("Saved offline. It will sync when you reconnect.");
        return;
      }
      const coords = await position()
      await pb.send("/api/openroster/clock", {
        method: "POST",
        body: {
          type,
          employee: employeeId || undefined,
          source: "web",
          offset_minutes: tzOffsetForDate(todayIn(tz), tz),
          lat: coords.lat,
          lng: coords.lng,
        },
      });
      await load();
      setQueuedCount(getQueuedPunches(targetId).length);
      onChanged?.();
      toast(
        type === "in" ? "Clocked in."
          : type === "out" ? "Clocked out. Nice work."
            : type === "break_start" ? "Break started."
              : "Break ended.",
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!targetId) {
    return <ErrorNote>No employee profile is linked to this account.</ErrorNote>;
  }

  const todayLabel = new Date().toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: tz,
  });

  return (
    <div className={compact ? "" : "panel-raised overflow-hidden"}>
      <div className={compact ? "" : "relative overflow-hidden bg-night px-6 py-6 text-[#f4f1e8]"}>
        {!compact && (
          <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(#f4f1e8 1px, transparent 1px), linear-gradient(90deg, #f4f1e8 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        )}
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[#a7a18f]">
              <Clock3 className="size-3.5" />
              {onBreak ? "On break" : clockedIn ? "On the clock" : "Time clock"}
            </div>
            <div className="mt-3 font-mono text-[34px] font-medium leading-none tracking-[-0.04em] tabular sm:text-[42px]">
              {clockedIn ? elapsedLabel(workedMs) : todayLabel}
            </div>
            <p className="mt-2 text-xs text-[#a7a18f]">
              {clockedIn
                ? `${onBreak ? "On break since " + formatTime(new Date(punches[punches.length - 1].punched_at).toISOString(), tz) : "Clocked in at " + (currentInAt ? formatTime(new Date(currentInAt).toISOString(), tz) : "—")} · ${(workedMs / 3600000).toFixed(2)}h today`
                : "You are clocked out. Your hours land in this week's timesheet."}
            </p>
          </div>
          <span
            className={`mt-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
              clockedIn
                ? "border-[#4b7a61] bg-[#22382c] text-[#a9d7ba]"
                : "border-white/15 bg-white/5 text-[#a7a18f]"
            }`}
          >
            <span className={`size-1.5 rounded-full ${clockedIn ? "animate-pulse bg-[#7fc79a]" : "bg-[#6d685b]"}`} />
            {onBreak ? "On break" : clockedIn ? "Working" : "Off"}
          </span>
        </div>
      </div>

      <div className={compact ? "mt-4" : "px-5 py-4"}>
        {(!online || queuedCount > 0) && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-[11px] text-ink">
            <WifiOff className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {online
                ? `${queuedCount} punch${queuedCount === 1 ? "" : "es"} waiting to sync.`
                : "Offline. Punches are saved on this device and sync when you reconnect."}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          {!clockedIn && (
            <Button variant="accent" className="flex-1" size="lg" loading={busy} onClick={() => punch("in")}>
              <LogIn className="size-4" /> Clock in
            </Button>
          )}
          {clockedIn && onBreak && (
            <Button variant="accent" className="flex-1" size="lg" loading={busy} onClick={() => punch("break_end")}>
              <Coffee className="size-4" /> End break
            </Button>
          )}
          {clockedIn && !onBreak && (
            <>
              <Button variant="outline" className="flex-1" size="lg" loading={busy} onClick={() => punch("break_start")}>
                <Coffee className="size-4" /> Break
              </Button>
              <Button variant="outline" className="flex-1" size="lg" loading={busy} onClick={() => punch("out")}>
                <LogOut className="size-4" /> Clock out
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" onClick={() => void load()} title="Refresh punches">
            <RefreshCw className="size-4" />
          </Button>
        </div>

        {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

        {punches.length > 0 && (
          <div className={`${compact ? "mt-4" : "mt-4 border-t border-line pt-4"} space-y-2`}>
            <p className="eyebrow">Today&apos;s punches</p>
            <div className="space-y-1.5">
              {punches.slice(-6).map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted">
                    {p.type === "in" ? <LogIn className="size-3 text-sage" /> : p.type === "break_start" ? <Coffee className="size-3 text-gold" /> : p.type === "break_end" ? <Coffee className="size-3 text-sage" /> : <LogOut className="size-3 text-accent" />}
                    {p.type === "in" ? "In" : p.type === "out" ? "Out" : p.type === "break_start" ? "Break" : "Break end"}
                    {p.queued && <span className="rounded bg-gold/20 px-1 text-[9px] uppercase tracking-wide text-ink">queued</span>}
                    {p.expand?.location && (
                      <span className="hidden items-center gap-0.5 text-[10px] text-muted/70 sm:flex">
                        <MapPin className="size-2.5" />
                        {p.expand.location.name}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[11px] tabular text-ink">{formatTime(p.punched_at, tz)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {!loading && punches.length === 0 && !isManager && (
          <p className="mt-3 text-[11px] text-muted">No punches yet today.</p>
        )}
        <p className="mt-3 text-[10px] leading-relaxed text-muted/70">
          Location is checked when your browser shares it. The punch is saved in UTC.
        </p>
      </div>
    </div>
  );
}
