"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  RefreshCw,
} from "lucide-react";
import { pb } from "@/lib/pb";
import { useAuth } from "@/lib/auth";
import {
  errorMessage,
  getTimesheetEntries,
  getTimesheets,
} from "@/lib/data";
import type { Timesheet, TimesheetEntry } from "@/lib/types";
import {
  addDaysStr,
  formatDate,
  monthDay,
  todayIn,
  weekStart,
} from "@/lib/dates";
import { fullName, hours, money, titleCase } from "@/lib/format";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Modal,
  PageHeader,
  Spinner,
  StatCard,
  Tabs,
} from "@/components/ui";
import { useToast } from "@/lib/toast";

export default function TimesheetsPage() {
  const { company, user, employee, isManager } = useAuth();
  const toast = useToast();
  const tz = company?.timezone || "America/Los_Angeles";
  const today = todayIn(tz);
  const [anchor, setAnchor] = useState(today);
  const start = weekStart(anchor, Number(company?.week_start ?? "1"));
  const end = addDaysStr(start, 6);

  const [sheets, setSheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "approved" | "paid">("all");
  const [entriesFor, setEntriesFor] = useState<Timesheet | null>(null);
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);

  const load = useCallback(async () => {
    if (!company) return;
    try {
      const rows = await getTimesheets({
        employee: isManager ? undefined : employee?.id,
        periodStart: `${start} 00:00:00.000Z`,
        periodEnd: `${end} 23:59:59.999Z`,
      });
      setSheets(rows);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [company, employee?.id, isManager, start, end]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => (statusFilter === "all" ? sheets : sheets.filter((s) => s.status === statusFilter)),
    [sheets, statusFilter],
  );

  const totals = useMemo(
    () =>
      sheets.reduce(
        (acc, s) => ({
          regular: acc.regular + (s.regular_hours || 0),
          overtime: acc.overtime + (s.overtime_hours || 0),
          pto: acc.pto + (s.pto_hours || 0),
          gross:
            acc.gross +
            (s.regular_hours || 0) * (s.expand?.employee?.pay_rate || 0) +
            (s.overtime_hours || 0) * (s.expand?.employee?.pay_rate || 0) * 1.5 +
            (s.pto_hours || 0) * (s.expand?.employee?.pay_rate || 0),
        }),
        { regular: 0, overtime: 0, pto: 0, gross: 0 },
      ),
    [sheets],
  );

  async function generate() {
    setBusy(true);
    try {
      const res = await pb.send<{ sheets: number }>("/api/openroster/timesheets/generate", {
        method: "POST",
        body: { period_start: start, period_end: end },
      });
      await load();
      toast(res.sheets ? `Generated ${res.sheets} timesheets.` : "No hours found for this week yet.", res.sheets ? "success" : "info");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function approve(sheet: Timesheet) {
    try {
      await pb.collection("timesheets").update(sheet.id, {
        status: "approved",
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
      });
      await load();
      toast(`Approved ${fullName(sheet.expand?.employee)}'s hours.`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function approveAll() {
    const open = sheets.filter((s) => s.status === "open" || s.status === "submitted");
    if (!open.length) return;
    setBusy(true);
    try {
      const result = await pb.send<{ approved: number }>("/api/openroster/timesheets/approve", {
        method: "POST",
        body: { ids: open.map((s) => s.id) },
      })
      await load()
      toast(`Approved ${result.approved} timesheet${result.approved === 1 ? "" : "s"}.`)
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function openEntries(sheet: Timesheet) {
    setEntriesFor(sheet);
    try {
      setEntries(await getTimesheetEntries(sheet.id));
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  if (loading) return <Spinner label="Loading timesheets…" />;

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Time & attendance"
        title="Timesheets"
        description={
          isManager
            ? "Review punches and scheduled hours, then approve the week for payroll."
            : "Your hours, straight from the clock. Your manager approves them before payday."
        }
        actions={
          isManager ? (
            <>
              <Button variant="outline" size="sm" onClick={generate} loading={busy}>
                <RefreshCw className="size-3.5" /> Generate from punches
              </Button>
              <Button size="sm" onClick={approveAll} disabled={busy}>
                <Check className="size-3.5" /> Approve all
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setAnchor(addDaysStr(start, -7))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(today)}>This week</Button>
          <Button variant="outline" size="icon" onClick={() => setAnchor(addDaysStr(start, 7))}>
            <ChevronRight className="size-4" />
          </Button>
          <div className="ml-1">
            <p className="text-sm font-semibold">{monthDay(start)} – {monthDay(end)}</p>
            <p className="text-[10px] text-muted">Pay period week · {tz.replace("_", " ")}</p>
          </div>
        </div>
        <Badge tone={sheets.some((s) => s.status === "open" || s.status === "submitted") ? "warning" : "success"}>
          {sheets.filter((s) => s.status === "open" || s.status === "submitted").length} awaiting approval
        </Badge>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-[#eccac4] bg-[#f9eeec] px-4 py-3 text-sm text-[#8e342b]">
          {error}
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Regular hours" value={hours(totals.regular)} icon={<ClipboardCheck className="size-4" />} tone="neutral" />
        <StatCard label="Overtime" value={hours(totals.overtime)} icon={<ClipboardCheck className="size-4" />} tone="accent" />
        <StatCard label="Paid time off" value={hours(totals.pto)} icon={<ClipboardCheck className="size-4" />} tone="gold" />
        <StatCard label="Estimated gross" value={money(totals.gross)} hint="Before tax and deductions" tone="sage" />
      </div>

      <Tabs
        value={statusFilter}
        onChange={setStatusFilter}
        tabs={[
          { value: "all", label: "All", count: sheets.length },
          { value: "open", label: "Open", count: sheets.filter((s) => s.status === "open").length },
          { value: "approved", label: "Approved", count: sheets.filter((s) => s.status === "approved").length },
          { value: "paid", label: "Paid", count: sheets.filter((s) => s.status === "paid").length },
        ]}
      />

      <div className="mt-4 panel-raised overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<FileText className="size-5" />}
              title="No timesheets for this week"
              description={
                isManager
                  ? "Generate timesheets from punches and scheduled shifts to get started."
                  : "Your manager has not generated timesheets for this week yet."
              }
              action={isManager ? <Button size="sm" onClick={generate} loading={busy}><RefreshCw className="size-3.5" /> Generate</Button> : undefined}
            />
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[1.6fr_repeat(4,0.7fr)_0.9fr_1fr] items-center gap-3 border-b border-line bg-[#f7f4ec] px-5 py-2.5 md:grid">
              <span className="table-head">Employee</span>
              <span className="table-head text-right">Regular</span>
              <span className="table-head text-right">Overtime</span>
              <span className="table-head text-right">PTO</span>
              <span className="table-head text-right">Total</span>
              <span className="table-head">Status</span>
              <span className="table-head text-right">Action</span>
            </div>
            <div className="divide-y divide-line">
              {filtered.map((sheet) => {
                const emp = sheet.expand?.employee;
                return (
                  <div key={sheet.id} className="grid grid-cols-2 items-center gap-3 px-5 py-3 md:grid-cols-[1.6fr_repeat(4,0.7fr)_0.9fr_1fr]">
                    <div className="col-span-2 flex items-center gap-2.5 md:col-span-1">
                      <Avatar name={fullName(emp)} id={sheet.employee} size="sm" />
                      <div>
                        <p className="text-xs font-semibold">{fullName(emp)}</p>
                        <p className="text-[10px] text-muted">{emp?.expand?.position?.name || titleCase(emp?.pay_type || "")}</p>
                      </div>
                    </div>
                    <Metric label="Regular" value={hours(sheet.regular_hours)} />
                    <Metric label="Overtime" value={hours(sheet.overtime_hours)} />
                    <Metric label="PTO" value={hours(sheet.pto_hours)} />
                    <Metric label="Total" value={hours(sheet.total_hours)} strong />
                    <div>
                      <Badge tone={sheet.status === "approved" || sheet.status === "paid" ? "success" : sheet.status === "open" ? "warning" : "neutral"}>
                        {sheet.status}
                      </Badge>
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-1.5 md:col-span-1">
                      <Button variant="ghost" size="sm" onClick={() => openEntries(sheet)}>
                        Details
                      </Button>
                      {isManager && (sheet.status === "open" || sheet.status === "submitted") && (
                        <Button size="sm" onClick={() => approve(sheet)}>
                          <Check className="size-3.5" /> Approve
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <Modal
        open={!!entriesFor}
        onClose={() => setEntriesFor(null)}
        title="Timesheet detail"
        description={entriesFor ? `${fullName(entriesFor.expand?.employee)} · ${formatDate(entriesFor.period_start, "UTC")} – ${formatDate(entriesFor.period_end, "UTC")}` : ""}
        width="lg"
      >
        {entriesFor && (
          <div>
            <div className="grid grid-cols-4 gap-3 rounded-xl bg-[#f2eee3] p-4">
              {[
                ["Regular", hours(entriesFor.regular_hours)],
                ["Overtime", hours(entriesFor.overtime_hours)],
                ["PTO", hours(entriesFor.pto_hours)],
                ["Total", hours(entriesFor.total_hours)],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="eyebrow">{label}</p>
                  <p className="mt-1 text-lg font-semibold tabular">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-line">
              <div className="grid grid-cols-[1.2fr_repeat(3,0.8fr)_1.2fr] gap-2 border-b border-line bg-[#f7f4ec] px-4 py-2">
                <span className="table-head">Date</span>
                <span className="table-head text-right">Regular</span>
                <span className="table-head text-right">OT</span>
                <span className="table-head text-right">PTO</span>
                <span className="table-head">Source</span>
              </div>
              {entries.map((entry) => (
                <div key={entry.id} className="grid grid-cols-[1.2fr_repeat(3,0.8fr)_1.2fr] gap-2 border-b border-line px-4 py-2 text-xs last:border-0">
                  <span>{formatDate(entry.date, "UTC")}</span>
                  <span className="text-right tabular">{hours(entry.regular_hours)}</span>
                  <span className="text-right tabular">{hours(entry.overtime_hours)}</span>
                  <span className="text-right tabular">{hours(entry.pto_hours)}</span>
                  <span className="text-muted">{entry.note || "—"}</span>
                </div>
              ))}
              {entries.length === 0 && <p className="px-4 py-6 text-center text-xs text-muted">No daily entries.</p>}
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-muted">
              <span>Status: <span className="font-medium capitalize text-ink">{entriesFor.status}</span></span>
              {entriesFor.approved_by && <span>Approved by {entriesFor.expand?.approved_by?.name || "manager"}</span>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="text-right">
      <span className="mb-0.5 block text-[9px] uppercase tracking-wider text-muted md:hidden">{label}</span>
      <span className={`font-mono text-xs tabular ${strong ? "font-semibold text-ink" : "text-muted"}`}>{value}</span>
    </div>
  );
}
