"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, LogIn, LogOut, MapPin, RefreshCw } from "lucide-react";
import { pb } from "@/lib/pb";
import { getPunchesBetween, errorMessage } from "@/lib/data";
import { addDaysStr, formatTime, toDate, todayIn, toUtcIso } from "@/lib/dates";
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
  const targetId = employeeId || employee?.id;
  const [punches, setPunches] = useState<Punch[]>([]);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!targetId) return;
    try {
      const today = todayIn(tz);
      const start = toUtcIso(today, "00:00", tz);
      const end = toUtcIso(addDaysStr(today, 1), "00:00", tz);
      const rows = await getPunchesBetween(targetId, start, end);
      setPunches(rows.sort((a, b) => +toDate(a.punched_at) - +toDate(b.punched_at)));
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [targetId, tz]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const open = useMemo(() => {
    let openAt: number | null = null;
    for (const p of punches) {
      if (p.type === "in") openAt = +toDate(p.punched_at);
      else if (openAt !== null) openAt = null;
    }
    return openAt;
  }, [punches]);

  const workedMs = useMemo(() => {
    let total = 0;
    let openAt: number | null = null;
    for (const p of punches) {
      if (p.type === "in") openAt = +toDate(p.punched_at);
      else if (openAt !== null) {
        total += +toDate(p.punched_at) - openAt;
        openAt = null;
      }
    }
    if (openAt !== null) total += now - openAt;
    return total;
  }, [punches, now]);

  async function punch(type: "in" | "out") {
    setBusy(true);
    setError("");
    try {
      await pb.send("/api/openroster/clock", {
        method: "POST",
        body: { type, employee: employeeId || undefined, source: "web" },
      });
      await load();
      onChanged?.();
      toast(type === "in" ? "Clocked in." : "Clocked out. Nice work.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!targetId) {
    return <ErrorNote>No employee profile is linked to this account.</ErrorNote>;
  }

  const clockedIn = open !== null;
  const todayLabel = new Date().toLocaleTimeString("en-US", {
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
              {clockedIn ? "On the clock" : "Time clock"}
            </div>
            <div className="mt-3 font-mono text-[34px] font-medium leading-none tracking-[-0.04em] tabular sm:text-[42px]">
              {clockedIn ? elapsedLabel(workedMs) : todayLabel}
            </div>
            <p className="mt-2 text-xs text-[#a7a18f]">
              {clockedIn
                ? `Clocked in at ${formatTime(new Date(open).toISOString(), tz)} · ${(workedMs / 3600000).toFixed(2)}h today`
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
            {clockedIn ? "Working" : "Off"}
          </span>
        </div>
      </div>

      <div className={compact ? "mt-4" : "px-5 py-4"}>
        <div className="flex items-center gap-2">
          <Button
            variant={clockedIn ? "outline" : "accent"}
            className="flex-1"
            size="lg"
            loading={busy}
            onClick={() => punch(clockedIn ? "out" : "in")}
          >
            {clockedIn ? <LogOut className="size-4" /> : <LogIn className="size-4" />}
            {clockedIn ? "Clock out" : "Clock in"}
          </Button>
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
                    {p.type === "in" ? <LogIn className="size-3 text-sage" /> : <LogOut className="size-3 text-accent" />}
                    {p.type === "in" ? "In" : "Out"}
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
      </div>
    </div>
  );
}
