"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  CalendarRange,
  ChevronDown,
  Download,
  FileText,
  Play,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { pb } from "@/lib/pb";
import { useAuth } from "@/lib/auth";
import {
  errorMessage,
  getEmployees,
  getPayPeriods,
  getPayRuns,
  getPayRules,
  getPayStubs,
  getTimesheets,
} from "@/lib/data";
import type { Employee, PayPeriod, PayRule, PayRun, PayStub, PayrollPreview, Timesheet } from "@/lib/types";
import {
  addDaysStr,
  formatDate,
  monthDay,
  todayIn,
  weekStart,
} from "@/lib/dates";
import { fullName, hours, titleCase } from "@/lib/format";
import { useMoney } from "@/lib/currency";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Modal,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  Tabs,
} from "@/components/ui";
import { useToast } from "@/lib/toast";
import { downloadCsv } from "@/lib/csv";

export default function PayrollPage() {
  const { company, isManager } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const money = useMoney();
  const tz = company?.timezone || "America/Los_Angeles";
  const today = todayIn(tz);
  const defaultStart = weekStart(today, Number(company?.week_start ?? "1"));
  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(addDaysStr(defaultStart, 6));
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [preview, setPreview] = useState<PayrollPreview | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [runs, setRuns] = useState<PayRun[]>([]);
  const [rules, setRules] = useState<PayRule[]>([]);
  const [sheets, setSheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"current" | "history" | "rules">("current");
  const [detailRun, setDetailRun] = useState<PayRun | null>(null);
  const [detailStubs, setDetailStubs] = useState<PayStub[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadPeriods = useCallback(async () => {
    const rows = await getPayPeriods();
    setPeriods(rows);
    const open = rows.find((period) => period.status === "open" && period.period_start.slice(0, 10) <= today && period.period_end.slice(0, 10) >= today);
    const current = open || rows.find((period) => period.period_start.slice(0, 10) <= today && period.period_end.slice(0, 10) >= today) || rows[0];
    if (current) {
      setSelectedPeriodId(current.id);
      setPeriodStart(current.period_start.slice(0, 10));
      setPeriodEnd(current.period_end.slice(0, 10));
    }
  }, [today]);

  useEffect(() => {
    if (!isManager) return;
    loadPeriods().catch((err) => setError(errorMessage(err)));
  }, [isManager, loadPeriods]);

  const load = useCallback(async () => {
    try {
      const [emps, history, payRules, previewRes, sheetsRes] = await Promise.all([
        getEmployees(),
        getPayRuns(),
        getPayRules(),
        pb.send<PayrollPreview>("/api/openroster/payroll/preview", {
          method: "POST",
          body: { period_start: periodStart, period_end: periodEnd },
        }),
        getTimesheets({
          periodStart: `${periodStart} 00:00:00.000Z`,
          periodEnd: `${periodEnd} 23:59:59.999Z`,
        }),
      ]);
      setEmployees(emps);
      setRuns(history);
      setRules(payRules);
      setPreview(previewRes);
      setSheets(sheetsRes);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd]);

  useEffect(() => {
    if (!isManager) return;
    void load();
  }, [load, isManager]);

  const employeeById = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const e of employees) map.set(e.id, e);
    return map;
  }, [employees]);

  const approvedCount = sheets.filter((s) => s.status === "approved" || s.status === "paid").length;
  const pendingCount = sheets.filter((s) => s.status !== "approved" && s.status !== "paid").length;
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId);

  async function generatePeriods() {
    setBusy(true);
    try {
      const year = new Date().getUTCFullYear();
      const result = await pb.send<{ created: number; generated: number }>("/api/openroster/pay_periods/generate", {
        method: "POST",
        body: { from: `${year}-01-01`, to: `${year + 1}-12-31` },
      });
      await loadPeriods();
      toast(result.created ? `Created ${result.created} pay periods.` : "Pay periods are already up to date.", "info");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function runPayroll() {
    setBusy(true);
    try {
      const res = await pb.send<PayrollPreview>("/api/openroster/payroll/run", {
        method: "POST",
        body: { period_start: periodStart, period_end: periodEnd },
      });
      await load();
      toast(`Draft pay run created for ${res.totals.employees} people.`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function setRunStatus(run: PayRun, status: "approved" | "paid") {
    setBusy(true);
    try {
      await pb.send("/api/openroster/payroll/status", {
        method: "POST",
        body: { run: run.id, status },
      });
      await Promise.all([load(), loadPeriods()]);
      toast(`Pay run marked ${status}.`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function voidRun(run: PayRun) {
    const reason = window.prompt("Why is this pay run being voided? This keeps the stubs and timesheets for the audit trail.")
    if (!reason) return
    setBusy(true)
    try {
      await pb.collection("pay_runs").update(run.id, {
        status: "voided",
        void_reason: reason,
        voided_at: new Date().toISOString(),
      })
      await load()
      toast("Pay run voided. Its stubs and timesheets remain for the audit trail.")
    } catch (err) {
      toast(errorMessage(err), "error")
    } finally {
      setBusy(false)
    }
  }

  async function openRun(run: PayRun) {
    setDetailRun(run);
    try {
      setDetailStubs(await getPayStubs(run.id));
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  if (!isManager) {
    return (
      <div className="panel p-8 text-center">
        <p className="text-sm font-semibold">Manager access required</p>
        <p className="mt-1 text-sm text-muted">Payroll is restricted to managers and administrators.</p>
      </div>
    );
  }

  if (loading) return <Spinner label="Building payroll preview…" />;

  const totals = preview?.totals;
  const employerCost = (totals?.gross || 0) + (preview?.stubs.reduce((s, x) => s + x.employer_taxes, 0) || 0);

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Pay"
        title="Payroll"
        description="Turn approved hours into a draft pay run. No tax filing, no surprises."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={generatePeriods} loading={busy}>
              <CalendarRange className="size-3.5" /> Periods
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCsv(`pay-preview-${periodStart}.csv`, (preview?.stubs || []).map((stub) => {
                const employee = employeeById.get(stub.employee);
                return {
                  employee: fullName(employee),
                  regular_hours: stub.regular_hours,
                  overtime_hours: stub.overtime_hours,
                  pto_hours: stub.pto_hours,
                  gross_pay: stub.gross_pay,
                  employee_taxes: stub.employee_taxes,
                  employee_deductions: stub.employee_deductions,
                  net_pay: stub.net_pay,
                };
              }))}
              disabled={!preview?.stubs.length}
            >
              <Download className="size-3.5" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={load} loading={busy}>
              <Play className="size-3.5" /> Recalculate
            </Button>
            <Button size="sm" onClick={runPayroll} loading={busy} disabled={!preview?.stubs.length || !selectedPeriod || selectedPeriod.status === "closed"}>
              <Download className="size-3.5" /> Create draft run
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-4 rounded-xl border border-[#eccac4] bg-[#f9eeec] px-4 py-3 text-sm text-[#8e342b]">
          {error}
        </div>
      )}

      {periods.length ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-[1.6fr_1fr_auto] sm:items-end">
          <div>
            <label className="label mb-1.5 block">Pay period</label>
            <Select
              value={selectedPeriodId}
              onChange={(e) => {
                const period = periods.find((p) => p.id === e.target.value);
                setSelectedPeriodId(e.target.value);
                if (period) {
                  setPeriodStart(period.period_start.slice(0, 10));
                  setPeriodEnd(period.period_end.slice(0, 10));
                }
              }}
            >
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {monthDay(period.period_start.slice(0, 10))} – {monthDay(period.period_end.slice(0, 10))} · {period.status}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="label mb-1.5 block">Pay date</label>
            <div className="field flex items-center text-sm text-muted">
              {selectedPeriod?.pay_date ? formatDate(selectedPeriod.pay_date, "UTC") : "—"}
            </div>
          </div>
          <div className="flex items-center gap-2 pb-0.5">
            <Badge tone={pendingCount ? "warning" : "success"}>
              {approvedCount} approved · {pendingCount} pending
            </Badge>
            {selectedPeriod?.status === "closed" && <Badge tone="neutral">Closed</Badge>}
          </div>
        </div>
      ) : (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <div>
            <p className="text-sm font-semibold">No pay periods yet</p>
            <p className="text-xs text-muted">Generate a calendar from the company pay frequency ({company?.pay_frequency || "biweekly"}).</p>
          </div>
          <Button size="sm" onClick={generatePeriods} loading={busy}>
            <CalendarRange className="size-3.5" /> Generate pay periods
          </Button>
        </div>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "current", label: "Current period" },
          { value: "history", label: "Pay runs", count: runs.length },
          { value: "rules", label: "Pay rules", count: rules.length },
        ]}
      />

      {tab === "current" && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="People paid" value={totals?.employees || 0} hint="Approved timesheets + salaried" icon={<Wallet className="size-4" />} tone="neutral" />
            <StatCard label="Gross pay" value={money(totals?.gross)} hint="Before withholdings" tone="sage" />
            <StatCard label="Employee taxes" value={money(totals?.taxes)} hint={`${money(totals?.deductions)} deductions`} tone="accent" />
            <StatCard label="Net pay" value={money(totals?.net)} hint={`Employer cost ${money(employerCost)}`} tone="gold" />
          </div>

          <div className="mt-5 panel-raised overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-sm font-semibold">Pay preview</p>
                <p className="mt-0.5 text-xs text-muted">
                  {monthDay(periodStart)} – {monthDay(periodEnd)} · {preview?.stubs.length || 0} stubs
                </p>
              </div>
              {pendingCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-[#82621c]">
                  <AlertTriangle className="size-3.5" /> {pendingCount} timesheets excluded
                </span>
              )}
            </div>

            {!preview?.stubs.length ? (
              <div className="p-6">
                <EmptyState
                  icon={<FileText className="size-5" />}
                  title="Nothing to pay yet"
                  description="Approve timesheets for this period first, then recalculate. Salaried staff are included automatically."
                  action={
                    <Button variant="outline" size="sm" onClick={() => router.push("/timesheets")}>
                      Go to timesheets
                    </Button>
                  }
                />
              </div>
            ) : (
              <>
                <div className="hidden grid-cols-[1.6fr_0.9fr_repeat(4,0.8fr)_0.5fr] items-center gap-3 border-b border-line bg-[#f7f4ec] px-5 py-2.5 lg:grid">
                  <span className="table-head">Employee</span>
                  <span className="table-head text-right">Hours</span>
                  <span className="table-head text-right">Gross</span>
                  <span className="table-head text-right">Taxes</span>
                  <span className="table-head text-right">Deductions</span>
                  <span className="table-head text-right">Net</span>
                  <span />
                </div>
                <div className="divide-y divide-line">
                  {preview.stubs.map((stub) => {
                    const emp = employeeById.get(stub.employee);
                    const totalHours = stub.regular_hours + stub.overtime_hours + stub.pto_hours;
                    const open = expanded === stub.employee;
                    return (
                      <div key={stub.employee}>
                        <button
                          onClick={() => setExpanded(open ? null : stub.employee)}
                          className="grid w-full grid-cols-2 items-center gap-3 px-5 py-3 text-left transition hover:bg-black/[0.02] lg:grid-cols-[1.6fr_0.9fr_repeat(4,0.8fr)_0.5fr]"
                        >
                          <div className="col-span-2 flex items-center gap-2.5 lg:col-span-1">
                            <Avatar name={fullName(emp)} id={stub.employee} size="sm" />
                            <div>
                              <p className="text-xs font-semibold">{fullName(emp)}</p>
                              <p className="text-[10px] text-muted">{emp?.expand?.position?.name || titleCase(emp?.pay_type || "")}</p>
                            </div>
                          </div>
                          <span className="text-right font-mono text-xs tabular text-muted">{hours(totalHours)}</span>
                          <span className="text-right font-mono text-xs tabular">{money(stub.gross_pay)}</span>
                          <span className="text-right font-mono text-xs tabular text-muted">{money(stub.employee_taxes)}</span>
                          <span className="text-right font-mono text-xs tabular text-muted">{money(stub.employee_deductions)}</span>
                          <span className="text-right font-mono text-xs font-semibold tabular">{money(stub.net_pay)}</span>
                          <ChevronDown className={`ml-auto size-3.5 text-muted transition ${open ? "rotate-180" : ""}`} />
                        </button>
                        {open && (
                          <div className="border-t border-line bg-[#faf8f2] px-5 py-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div>
                                <p className="eyebrow mb-2">Earnings</p>
                                <Line label="Regular" value={money(stub.regular_pay)} hint={`${hours(stub.regular_hours)}`} />
                                <Line label="Overtime" value={money(stub.overtime_pay)} hint={`${hours(stub.overtime_hours)}`} />
                                <Line label="PTO" value={money(stub.pto_pay)} hint={`${hours(stub.pto_hours)}`} />
                              </div>
                              <div>
                                <p className="eyebrow mb-2">Withholdings</p>
                                {stub.breakdown.filter((l) => !l.employer).map((line) => (
                                  <Line key={line.name} label={line.name} value={`− ${money(line.amount)}`} hint={line.calc === "percent" ? `${line.rate}%` : line.calc.replaceAll("_", " ")} />
                                ))}
                                {stub.breakdown.filter((l) => l.employer).length > 0 && (
                                  <p className="mt-2 text-[10px] text-muted">
                                    Employer contributions: {money(stub.breakdown.filter((l) => l.employer).reduce((s, l) => s + l.amount, 0))}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between border-t border-line bg-[#f7f4ec] px-5 py-3">
                  <span className="text-xs text-muted">Draft only — nothing is filed or paid automatically.</span>
                  <Button size="sm" onClick={runPayroll} loading={busy}>
                    <Download className="size-3.5" /> Create draft run
                  </Button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {tab === "history" && (
        <div className="mt-5 panel-raised overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <p className="text-sm font-semibold">Pay runs</p>
            <p className="mt-0.5 text-xs text-muted">Draft, approved and paid periods.</p>
          </div>
          {runs.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={<Wallet className="size-5" />} title="No pay runs yet" description="Create a draft from the current period." />
            </div>
          ) : (
            <div className="divide-y divide-line">
              {runs.map((run) => (
                <div key={run.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold">{formatDate(run.period_start, "UTC")} – {formatDate(run.period_end, "UTC")}</p>
                      <Badge tone={run.status === "paid" ? "success" : run.status === "approved" ? "sage" : run.status === "voided" ? "neutral" : "warning"}>{run.status}</Badge>
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {run.pay_date ? `Pay date ${formatDate(run.pay_date, "UTC")} · ` : ""}Net {money(run.total_net)} · Gross {money(run.total_gross)}
                      {run.void_reason ? ` · ${run.void_reason}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => void openRun(run)}>View</Button>
                    {run.status === "draft" && (
                      <Button variant="outline" size="sm" onClick={() => setRunStatus(run, "approved")} loading={busy}>Approve</Button>
                    )}
                    {run.status === "approved" && (
                      <Button size="sm" onClick={() => setRunStatus(run, "paid")} loading={busy}><ShieldCheck className="size-3.5" /> Mark paid</Button>
                    )}
                    {run.status !== "voided" && (
                      <Button variant="ghost" size="sm" onClick={() => void voidRun(run)} disabled={busy}>
                        <Ban className="size-3.5" /> Void
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "rules" && (
        <div className="mt-5 panel-raised overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <p className="text-sm font-semibold">Pay rules</p>
              <p className="mt-0.5 text-xs text-muted">Configured rates, not a tax engine. Adjust in Settings.</p>
            </div>
            <Badge tone="gold">{rules.filter((r) => r.active).length} active</Badge>
          </div>
          <div className="divide-y divide-line">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1">
                  <p className="text-xs font-medium">{rule.name}</p>
                  <p className="text-[10px] text-muted">{titleCase(rule.type)} · {rule.calc.replaceAll("_", " ")} · {rule.employer ? "employer" : "employee"}</p>
                </div>
                <span className="font-mono text-xs tabular">{rule.calc === "percent" ? `${rule.rate}%` : money(rule.rate)}</span>
                <Badge tone={rule.active ? "success" : "neutral"}>{rule.active ? "Active" : "Off"}</Badge>
              </div>
            ))}
            {rules.length === 0 && <p className="px-5 py-8 text-center text-xs text-muted">No pay rules configured.</p>}
          </div>
        </div>
      )}

      <Modal
        open={!!detailRun}
        onClose={() => setDetailRun(null)}
        title="Pay run"
        description={detailRun ? `${formatDate(detailRun.period_start, "UTC")} – ${formatDate(detailRun.period_end, "UTC")} · ${detailRun.status}` : ""}
        width="lg"
      >
        {detailRun && (
          <div>
            <div className="mb-3 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCsv(`pay-stubs-${detailRun.id}.csv`, detailStubs.map((stub) => ({
                  run_id: detailRun.id,
                  run_status: detailRun.status,
                  employee_ref: stub.employee,
                  employee_name: fullName(stub.expand?.employee),
                  period_start: detailRun.period_start,
                  period_end: detailRun.period_end,
                  pay_date: detailRun.pay_date || "",
                  currency: company?.currency || "USD",
                  regular_hours: stub.regular_hours || 0,
                  overtime_hours: stub.overtime_hours || 0,
                  pto_hours: stub.pto_hours || 0,
                  gross_pay: stub.gross_pay || 0,
                  employee_taxes: stub.employee_taxes || 0,
                  employee_deductions: stub.employee_deductions || 0,
                  employer_taxes: stub.employer_taxes || 0,
                  net_pay: stub.net_pay || 0,
                })))}
                disabled={!detailStubs.length}
              >
                <Download className="size-3.5" /> Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!detailStubs.length}
                onClick={() => {
                  const payload = {
                    contract_version: 1,
                    generated_at: new Date().toISOString(),
                    run: {
                      id: detailRun.id,
                      status: detailRun.status,
                      period_start: detailRun.period_start,
                      period_end: detailRun.period_end,
                      pay_date: detailRun.pay_date || "",
                      void_reason: detailRun.void_reason || "",
                    },
                    currency: company?.currency || "USD",
                    totals: {
                      gross: detailRun.total_gross,
                      employee_taxes: detailRun.total_tax,
                      employee_deductions: detailRun.total_deductions,
                      net: detailRun.total_net,
                    },
                    payments: detailStubs.map((stub) => ({
                      employee_ref: stub.employee,
                      employee_name: fullName(stub.expand?.employee),
                      hours: {
                        regular: stub.regular_hours || 0,
                        overtime: stub.overtime_hours || 0,
                        pto: stub.pto_hours || 0,
                      },
                      pay: {
                        regular: stub.regular_pay || 0,
                        overtime: stub.overtime_pay || 0,
                        pto: stub.pto_pay || 0,
                        gross: stub.gross_pay || 0,
                        employee_taxes: stub.employee_taxes || 0,
                        employee_deductions: stub.employee_deductions || 0,
                        employer_taxes: stub.employer_taxes || 0,
                        net: stub.net_pay || 0,
                      },
                      lines: stub.breakdown || [],
                    })),
                  };
                  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = `pay-run-${detailRun.id}.json`;
                  link.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <FileText className="size-3.5" /> Export JSON
              </Button>
            </div>
            <div className="grid grid-cols-4 gap-3 rounded-xl bg-[#f2eee3] p-4">
              {[
                ["Gross", money(detailRun.total_gross)],
                ["Taxes", money(detailRun.total_tax)],
                ["Deductions", money(detailRun.total_deductions)],
                ["Net", money(detailRun.total_net)],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="eyebrow">{label}</p>
                  <p className="mt-1 text-lg font-semibold tabular">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 divide-y divide-line rounded-xl border border-line">
              {detailStubs.map((stub) => (
                <div key={stub.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-xs font-medium">{fullName(stub.expand?.employee)}</p>
                    <p className="text-[10px] text-muted">{hours((stub.regular_hours || 0) + (stub.overtime_hours || 0) + (stub.pto_hours || 0))}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xs">{money(stub.net_pay)}</p>
                    <p className="text-[10px] text-muted">net · {money(stub.gross_pay)} gross</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Line({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-line/70 py-1 text-xs last:border-0">
      <span className="text-muted">{label}{hint ? ` · ${hint}` : ""}</span>
      <span className="font-mono tabular">{value}</span>
    </div>
  );
}
