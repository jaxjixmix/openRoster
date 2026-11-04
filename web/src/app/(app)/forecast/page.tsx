"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Lightbulb, Save, Sparkles, TriangleAlert } from "lucide-react";
import { pb } from "@/lib/pb";
import { useAuth } from "@/lib/auth";
import { getForecast, getLocations, errorMessage } from "@/lib/data";
import type { Location } from "@/lib/types";
import { addDaysStr, formatDate, todayIn, weekStart, weekdayShort } from "@/lib/dates";
import { hours } from "@/lib/format";
import { useMoney } from "@/lib/currency";
import { Badge, Button, EmptyState, ErrorNote, Input, Label, PageHeader, Select, Spinner, StatCard } from "@/components/ui";
import { useToast } from "@/lib/toast";
import { tzOffsets } from "@/lib/dates";

interface Recommendation {
  date: string;
  covers: number;
  headcount: number;
  hours: number;
  cost: number;
  explanation: string;
}

interface RecommendationResult {
  week_start: string;
  productivity: number;
  days: Recommendation[];
  week_headcount: number;
  week_hours: number;
  week_cost: number;
  budget: number;
  over_budget: boolean;
  average_rate: number;
}

interface ForecastRecord {
  id: string;
  week_start: string;
  productivity?: number;
  days?: Record<string, number>;
}

export default function ForecastPage() {
  const { company, isManager } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const money = useMoney();
  const tz = company?.timezone || "America/Los_Angeles";
  const currentWeek = weekStart(todayIn(tz), Number(company?.week_start ?? "1"));
  const [anchor, setAnchor] = useState(currentWeek);
  const [covers, setCovers] = useState<string[]>(Array(7).fill(""));
  const [productivity, setProductivity] = useState("16");
  const [locationId, setLocationId] = useState("");
  const [savedForecast, setSavedForecast] = useState<ForecastRecord | null>(null);
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);

  useEffect(() => {
    if (!isManager) return;
    getLocations().then(setLocations).catch(() => {});
  }, [isManager]);

  const load = useCallback(async () => {
    if (!isManager) return;
    try {
      const record = (await getForecast(anchor)) as ForecastRecord | null;
      const daysRecord = record?.days || {};
      setCovers(
        Array.from({ length: 7 }, (_, index) => {
          const value = daysRecord[addDaysStr(anchor, index)];
          return value === undefined || value === null ? "" : String(value);
        }),
      );
      if (record?.productivity) setProductivity(String(record.productivity));
      setSavedForecast(record);
      setResult(null);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [anchor, isManager]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!loading && !isManager) router.replace("/");
  }, [loading, isManager, router]);

  function coversPayload(): Record<string, number> {
    const payload: Record<string, number> = {};
    covers.forEach((raw, index) => {
      const value = Number(raw);
      if (Number.isFinite(value) && value > 0) payload[addDaysStr(anchor, index)] = value;
    });
    return payload;
  }

  async function upsertForecast() {
    if (!company) return "";
    const payload = {
      company: company.id,
      week_start: anchor,
      location: "",
      days: coversPayload(),
      productivity: Number(productivity) || 16,
      break_minutes: 30,
    };
    if (savedForecast) {
      await pb.collection("demand_forecasts").update(savedForecast.id, payload);
      return savedForecast.id;
    }
    const created = await pb.collection("demand_forecasts").create<{ id: string }>(payload);
    setSavedForecast(created as ForecastRecord);
    return created.id;
  }

  async function saveForecast() {
    setBusy(true);
    setError("");
    try {
      await upsertForecast();
      toast("Demand saved for " + formatDate(anchor, "UTC") + ".");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function recommend() {
    setBusy(true);
    setError("");
    try {
      await upsertForecast();
      const payload = await pb.send<RecommendationResult>("/api/openroster/demand/recommend", {
        method: "POST",
        body: { week_start: anchor, covers: coversPayload(), productivity: Number(productivity) || 16 },
      });
      setResult(payload);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function applyForecast() {
    setBusy(true);
    setError("");
    try {
      const res = await pb.send<{ created: number; replaced: boolean; skipped_reason?: string }>("/api/openroster/demand/apply", {
        method: "POST",
        body: {
          week_start: anchor,
          location: locationId || undefined,
          covers: coversPayload(),
          productivity: Number(productivity) || 16,
          replace: true,
          offsets: tzOffsets(anchor, tz),
        },
      });
      if (res.skipped_reason === "already_forecasted") {
        toast("A forecast already exists; use Recommend first to recompute it.", "info");
      } else {
        toast(`Created ${res.created} draft shifts. Nothing publishes until you approve it on the Schedule.`);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!isManager) {
    if (loading) return <Spinner label="Loading forecast…" />;
    return <EmptyState title="Manager only" description="Demand forecasting needs a manager account." />;
  }
  if (loading) return <Spinner label="Loading forecast…" />;

  const days = Array.from({ length: 7 }, (_, index) => addDaysStr(anchor, index));
  const hasCovers = covers.some((value) => Number(value) > 0);

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Roster"
        title="Demand forecast"
        description="Enter expected covers per day; the recommendation sizes draft shifts for the week. Nothing publishes automatically."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={saveForecast} loading={busy} disabled={!hasCovers}>
              <Save className="size-3.5" /> Save
            </Button>
            <Button variant="outline" size="sm" onClick={() => void recommend()} loading={busy} disabled={!hasCovers}>
              <Lightbulb className="size-3.5" /> Recommend
            </Button>
            {result && (
              <Button size="sm" onClick={() => void applyForecast()} loading={busy}>
                <Sparkles className="size-3.5" /> Create draft shifts
              </Button>
            )}
          </>
        }
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <Label>Week starting</Label>
          <Input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="w-48">
          <Label>Covers per person / 8h shift</Label>
          <Input type="number" min={1} value={productivity} onChange={(e) => setProductivity(e.target.value)} className="h-9" />
        </div>
        <div className="w-44">
          <Label>Location (applied shifts)</Label>
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="h-9">
            <option value="">No location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((date, index) => (
          <div key={date} className="panel p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
              {weekdayShort(date)} {Number(date.slice(8))}
            </p>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="Covers"
              value={covers[index] ?? ""}
              onChange={(e) => {
                const next = [...covers];
                next[index] = e.target.value;
                setCovers(next);
              }}
              className="mt-1.5"
            />
          </div>
        ))}
      </div>

      {result && (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard label="People needed" value={result.week_headcount} icon={<CalendarClock className="size-4" />} tone="sage" />
            <StatCard label="Recommended hours" value={hours(result.week_hours)} icon={<CalendarClock className="size-4" />} tone="sage" />
            <StatCard label="Cost at average rate" value={money(result.week_cost)} icon={<CalendarClock className="size-4" />} tone={result.over_budget ? "accent" : "sage"} />
            <StatCard
              label={result.over_budget ? "Over labor budget" : "Labor budget"}
              value={money(result.budget)}
              hint={result.over_budget ? "Trim covers or raise productivity" : "Within budget"}
              icon={<TriangleAlert className="size-4" />}
              tone={result.over_budget ? "accent" : "sage"}
            />
          </div>
          <div className="panel-raised overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <p className="text-sm font-semibold">Why this coverage</p>
              <p className="mt-0.5 text-xs text-muted">
                {formatDate(anchor, "UTC")} – {formatDate(addDaysStr(anchor, 6), "UTC")} · {result.productivity} covers per person per 8h shift
              </p>
            </div>
            <div className="divide-y divide-line">
              {result.days.map((day) => (
                <div key={day.date} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="w-36 shrink-0">
                    <p className="text-xs font-medium">{weekdayShort(day.date)} {Number(day.date.slice(8))}</p>
                    <p className="text-[10px] text-muted">{day.covers} covers</p>
                  </div>
                  <div className="flex flex-1 flex-wrap items-baseline gap-x-4 gap-y-1">
                    <Badge tone={day.headcount ? "sage" : "neutral"}>{day.headcount} people</Badge>
                    <span className="font-mono text-[11px] tabular text-muted">{hours(day.hours)} · {money(day.cost)}</span>
                    <p className="text-[11px] text-muted">{day.explanation}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
